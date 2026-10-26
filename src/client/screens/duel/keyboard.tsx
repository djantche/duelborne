// Jouer au clavier : un curseur parcourt la main, le terrain, les zones proposées et les piles avec les flèches ;
// Entrée ou Espace agit comme un clic sur l'élément désigné. Raccourcis de phase et fenêtre d'aide (« ? »).
// Le curseur est une classe posée sur l'élément, pas le focus du navigateur : le terrain est reconstruit à chaque état,
// le curseur le retrouve par son identité (uid de la carte, zone, pile).
import type { JSX } from 'preact'
import { redraw } from '../../app/render.ts'
import { store } from '../../app/store.ts'
import { t } from '../../i18n.ts'
import { IconButton } from '../../ui/Button.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { chooseOptionById, confirmAttack, inspectCard, openLog, sendPick } from './controller.ts'
import { activePrompt, isTargeting } from './prompt.ts'
import { duel } from './state.ts'

const TARGETS = '#app .hand.me .card[data-uid], #app #mat .card[data-uid], #app #mat .zone.placeable, #app #mat .zone.pile'
const CURSOR = 'kbd-cursor'
let current: string | null = null

const onDuel = (): boolean => store.screen === 'duel' || store.screen === 'replay'
const keyOf = (el: HTMLElement): string => el.matches('.zone.pile') ? `pile:${el.dataset.side}:${el.dataset.pile}` : el.dataset.uid ? `card:${el.dataset.uid}` : `zone:${el.dataset.zk}`

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'
}

/** Les cartes du dessus des piles se désignent par leur pile : un seul arrêt par pile. */
function targets(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(TARGETS)].filter((el) => (el.matches('.zone.pile') || !el.closest('.pile')) && visible(el))
}

const find = (key: string | null): HTMLElement | null => key === null ? null : targets().find((el) => keyOf(el) === key) ?? null
const center = (el: HTMLElement): { x: number; y: number } => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }

/** Pose la classe du curseur sur l'élément courant (après chaque redessin du terrain). */
function paint(): void {
  const el = find(current)
  for (const old of document.querySelectorAll(`.${CURSOR}`)) if (old !== el) old.classList.remove(CURSOR)
  el?.classList.add(CURSOR)
}

/** Point de départ : ce que la question en cours propose, sinon le milieu de la main. */
function start(): HTMLElement | null {
  const all = targets()
  const offered = all.find((el) => el.matches('.pickable, .targetable, .placeable, .can'))
  if (offered) return offered
  const hand = all.filter((el) => el.closest('.hand.me'))
  return hand[Math.floor(hand.length / 2)] ?? all[0] ?? null
}

/**
 * Voisin le plus proche dans la direction demandée : d'abord dans un cône de ±50° autour de cette direction,
 * sinon n'importe où de ce côté. L'écart latéral compte double pour rester sur la même rangée.
 */
function neighbour(from: HTMLElement, dx: number, dy: number): HTMLElement | null {
  const a = center(from)
  let best: HTMLElement | null = null
  let score = Infinity
  for (const el of targets()) {
    if (el === from) continue
    const b = center(el)
    const along = (b.x - a.x) * dx + (b.y - a.y) * dy
    if (along <= 6) continue
    const across = Math.abs((b.x - a.x) * dy) + Math.abs((b.y - a.y) * dx)
    const next = along + across * 2 + (across > along * 1.2 ? 10_000 : 0)
    if (next < score) { score = next; best = el }
  }
  return best
}

function select(el: HTMLElement | null): void {
  if (!el) return
  current = keyOf(el)
  document.body.classList.add('kbd-nav')
  paint()
  // La fiche suit le curseur, comme le survol à la souris (sauf fiche épinglée par un clic).
  const card = el.closest<HTMLElement>('[data-card]') ?? el.querySelector<HTMLElement>('[data-card]')
  if (card && !duel.pinned && store.cards.has(Number(card.dataset.card))) {
    duel.focusId = Number(card.dataset.card)
    duel.focusUid = card.dataset.uid ? Number(card.dataset.uid) : null
    redraw()
    paint()
  }
}

/** Clic synthétique au centre : le plateau choisit ses cibles par position (main, zones du tapis incliné). */
function press(el: HTMLElement): void {
  const { x, y } = center(el)
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }))
}

function phase(action: 'toBattle' | 'toMain2' | 'toEnd'): boolean {
  const prompt = activePrompt()
  if (prompt?.kind !== 'idle' && prompt?.kind !== 'battle') return false
  const option = prompt.options.find((o) => o.action === action)
  if (!option) return false
  chooseOptionById(option.id)
  return true
}

function blocked(ev: KeyboardEvent): boolean {
  const target = ev.target as HTMLElement
  return !onDuel() || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || !!store.ask || !!duel.viewer || duel.sheet
    || !!target.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"], .actions')
}

addEventListener('keydown', (ev) => {
  if (ev.key === '?' && onDuel() && !store.ask && !(ev.target as HTMLElement).closest('input, textarea, [contenteditable]')) {
    ev.preventDefault()
    duel.keysHelp = !duel.keysHelp
    redraw()
    return
  }
  if (blocked(ev) || duel.keysHelp) return
  const prompt = activePrompt()
  const aiming = !!duel.direct || (prompt?.kind === 'cards' && isTargeting(prompt))
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const dir = arrows[ev.key]
  // La visée d'une attaque garde ses flèches (cible suivante / précédente) et sa validation.
  if (dir && !aiming) {
    ev.preventDefault()
    const from = find(current)
    select(from ? neighbour(from, dir[0], dir[1]) ?? from : start())
    return
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && !aiming && !(ev.target as HTMLElement).closest('button')) {
    if (ev.key === 'Enter' && ev.shiftKey) { ev.preventDefault(); sendPick(); return }
    const el = find(current)
    if (!el) return
    ev.preventDefault()
    press(el)
    paint()
    return
  }
  if (ev.key === 'Enter' && ev.shiftKey && aiming) { ev.preventDefault(); confirmAttack(); return }
  const key = ev.key.toLowerCase()
  if (key === 'i') {
    const card = find(current)?.closest<HTMLElement>('[data-card]') ?? find(current)?.querySelector<HTMLElement>('[data-card]')
    if (card && store.cards.has(Number(card.dataset.card))) { ev.preventDefault(); inspectCard(Number(card.dataset.card), true) }
  } else if (key === 'b') { if (phase('toBattle')) ev.preventDefault() }
  else if (key === 'm') { if (phase('toMain2')) ev.preventDefault() }
  else if (key === 'e') { if (phase('toEnd')) ev.preventDefault() }
  else if (key === 'j') { ev.preventDefault(); openLog() }
}, true)

// La souris reprend la main : le curseur s'efface jusqu'à la prochaine flèche.
addEventListener('pointerdown', (ev) => {
  if (current === null) return
  current = null
  document.body.classList.remove('kbd-nav')
  for (const old of document.querySelectorAll(`.${CURSOR}`)) old.classList.remove(CURSOR)
}, true)

// Le terrain est reconstruit à chaque état : on repose le curseur une fois par image après les changements.
let frame = 0
new MutationObserver(() => {
  if (current === null || frame) return
  frame = requestAnimationFrame(() => { frame = 0; if (onDuel()) paint() })
}).observe(document.getElementById('app') ?? document.body, { childList: true, subtree: true })

/** Touches (texte littéral ou clé de traduction) et ce qu'elles font. */
const KEYS: [string, string][] = [
  ['← ↑ → ↓', 'keys.move'],
  ['keys.enterSpace', 'keys.act'],
  ['keys.shiftEnter', 'keys.validate'],
  ['I', 'keys.read'],
  ['B', 'keys.battle'],
  ['M', 'keys.main2'],
  ['E', 'keys.end'],
  ['J', 'keys.log'],
  ['keys.escape', 'keys.cancel'],
  ['?', 'keys.help'],
]

/** Fenêtre d'aide des raccourcis (touche « ? »). */
export function KeyboardHelp(): JSX.Element | null {
  if (!duel.keysHelp) return null
  const close = (): void => { duel.keysHelp = false; redraw() }
  return (
    <Modal kind="keys-help" title={t('keys.title')} onBackdrop={close} actions={<IconButton icon="close" label={t('common.close')} onClick={close} />}>
      <dl class="keys-list">
        {KEYS.map(([key, label]) => (
          <div key={label}>
            <dt><kbd>{key.startsWith('keys.') ? t(key) : key}</kbd></dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
