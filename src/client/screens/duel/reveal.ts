// Aperçus de cartes publiques : consultation indépendante du déroulement du duel.
import { cardDom } from '../../ui/Card.tsx'
import { sfx } from '../../ui/audio.ts'
import { descOf, effectText, esc, isMonsterFrame, nameOf } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { t, tx } from '../../i18n.ts'
import { node, play, reducedMotion, sleep } from './anim.ts'
import { CARD_NOTICE_MOTION as M } from './cardNoticeMotion.ts'

interface EffectReference { n: number; label?: string; uid: number | null }
const pending: ClientCard[][] = []
let active: { dispose: () => void } | null = null
const notices = new Set<HTMLElement>()
const effectNotices = new Map<HTMLElement, { dispose: () => void; refresh: () => void }>()
const EFFECT_NOTICE_LIFETIME = 2000
let noticeSerial = 0
const reading = (box: HTMLElement): boolean => box.matches(':hover, :focus-within')

/** Téléphone en paysage (même seuil que les feuilles de style) : les aperçus se rangent dans la marge gauche, hors du tapis. */
const phoneLayout = (): boolean => matchMedia('(max-height: 560px)').matches

export function layoutCardNotices(): void {
  if (!notices.size) return
  const mat = document.getElementById('mat')?.getBoundingClientRect()
  if (phoneLayout()) {
    // En haut à gauche, sous le bouton plein écran, sans tenir compte de la fiche : une information à côté du jeu, jamais devant.
    const corner = document.querySelector('.fs-btn')?.getBoundingClientRect()
    let top = corner && corner.height ? corner.bottom + 6 : 8
    const margin = mat ? mat.left - 8 : 0
    for (const box of notices) {
      box.classList.add('corner')
      box.style.left = 'max(6px, env(safe-area-inset-left))'
      box.style.width = `${Math.round(Math.min(240, Math.max(150, margin)))}px`
      const cards = box.querySelector<HTMLElement>('.notice-cards')!
      cards.style.maxHeight = `${Math.max(64, innerHeight - top - 16)}px`
      const height = box.getBoundingClientRect().height
      box.style.top = `${Math.max(6, Math.min(innerHeight - height - 6, top))}px`
      top += height + 6
    }
    return
  }
  const inspector = document.querySelector('.card-inspector')?.getBoundingClientRect()
  let top = Math.max(mat ? mat.top + 12 : 54, inspector ? inspector.bottom + 8 : 0)
  for (const box of notices) {
    box.classList.remove('corner')
    box.style.width = ''
    const width = box.getBoundingClientRect().width
    box.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, mat ? mat.left + 12 : 8))}px`
    const cards = box.querySelector<HTMLElement>('.notice-cards')!
    cards.style.maxHeight = `${Math.max(64, innerHeight - top - 48)}px`
    const height = box.getBoundingClientRect().height
    box.style.top = `${Math.max(8, Math.min(innerHeight - height - 8, top))}px`
    top += height + 8
  }
}

function removeNotice(box: HTMLElement): void {
  box.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
  notices.delete(box)
  box.remove()
  layoutCardNotices()
}

/** Surface commune, chaque carte révélée est un vrai bouton, y compris dans une révélation groupée. */
function cardNotice(cards: ClientCard[], label: string, effect?: EffectReference & { index: number }): HTMLElement {
  const box = node(`fx-reveal-toast${effect ? ' fx-effect-notice' : ''}`, 'pointer-events:auto;', `<small>${esc(label)}</small><div class="notice-cards"></div>`)
  box.setAttribute('role', 'status')
  box.setAttribute('aria-live', 'polite')
  const list = box.querySelector('.notice-cards')!
  for (const card of cards) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'card-notice'
    button.dataset.card = String(card.id)
    button.setAttribute('aria-label', t(effect ? 'fx.inspectEffectText' : 'fx.inspectRevealed', { card: nameOf(card) }))
    const text = effect ? effectText(descOf(card), effect.n, effect.label ? tx(effect.label) : '', !isMonsterFrame(card)) : ''
    button.innerHTML = `<div class="reveal-thumb"></div><span><b>${esc(nameOf(card))}</b>${effect ? `<p class="effect-excerpt">${esc(text)}</p>` : ''}</span>`
    button.querySelector('.reveal-thumb')!.append(cardDom(card, { size: 'sm' }))
    if (effect) {
      const excerpt = button.querySelector<HTMLElement>('.effect-excerpt')!
      excerpt.id = `card-notice-effect-${++noticeSerial}`
      button.setAttribute('aria-describedby', excerpt.id)
      button.dataset.effectNumber = String(effect.n)
      button.dataset.effectIndex = String(effect.index)
      if (effect.label) button.dataset.effectLabel = effect.label
      if (effect.uid !== null) button.dataset.effectUid = String(effect.uid)
    }
    // La fiche s’ouvre dans le gestionnaire du duel ; repositionner l’aperçu sous sa nouvelle place sur téléphone.
    button.addEventListener('click', () => requestAnimationFrame(() => { if (box.isConnected) layoutCardNotices() }))
    list.append(button)
  }
  notices.add(box)
  layoutCardNotices()
  return box
}

export function resetEffectNotices(): void {
  for (const entry of [...effectNotices.values()]) entry.dispose()
}

export async function presentEffectNotice(card: ClientCard, kind: 'activate' | 'resolve' | 'applied', index: number, isCurrent?: () => boolean, effect: EffectReference = { n: 0, uid: null }): Promise<void> {
  if (isCurrent?.() === false || document.hidden) return
  // Activation puis résolution du même effet : garder le bouton en place et prolonger sa lecture.
  for (const [previous, entry] of effectNotices) {
    const button = previous.querySelector<HTMLElement>('.card-notice')!
    if (button.dataset.card === String(card.id) && button.dataset.effectNumber === String(effect.n)
      && button.dataset.effectIndex === String(index) && (button.dataset.effectUid ?? '') === (effect.uid === null ? '' : String(effect.uid))
      && (button.dataset.effectLabel ?? '') === (effect.label ?? '')) {
      previous.querySelector('small')!.textContent = t(`fx.effectNotice.${kind}`, { n: index })
      entry.refresh()
      await sleep(M.enter + M.read + M.leave)
      return
    }
    if (!reading(previous)) entry.dispose()
  }
  const box = cardNotice([card], t(`fx.effectNotice.${kind}`, { n: index }), { ...effect, index })
  let expiry: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  const pause = (): void => { revision++; clearTimeout(expiry); box.getAnimations().forEach((animation) => animation.cancel()); box.style.opacity = '1' }
  const schedule = (): void => {
    const run = ++revision
    clearTimeout(expiry)
    if (!box.isConnected || reading(box)) return
    expiry = setTimeout(() => {
      if (run !== revision || !box.isConnected || reading(box)) return
      void play(box, [{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 0 : M.leave }).finally(() => {
        if (run === revision && !reading(box)) dispose()
      })
    }, EFFECT_NOTICE_LIFETIME)
  }
  const release = (): void => { if (!reading(box)) schedule() }
  const blur = (): void => queueMicrotask(release)
  const dismiss = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dispose() }
  }
  const dispose = (): void => {
    revision++
    clearTimeout(expiry)
    box.removeEventListener('pointerleave', release)
    box.removeEventListener('pointerenter', pause)
    box.removeEventListener('focusin', pause)
    box.removeEventListener('focusout', blur)
    box.removeEventListener('keydown', dismiss)
    effectNotices.delete(box)
    removeNotice(box)
  }
  effectNotices.set(box, { dispose, refresh: () => { pause(); schedule() } })
  box.addEventListener('pointerenter', pause)
  box.addEventListener('focusin', pause)
  box.addEventListener('keydown', dismiss)
  box.addEventListener('pointerleave', release)
  box.addEventListener('focusout', blur)
  try {
    await play(box, [{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 0 : M.enter })
    if (!box.isConnected || isCurrent?.() === false) return
    schedule()
    await sleep(M.read + M.leave)
  } finally {
    // Le temps de lecture est indépendant des animations et de la vitesse de replay.
    if (!box.isConnected || isCurrent?.() === false) dispose()
  }
}

export function showRevealed(cards: ClientCard[]): void {
  if (!cards.length) return
  pending.push(cards.slice(0, 6))
  showNext()
}

export function resetReveals(): void {
  pending.length = 0
  active?.dispose()
}

function showNext(): void {
  if (active) return
  const cards = pending.shift()
  if (!cards?.length) return
  const box = cardNotice(cards, t('fx.revealed', { n: cards.length }))
  let expiry: ReturnType<typeof setTimeout> | undefined
  const entry = { dispose: (): void => {
    clearTimeout(expiry)
    removeNotice(box)
    if (active === entry) active = null
  } }
  const close = (): void => { entry.dispose(); showNext() }
  const pause = (): void => { clearTimeout(expiry); box.getAnimations().forEach((animation) => animation.cancel()); box.style.opacity = '1' }
  const schedule = (): void => {
    clearTimeout(expiry)
    if (!box.isConnected || reading(box)) return
    expiry = setTimeout(() => {
      void play(box, [{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 0 : 150 }).finally(() => {
        if (active === entry && !reading(box)) close()
      })
    }, 2200)
  }
  box.addEventListener('pointerenter', pause)
  box.addEventListener('focusin', pause)
  box.addEventListener('pointerleave', schedule)
  box.addEventListener('focusout', () => queueMicrotask(schedule))
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  })
  active = entry
  sfx('reveal')
  void play(box, [{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 0 : 120 })
  schedule()
}
