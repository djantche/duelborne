import { fieldBeforeDraw, fieldAfterDraw, prepareFieldPresentation, resetFieldTransition } from './fieldTransition.ts'
// Contrôleur du duel : file des états reçus du serveur, réponses aux questions, gestes du joueur.
// Il modifie l'état (state.ts) puis demande un redessin ; les composants ne font qu'afficher.
import type { Answer, DuelView, LogEntry, PromptOption, ServerMessage } from '../../../shared/protocol.ts'
import { send } from '../../app/net.ts'
import { ask, closeMenu, openMenu, redraw } from '../../app/render.ts'
import { store } from '../../app/store.ts'
import { navigate } from '../../app/navigation.ts'
import { sfx } from '../../ui/audio.ts'
import { fromMini, nameOf } from '../../ui/cardview.ts'
import type { IconName } from '../../ui/Icon.tsx'
import { ACTION_LABEL } from '../../ui/i18n.ts'
import { arrow, bannersDone, centerOf } from './anim.ts'
import { activePrompt, attackTargetOf, canSendPick, effectNumbers, isBlocked, isFixed, isTargeting, replyGroups } from './prompt.ts'
import type { CardsPrompt, ChainPrompt } from './prompt.ts'
import { playPost, playPre, resetSequence, snapshot } from './sequence.ts'
import { duel, forgetUsedEffects, trackEffect } from './state.ts'
import { chainPresentation } from './chainPresentation.ts'
import type { Side } from './state.ts'
import { t, tx } from '../../i18n.ts'
import { installCardHold, resetCardHold } from './cardHold.ts'

type StateMessage = Extract<ServerMessage, { t: 'state' }>

const app = document.getElementById('app') as HTMLElement
const queue: StateMessage[] = []
/** Dernière question annoncée au joueur (pour ne signaler par un son que les nouvelles). */
let lastPrompt = 0
/** Invalide les continuations asynchrones quand on quitte ou remplace le duel. */
let generation = 0
let draining = false
let journal: LogEntry[] = []

/** Carte sur le plateau (main, terrain, dessus du Cimetière). */
export const boardCard = (uid: number | null | undefined): HTMLElement | null => (uid === null || uid === undefined ? null : app.querySelector<HTMLElement>(`.card[data-uid="${uid}"]`))

/** Téléphone en paysage : pas de colonne de fiche, un bandeau et une fiche à ouvrir. */
export const isPhone = (): boolean => matchMedia('(max-height: 560px)').matches

// ───────────────────────────── États reçus du serveur ─────────────────────────────

/** Un nouvel état arrive : il attend son tour derrière les animations en cours. */
export function pushState(m: StateMessage): void {
  if (m.events.some((e) => e.type === 'start') || m.matchId && duel.matchId && m.matchId !== duel.matchId) journal = []
  const offset = m.view.logOffset ?? 0
  journal.splice(offset, Math.max(0, journal.length - offset), ...m.view.log)
  m = { ...m, view: { ...m.view, log: [...journal], logOffset: 0 } }
  if (m.matchId) duel.matchId = m.matchId
  queue.push(m)
  void drain()
}

/** Oublie le duel (retour à l'accueil ou au salon). */
export function resetDuel(): void {
  generation++
  resetCardHold()
  clearHoverFrame()
  queue.length = 0
  duel.busy = false
  journal = []
  duel.matchId = null
  duel.players = []
  clearInteraction()
  resetSequence()
  duel.viewer = null
  duel.logQuery = ''
  duel.logSeat = 'all'
  duel.logKind = 'all'
  duel.logTurn = 0
  duel.logFollow = true
  duel.logScroll = 0
  duel.logReadCount = 0
  duel.view = null
  duel.pinned = false
  duel.sheet = false
  duel.focusId = null
  duel.focusUid = null
  duel.activeEffect = null
  duel.inspectedEffect = null
  duel.pendingEffects = []
  forgetUsedEffects()
  duel.fieldCard = null
  lastPrompt = 0
}

/** Invalide la scène précédente lors d'un déplacement dans la chronologie, en gardant les fenêtres de lecture. */
export function interruptPresentation(): void {
  generation++
  clearHoverFrame()
  resetSequence()
  removeArrows()
  duel.activeEffect = null
  duel.pendingEffects = []
  forgetUsedEffects()
  duel.busy = false
}

/** Relecture locale : mêmes animations que le duel, sans réseau ni réponse au moteur. */
export async function presentReplayFrame(m: StateMessage, animated: boolean): Promise<void> {
  const run = generation
  const start = m.events.some((e) => e.type === 'start')
  if (!animated || start) chainPresentation.reset()
  const ctx = { you: m.view.you, nextView: m.view, cards: store.cards, startLp: m.view.startLp, spectating: true, watching: true, isCurrent: () => run === generation }
  clearInteraction()
  duel.busy = animated
  duel.clock = null
  duel.names = m.names
  duel.players = m.players ?? []
  duel.connected = m.connected
  for (const [id, card] of Object.entries(m.view.unknownCards)) if (!store.cards.has(Number(id))) store.cards.set(Number(id), fromMini(Number(id), card))
  let finishField = async (): Promise<void> => {}
  const draw = (): void => {
    if (run !== generation) return
    const field = animated && !start ? fieldBeforeDraw() : null
    prepareFieldPresentation(m.view, m.events, animated && !start)
    duel.view = m.view
    if (!m.view.chain.length) { duel.activeEffect = null; duel.pendingEffects = [] }
    duel.version++
    redraw()
    finishField = fieldAfterDraw(field)
  }
  try {
    const old = animated && duel.view ? snapshot() : new Map()
    const handled = animated && !start ? await playPre(m.events, ctx) : new Set<number>()
    if (run !== generation) return
    draw()
    if (animated) await playPost(m.events, old, handled, ctx)
    if (run === generation) await finishField()
    if (run === generation && !m.view.chain.length) await chainPresentation.finish()
  } catch (error) {
    console.error(error)
    chainPresentation.reset()
    resetFieldTransition()
    draw()
  } finally {
    if (run === generation) {
      duel.chainShown = null
      if (!m.view.chain.length) { duel.chainLong = false; duel.chainUids = [] }
      duel.busy = false
      redraw()
    }
  }
}

/** Après un nouveau rendu : changement de terrain, son d'une question qui arrive. */
function afterDraw(v: DuelView, animated: boolean): void {
  const p = v.prompt
  if (p && p.id !== lastPrompt && (p.kind === 'chain' || p.kind === 'yesno' || p.kind === 'option' || p.kind === 'number')) sfx('question')
  lastPrompt = p?.id ?? lastPrompt
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  const run = generation
  duel.busy = true
  while (queue.length && run === generation) {
    const m = queue.shift() as StateMessage
    const prev = duel.view
    // Les choix appartiennent à une question ; les fenêtres de lecture appartiennent à l'utilisateur.
    // Un rafraîchissement de la même question conserve aussi les sélections déjà effectuées.
    if (prev?.prompt?.id !== m.view.prompt?.id) {
      clearInteraction()
      // La fenêtre des cartes hors plateau reste ouverte d'une étape à l'autre d'une sélection, pas au-delà.
      duel.offboardOpen = false
    } else removeArrows()
    duel.names = m.names
    duel.players = m.players ?? []
    duel.connected = m.connected
    duel.clock = m.timer ? { seat: m.timer.seat, end: performance.now() + m.timer.ms } : null
    for (const [id, mini] of Object.entries(m.view.unknownCards)) if (!store.cards.has(Number(id))) store.cards.set(Number(id), fromMini(Number(id), mini))
    const start = m.events.some((e) => e.type === 'start')
    if (start) {
      clearInteraction()
      duel.viewer = null
      duel.sheet = false
    }
    const onDuel = store.screen === 'duel'
    const animated = m.events.length > 0 && !document.hidden && (start || (onDuel && prev !== null))
    if (start || document.hidden || (!animated && m.events.length > 0)) chainPresentation.reset()
    if (!animated || start) for (const event of m.events) trackEffect(event)
    const ctx = { you: m.view.you, nextView: m.view, cards: store.cards, startLp: m.view.startLp, spectating: m.view.spectating, watching: m.view.watching, isCurrent: () => run === generation }
    const animateField = !start && onDuel && prev !== null && !document.hidden
    let finishField = async (): Promise<void> => {}
    const draw = (): void => {
      if (run !== generation) return
      const field = animateField ? fieldBeforeDraw() : null
      prepareFieldPresentation(m.view, m.events, animateField)
      duel.view = m.view
      if (!m.view.chain.length) {
        duel.activeEffect = null
        duel.pendingEffects = []
      }
      // Nouvel état : le terrain est reconstruit, ce qui efface les traces des animations précédentes.
      duel.version++
      if (store.screen !== 'duel') navigate('duel', true)
      else redraw()
      finishField = fieldAfterDraw(field)
      afterDraw(m.view, animated && !start)
    }
    try {
      const old = animated && !start ? snapshot() : new Map()
      // Une victoire qui a une cause à montrer retient l'écran de résultat le temps de sa scène de fin.
      if (animated && !start && m.events.some((e) => e.type === 'win' && e.winner !== 'draw')) duel.finale = true
      const handled = animated && !start ? await playPre(m.events, ctx) : new Set<number>()
      if (run !== generation) break
      draw()
      if (animated) {
        await playPost(m.events, old, handled, ctx)
      }
      if (run === generation) await finishField()
      if (animated) {
        if (run !== generation) break
        // La phase est annoncée, son bandeau passé : seulement alors, les effets sont proposés.
        await bannersDone()
      }
      if (run === generation && !m.view.chain.length) await chainPresentation.finish()
    } catch (err) {
      // Une animation ne doit jamais bloquer la partie.
      console.error(err)
      chainPresentation.reset()
      resetFieldTransition()
      draw()
    }
    // Séquence terminée : tous les effets joués sont résolus, la barre de chaîne reprend la vue reçue.
    if (run === generation && (duel.chainShown || (duel.chainLong && !m.view.chain.length))) {
      duel.chainShown = null
      if (!m.view.chain.length) { duel.chainLong = false; duel.chainUids = [] }
      redraw()
    }
    if (duel.finale) {
      duel.finale = false
      redraw()
    }
  }
  draining = false
  duel.finale = false
  if (run === generation) duel.busy = false
  redraw()
  if (queue.length) {
    void drain()
    return
  }
  // Entre ordinateurs, les joueurs attendent que notre écran ait fini de jouer ce qu'il a reçu.
  if (duel.view?.watching && store.room?.mode === 'aivai') send({ t: 'idle' })
}

/** Répond à la question en cours. On l'efface aussitôt pour éviter une double réponse. */
export function answer(value: Answer): void {
  const prompt = activePrompt()
  if (!duel.view || !prompt || duel.promptHidden) return
  send({ t: 'answer', id: prompt.id, value })
  duel.view.prompt = null
  // Une action choisie depuis la fenêtre d'une pile (Extra Deck, Cimetière, cartes bannies) la referme ; le journal, lui, appartient au lecteur.
  if (duel.viewer && duel.viewer.kind !== 'log') duel.viewer = null
  clearInteraction()
  redraw()
}

function removeArrows(): void {
  duel.targetArrow?.remove()
  duel.targetArrow = null
  duel.directArrow?.remove()
  duel.directArrow = null
}

function clearInteraction(): void {
  duel.promptHidden = false
  duel.announced = null
  duel.counts = []
  duel.search = ''
  if (store.menu?.promptId !== undefined) store.menu = null
  removeArrows()
  duel.direct = null
  duel.attackTarget = null
  duel.picked = []
  duel.replyGroup = null
  duel.raised = null
  duel.handLocked = false
}

/**
 * Flèches de visée, tenues à jour après chaque rendu : attaque directe en attente de confirmation,
 * ou choix de la cible d'une attaque. Elles vivent dans le calque d'effets, hors de l'interface.
 */
export function syncArrows(): void {
  const prompt = activePrompt()
  if (!duel.direct && duel.directArrow) {
    duel.directArrow.remove()
    duel.directArrow = null
  }
  if (duel.direct) {
    const from = boardCard(duel.direct.uid)
    const zone = app.querySelector<HTMLElement>('.arena.aim-direct .direct')
    if (from && zone) {
      const start = centerOf(from.getBoundingClientRect())
      duel.directArrow ??= arrow(start)
      duel.directArrow.aim(centerOf(zone.getBoundingClientRect()), true, start)
    }
  }
  const targeting = prompt?.kind === 'cards' && isTargeting(prompt) && !duel.direct ? prompt : null
  if (!targeting && duel.targetArrow) {
    duel.targetArrow.remove()
    duel.targetArrow = null
  }
  if (targeting) {
    const attacker = boardCard(targeting.attackerUid)
    const target = boardCard(attackTargetOf(targeting))
    if (attacker && target) {
      const from = centerOf(attacker.getBoundingClientRect())
      duel.targetArrow ??= arrow(from)
      duel.targetArrow.aim(centerOf(target.getBoundingClientRect()), true, from)
    }
  }
}

export function setDirect(option: PromptOption | null): void {
  duel.directArrow?.remove()
  duel.directArrow = null
  duel.direct = option
  redraw()
}

/** Consulter le terrain ne répond pas au moteur et ne modifie aucune sélection. */
export function setPromptHidden(hidden: boolean): void {
  if (!activePrompt()) return
  duel.promptHidden = hidden
  store.menu = null
  redraw()
}

/** Désigner puis confirmer évite qu'un clic d'inspection déclare involontairement une attaque. */
export function aimAttack(uid: number): void {
  const p = activePrompt()
  if (p?.kind !== 'cards' || !isTargeting(p) || !p.cards.some((c) => c.uid === uid)) return
  if (attackTargetOf(p) === uid) return
  duel.attackTarget = uid
  const target = boardCard(uid)
  if (target) duel.targetArrow?.aim(centerOf(target.getBoundingClientRect()), true)
  redraw()
}

export function confirmAttack(): void {
  if (duel.direct) return answer(duel.direct.id)
  const p = activePrompt()
  if (p?.kind !== 'cards' || !isTargeting(p)) return
  const index = p.cards.findIndex((c) => c.uid === attackTargetOf(p))
  if (index >= 0) answer([index])
}

// ───────────────────────────── Actions d'une carte ─────────────────────────────

const ACTION_ICON: Record<string, IconName> = { summon: 'cardUp', spsummon: 'spark', set: 'cardBack', sset: 'cardBack', position: 'rotate', activate: 'bolt', attack: 'sword' }

const foeHasMonsters = (): boolean => !!duel.view && duel.view.players[duel.view.you === 0 ? 1 : 0].monsters.some((m) => m)

/** effect : numéro de l'effet, quand la carte en propose plusieurs ; several : la carte propose plusieurs activations. */
function optionLabel(o: PromptOption, effect?: number, several = false): string {
  if (o.action === 'attack') return o.direct && !foeHasMonsters() ? 'Attaque directe' : 'Attaquer'
  // Parmi plusieurs activations, celle qui n'a pas de numéro est l'activation de la carte Magie ou Piège elle-même.
  const frame = o.cardId === null ? undefined : store.cards.get(o.cardId)?.frameType
  if (o.action === 'activate' && several && !effect && (frame === 'spell' || frame === 'trap')) return 'Activer la carte'
  const base = effect ? t('c.effect', { n: effect }) : (ACTION_LABEL[o.action] ?? o.action)
  // Le texte de l'effet, raccourci pour tenir dans le menu.
  const label = o.label ? tx(o.label) : ''
  return label ? `${base} · ${label.length > 56 ? `${label.slice(0, 54)}…` : label}` : effect ? t('c.activateEffect', { n: effect }) : base
}

function chooseOption(o: PromptOption): void {
  // Attaque directe : on demande une confirmation en visant le terrain adverse.
  if (o.action === 'attack' && o.direct && !foeHasMonsters() && boardCard(o.uid)) {
    closeMenu()
    return setDirect(o)
  }
  answer(o.id)
}

/** Coche ou décoche une carte proposée ; rien n'est envoyé avant « Valider ». */
function togglePick(prompt: CardsPrompt, index: number): void {
  // Les cartes imposées par le moteur sont déjà cochées : on n'y touche pas.
  if (isFixed(prompt, index)) return
  // Cartes à ordonner : l'ordre des touchers compte, toucher de nouveau retire la carte de la liste.
  const max = prompt.mode === 'step' ? 1 : prompt.weights ? prompt.cards.length : prompt.max
  const has = duel.picked.includes(index)
  if (has) duel.picked = duel.picked.filter((i) => i !== index)
  // Une sélection interdite (maximum atteint, total des Niveaux dépassé) ne se coche pas.
  else if (isBlocked(prompt, index)) return
  else if (max === 1) duel.picked = [index]
  else if (duel.picked.length < max) duel.picked = [...duel.picked, index]
}

/** Réponse en chaîne : désigne une carte de la fenêtre. Si elle n'a qu'un effet, il est retenu d'office ; sinon il reste à le choisir. */
function pickReply(prompt: ChainPrompt, group: number): void {
  const options = replyGroups(prompt)[group] ?? []
  if (duel.replyGroup !== group) duel.picked = options.length === 1 ? [options[0] as number] : []
  duel.replyGroup = group
}

export function sendPick(): void {
  const prompt = activePrompt()
  if (prompt?.kind === 'announce') return duel.announced === null ? undefined : answer(duel.announced)
  if (prompt?.kind === 'counters') {
    const counts = prompt.cards.map((_, i) => duel.counts[i] ?? 0)
    return counts.reduce((t, n) => t + n, 0) === prompt.total ? answer(counts) : undefined
  }
  if (prompt?.kind === 'place') return prompt.count > 1 && duel.picked.length === prompt.count ? answer([...duel.picked]) : undefined
  if (prompt?.kind === 'option' && prompt.pick) return duel.picked.length === prompt.pick ? answer([...duel.picked]) : undefined
  if (prompt?.kind === 'chain') {
    const option = prompt.options[duel.picked[0] ?? -1]
    if (option) answer(option.id)
    return
  }
  if (prompt?.kind !== 'cards' || !canSendPick(prompt)) return
  answer(prompt.mode === 'step' ? (duel.picked[0] as number) : duel.picked)
}

function onCardClick(card: HTMLElement, previewOnly = false): void {
  if (duel.promptHidden) return
  const uid = Number(card.dataset.uid)
  const prompt = activePrompt()
  if (duel.direct) return setDirect(null)
  if (!prompt) return

  if (prompt.kind === 'idle' || prompt.kind === 'battle') {
    const options = prompt.options.filter((o) => o.uid === uid)
    if (!options.length) return
    const only = options[0] as PromptOption
    // En Battle Phase, un monstre qui ne peut qu'attaquer attaque directement au clic.
    if (!previewOnly && options.length === 1 && only.action === 'attack') return chooseOption(only)
    const activations = options.filter((o) => o.action === 'activate')
    const numbers = effectNumbers(activations)
    openMenu(card, options.map((o) => ({ label: optionLabel(o, numbers.get(o), activations.length > 1), icon: ACTION_ICON[o.action] ?? 'spark', ...(numbers.get(o) ? { badge: String(numbers.get(o)) } : {}), run: () => activePrompt()?.id === prompt.id && chooseOption(o) })), prompt.id)
    if (store.menu) store.menu.owner = uid
    return
  }
  if (previewOnly) return
  if (prompt.kind === 'chain') {
    // Toucher la carte sur le plateau la désigne dans la fenêtre de réponse ; seul « Valider » l'active.
    const group = replyGroups(prompt).findIndex((g) => prompt.options[g[0] as number]?.uid === uid)
    if (group >= 0) pickReply(prompt, group)
    return
  }
  if (prompt.kind === 'cards') {
    const index = prompt.cards.findIndex((c) => c.uid === uid)
    if (index < 0) return
    if (isTargeting(prompt)) return aimAttack(uid)
    togglePick(prompt, index)
  }
}

// ───────────────────────────── Fiche de carte ─────────────────────────────

/** Désigne la carte dont on lit la fiche. `pin` : elle reste affichée, le survol ne la remplace plus. */
function focus(holder: HTMLElement, pin: boolean): void {
  if (!store.cards.has(Number(holder.dataset.card))) { clearCardSelection(); return }
  duel.inspectedEffect = null
  duel.focusId = Number(holder.dataset.card)
  duel.focusUid = holder.dataset.uid ? Number(holder.dataset.uid) : null
  if (pin) duel.pinned = true
}

/** Toucher une carte la désigne (bandeau sur téléphone, colonne de fiche sur ordinateur) ; toucher le vide la libère. */
function focusFrom(ev: Event): void {
  const el = ev.target as HTMLElement
  const holder = el.closest<HTMLElement>('[data-card]')
  if (holder && !holder.closest('.detail')) focus(holder, true)
  else if (!el.closest('button, .modal-in, .actions, .panel, .infobar, .sheet')) {
    clearCardSelection()
  }
}

/** Lit une carte citée : fiche épinglée, ou fenêtre complète à la demande et sur téléphone. */
export function inspectCard(id: number, full = false, effect?: { n: number; label?: string; uid: number | null; index: number }): void {
  duel.focusId = id
  duel.focusUid = effect?.uid ?? null
  duel.inspectedEffect = effect ? { ...effect, cardId: id } : null
  duel.pinned = true
  if (full || isPhone()) duel.sheet = true
  redraw()
}

function inspectNotice(holder: HTMLElement): void {
  const id = Number(holder.dataset.card)
  if (!store.cards.has(id)) return
  const effect = holder.dataset.effectNumber === undefined ? undefined : {
    n: Number(holder.dataset.effectNumber), label: holder.dataset.effectLabel,
    uid: holder.dataset.effectUid ? Number(holder.dataset.effectUid) : null,
    index: Number(holder.dataset.effectIndex ?? 0),
  }
  inspectCard(id, false, effect)
}

/** Ouvre la fiche complète (téléphone). */
export function openSheet(): void {
  if (duel.focusId === null) return
  duel.sheet = true
  redraw()
}

export function closeSheet(): void {
  clearCardSelection()
  redraw()
}

/** Efface uniquement la consultation ; les cartes choisies pour le moteur restent sélectionnées. */
export function clearCardSelection(): void {
  duel.focusId = null
  duel.focusUid = null
  duel.inspectedEffect = null
  duel.pinned = false
  duel.sheet = false
}

// ───────────────────────────── Gestes sur l'écran de duel ─────────────────────────────

/**
 * Zone proposée qui se trouve sous le clic. On la cherche par sa position à l'écran : sur le tapis
 * incliné en 3D, le navigateur attribue parfois le clic d'une zone vide au tapis lui-même.
 */
function placeableAt(ev: MouseEvent): HTMLElement | null {
  const hit = (ev.target as HTMLElement).closest<HTMLElement>('.placeable')
  if (hit) return hit
  for (const zone of app.querySelectorAll<HTMLElement>('.zone.placeable')) {
    const r = zone.getBoundingClientRect()
    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) return zone
  }
  return null
}

function cardTapped(card: HTMLElement, ev: MouseEvent): void {
  focusFrom(ev)
  store.menu = null
  if (!duel.busy && duel.view) onCardClick(card)
  redraw()
}

/** Les centres au repos partagent la main en cibles stables, même quand une carte est soulevée. */
function handCardAt(x: number, y: number): HTMLElement | null {
  if (activePrompt()?.kind === 'place') return null
  let target: HTMLElement | null = null
  let distance = Infinity
  for (const holder of app.querySelectorAll<HTMLElement>('.hand.me .hcard')) {
    const rect = holder.getBoundingClientRect()
    if (y < rect.top - 8 || y > rect.bottom || x < rect.left || x > rect.right) continue
    const next = Math.abs(x - (rect.left + rect.width / 2))
    if (next < distance) { distance = next; target = holder.querySelector<HTMLElement>('.card[data-uid]') }
  }
  return target
}

/** Clic sur le plateau : cartes, zones, piles, terrain adverse. Les boutons ont leurs propres gestionnaires. */
export function onBoardClick(ev: MouseEvent): void {
  const original = ev.target as HTMLElement
  if (original.closest('button, .left')) return
  const handCard = handCardAt(ev.clientX, ev.clientY)
  const el = handCard ?? original
  if (el.closest('.direct')) {
    if (duel.direct) answer(duel.direct.id)
    return
  }
  const pile = el.closest<HTMLElement>('.pile.gy, .pile.extra, .pile.void')
  if (pile) {
    // Les sélections proposées restent directes ; les effets se choisissent depuis la fenêtre de la pile.
    const card = el.closest<HTMLElement>('.card.pickable, .card.picked, .card.targetable')
    if (card) return cardTapped(card, ev)
    focusFrom(ev)
    return openPile(pile.dataset.pile === 'extra' ? 'extra' : pile.dataset.pile === 'banished' ? 'banished' : 'gy', (pile.dataset.side ?? 'me') as Side)
  }
  if (handCard?.dataset.card) focus(handCard, true)
  else focusFrom(ev)
  // Seule une carte dévoilée de la main peut rester soulevée après un toucher.
  const inHand = el.closest<HTMLElement>('.hand.me .card[data-card][data-uid]')
  const wasRaised = !!inHand && duel.raised === Number(inHand.dataset.uid)
  duel.raised = inHand ? Number(inHand.dataset.uid) : null
  duel.handLocked = !!inHand
  if (duel.busy || !duel.view) return redraw()
  const zone = placeableAt(ev)
  if (zone) {
    sfx('carddrop')
    const prompt = activePrompt()
    const index = Number(zone.dataset.place)
    // Plusieurs zones à choisir : on les coche, puis « Valider ».
    if (prompt?.kind === 'place' && prompt.count > 1) {
      duel.picked = duel.picked.includes(index) ? duel.picked.filter((i) => i !== index) : duel.picked.length < prompt.count ? [...duel.picked, index] : duel.picked
      return redraw()
    }
    return answer(index)
  }
  const card = el.closest<HTMLElement>('.card[data-uid]')
  const kind = activePrompt()?.kind
  if (card && inHand && !duel.direct && (kind === 'idle' || kind === 'battle')) {
    if (!wasRaised) sfx('cardpick', { gap: 120 })
    // Le menu déjà ouvert au-dessus de cette carte (survol) reste en place ; sinon il s'ouvre une fois la carte montée.
    if (!(wasRaised && store.menu?.owner === Number(card.dataset.uid))) openHandMenu(Number(card.dataset.uid), false)
  } else if (card) {
    if (!wasRaised) sfx('cardpick', { gap: 120 })
    onCardClick(card)
  } else if (duel.direct) duel.direct = null
  redraw()
}

/** Clic dans une fenêtre de pile : une carte agit comme sur le plateau, le fond ferme la fenêtre. */
export function onViewerClick(ev: MouseEvent): void {
  const card = (ev.target as HTMLElement).closest<HTMLElement>('.card[data-uid]')
  if (card) cardTapped(card, ev)
}

/** Ouvrir une pile est une consultation, indépendante des actions de sa carte du dessus. */
export function openPile(kind: 'gy' | 'extra' | 'banished', side: Side): void {
  if (!duel.view || duel.direct) return
  store.menu = null
  duel.viewer = { kind, side }
  redraw()
}

export function closeViewer(): void {
  duel.viewer = null
  redraw()
}

export function openLog(): void {
  duel.viewer = { kind: 'log' }
  redraw()
}

/** Vignette d'une fenêtre de choix : coche la carte (ou la désigne, en réponse à une chaîne) et montre sa fiche. */
export function chooseTile(index: number, ev: MouseEvent): void {
  const prompt = activePrompt()
  focusFrom(ev)
  if (prompt?.kind === 'cards') togglePick(prompt, index)
  else if (prompt?.kind === 'chain') pickReply(prompt, index)
  redraw()
}

/** Choix d'une option dans une liste où il faut en cocher plusieurs (Types, Attributs). */
export function toggleOption(index: number): void {
  const prompt = activePrompt()
  if (prompt?.kind !== 'option' || !prompt.pick) return
  duel.picked = duel.picked.includes(index) ? duel.picked.filter((i) => i !== index) : duel.picked.length < prompt.pick ? [...duel.picked, index] : [index]
  redraw()
}

/** Carte déclarée (nom d'une carte) : on la retient, « Valider » la renvoie. */
export function chooseAnnounced(cardId: number): void {
  duel.announced = cardId
  duel.focusId = cardId
  duel.focusUid = null
  redraw()
}

/** Retirer des compteurs : ajuste le nombre retiré sur une carte. */
export function stepCounter(index: number, delta: number): void {
  const prompt = activePrompt()
  if (prompt?.kind !== 'counters') return
  const now = prompt.cards.map((_, i) => duel.counts[i] ?? 0)
  const next = now.map((n, i) => (i === index ? Math.max(0, Math.min((prompt.cards[i] as { max: number }).max, n + delta)) : n))
  // On ne dépasse jamais le total à retirer.
  if (next.reduce((t, n) => t + n, 0) <= prompt.total) duel.counts = next
  redraw()
}

/** Réponse en chaîne : choix de l'effet d'une carte qui en propose plusieurs. */
export function pickEffect(index: number): void {
  if (activePrompt()?.kind !== 'chain') return
  duel.picked = [index]
  redraw()
}

/** Changement de phase ou fin de tour. */
export function chooseOptionById(id: number): void {
  const prompt = activePrompt()
  const option = prompt && (prompt.kind === 'idle' || prompt.kind === 'battle') ? prompt.options.find((o) => o.id === id) : null
  if (option) answer(option.id)
}

/** Effets de cartes sans emplacement visible (Deck) : proposés dans un menu à part. */
export function offBoardMenu(anchor: Element): void {
  const prompt = activePrompt()
  if (!prompt || (prompt.kind !== 'idle' && prompt.kind !== 'battle')) return
  const options = prompt.options.filter((o) => o.uid === null && o.cardId !== null)
  const title = (o: PromptOption): string => {
    const card = store.cards.get(o.cardId as number)
    return `${card ? nameOf(card) : t('c.card')} · ${optionLabel(o)}`
  }
  openMenu(anchor, options.map((o) => ({ label: title(o), text: true, icon: ACTION_ICON[o.action] ?? 'spark', run: () => activePrompt()?.id === prompt.id && chooseOption(o) })), prompt.id)
}

/** Revenir sur sa dernière décision, tant qu'aucune carte n'a été posée ni aucun effet activé. */
export function navigateConsole(destination: 'back' | 'home'): void {
  const prompt = activePrompt()
  if (store.room?.mode !== 'sandbox' || !prompt) return
  if (destination === 'home' && prompt.kind === 'idle') {
    const option = prompt.options.find((item) => item.action === 'activate' && item.cardId === 3900000001)
    if (option) answer(option.id)
    return
  }
  if (!prompt.consoleNavigation?.[destination]) return
  send({ t: 'consoleNavigate', id: prompt.id, destination })
  duel.view!.prompt = null
  clearInteraction()
  redraw()
}

/** Revenir sur sa dernière décision, tant qu'aucune carte n'a été posée ni aucun effet activé. */
export function undo(): void {
  if (duel.busy || !duel.view?.prompt?.undoable) return
  send({ t: 'undo' })
  duel.view.prompt = null
  clearInteraction()
  redraw()
}

export function surrender(): void {
  // Un spectateur n'abandonne rien : il quitte simplement la salle.
  if (duel.view?.watching || store.room?.tournament && duel.view && duel.view.winner !== null) return send({ t: 'leave' })
  if (duel.view?.winner === null) ask({ title: t('c.surrenderTitle'), text: t('c.surrenderText'), ok: t('c.surrender'), run: () => send({ t: 'surrender' }) })
}

export const rematch = (): void => send({ t: 'rematch' })

/** Quitte le duel terminé ; la réponse du serveur rouvre le tournoi concerné. */
export function continueTournament(): void {
  if (!store.room?.tournament || !duel.view || duel.view.winner === null || duel.finale) return
  send({ t: 'leave' })
}

/** Échap ou clic droit : renonce à ce qui est en cours, du plus proche au plus lointain. */
export function cancel(): void {
  if (store.menu) return closeMenu()
  if (duel.sheet) return closeSheet()
  if (duel.viewer) return closeViewer()
  if (duel.promptHidden) return setPromptHidden(false)
  clearCardSelection()
  store.menu = null
  duel.raised = null
  duel.handLocked = false
  if (duel.direct) return setDirect(null)
  const prompt = activePrompt()
  // Renoncer à la carte désignée, puis « passer » sur une chaîne facultative, ou annuler une sélection annulable.
  if (prompt?.kind === 'chain' && duel.replyGroup !== null) {
    duel.picked = []
    duel.replyGroup = null
    return redraw()
  }
  if (prompt?.kind === 'chain' && !prompt.forced) return answer(null)
  if (prompt?.kind === 'cards' && prompt.cancelable) return answer(null)
  // Sinon, on revient sur sa décision si rien n'a encore bougé sur le terrain.
  if (prompt?.undoable) return undo()
  redraw()
}

// ───────────────────────────── Écouteurs globaux ─────────────────────────────

const onDuel = (): boolean => store.screen === 'duel' || store.screen === 'replay'

document.addEventListener('pointerdown', (ev) => {
  if (!onDuel()) return
  const target = ev.target as HTMLElement
  if (duel.raised !== null && !target.closest('.hand.me, .actions')) { duel.raised = null; duel.handLocked = false; redraw() }
}, true)

// Fermer après le clic conserve les coordonnées du plateau pendant le choix d’une cible cachée.
document.addEventListener('click', (ev) => {
  if (!onDuel() || !(ev.target instanceof Element)) return
  const target = ev.target
  if (!(duel.pinned || duel.sheet)) return
  const card = target.closest<HTMLElement>('.card')
  if (card && !store.cards.has(Number(card.dataset.card))) {
    clearCardSelection()
    redraw()
    return
  }
  // Toucher ailleurs que sur une carte ou sur la description la referme, y compris dans une fenêtre de choix :
  // sur téléphone, le bandeau recouvre le haut de la fenêtre et son bouton « Valider ».
  if (target.closest('[data-card], .detail, .card-inspector, .sheet, input, textarea, select, .actions')) return
  clearCardSelection()
  redraw()
})

/** Durée du soulèvement d'une carte de la main (`.hlift` dans board.css) avant de mesurer sa place. */
const HAND_LIFT_MS = 190
let hoverMenuTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Menu d'une carte de la main, toujours au-dessus de la carte une fois montée : on attend la fin du soulèvement pour
 * mesurer sa place (au survol comme au clic direct). `preview` : survol, sans répondre au moteur.
 */
function openHandMenu(uid: number, preview: boolean): void {
  clearTimeout(hoverMenuTimer)
  hoverMenuTimer = setTimeout(() => {
    if (duel.raised !== uid || duel.busy || (preview && duel.handLocked) || store.menu?.owner === uid) return
    const lifted = document.querySelector<HTMLElement>(`.hand.me .card[data-uid="${uid}"]`)
    if (lifted) { onCardClick(lifted, preview); redraw() }
  }, HAND_LIFT_MS)
}

function hoverCard(ev: PointerEvent): void {
  if (!onDuel() || duel.busy || !(ev.target instanceof Element) || !ev.target.isConnected) return
  const el = ev.target as HTMLElement
  // Le pointeur ne déplace la visée qu'en entrant sur une autre cible autorisée.
  if (duel.targetArrow && !duel.viewer && !store.menu && !store.ask) {
    const target = el.closest<HTMLElement>('#mat .card.targetable[data-uid]')
    if (target) aimAttack(Number(target.dataset.uid))
  }
  // Une entrée en main soulève la carte, joue son son et présente ses actions sans répondre au moteur.
  if (ev.pointerType === 'mouse' && !duel.handLocked && !duel.busy && !duel.viewer && !duel.direct && !store.ask && !duel.promptHidden && activePrompt()?.kind !== 'cards') {
    const hand = el.closest<HTMLElement>('.hand.me .card[data-card][data-uid]')
    const card = hand ? handCardAt(ev.clientX, ev.clientY) ?? hand : null
    if (card && duel.raised !== Number(card.dataset.uid)) {
      duel.raised = Number(card.dataset.uid)
      store.menu = null
      if (!duel.pinned) focus(card, false)
      sfx('cardpick', { gap: 120 })
      redraw()
      // Les actions se placent au-dessus de la carte montée : attendre la fin de son soulèvement.
      openHandMenu(Number(card.dataset.uid), true)
    } else if (!card && duel.raised !== null && !el.closest('.actions')) {
      const actions = document.querySelector('.actions')?.getBoundingClientRect()
      const source = document.querySelector(`.hand.me .hcard.raised`)?.getBoundingClientRect()
      // Garder un passage entre la carte et les boutons, y compris les 12 px qui les séparent.
      const bridge = actions && source && ev.clientX >= Math.min(actions.left, source.left) - 12 && ev.clientX <= Math.max(actions.right, source.right) + 12 && ev.clientY >= Math.min(actions.top, source.top) - 12 && ev.clientY <= Math.max(actions.bottom, source.bottom) + 12
      if (!bridge) {
        duel.raised = null
        store.menu = null
        redraw()
      }
    }
  }
  // Aperçu au survol (souris uniquement : au doigt, c'est le toucher qui désigne). Une carte touchée garde sa fiche.
  if (ev.pointerType !== 'mouse' || duel.pinned || isPhone() || duel.handLocked && !!el.closest('.hand.me')) return
  const holder = el.closest<HTMLElement>('[data-card]')
  if (!holder || holder.closest('.detail')) return
  const uid = holder.dataset.uid ? Number(holder.dataset.uid) : null
  if (Number(holder.dataset.card) === duel.focusId && uid === duel.focusUid) return
  focus(holder, false)
  redraw()
}

// Une souris peut produire bien plus d’événements que l’écran n’affiche d’images.
// Ne mesurer la main et ne redessiner les aperçus qu’une fois par image.
let hoverEvent: PointerEvent | null = null
let hoverFrame = 0
function clearHoverFrame(): void {
  cancelAnimationFrame(hoverFrame)
  hoverFrame = 0
  hoverEvent = null
}
document.addEventListener('pointermove', (ev) => {
  if (!onDuel() || duel.busy || document.hidden) return
  hoverEvent = ev
  if (hoverFrame) return
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0
    const latest = hoverEvent
    hoverEvent = null
    if (latest && !document.hidden) hoverCard(latest)
  })
})

// L’appui long ouvre la consultation plein écran, sans jouer l’action du relâchement.
installCardHold(() => onDuel() && (isPhone() || matchMedia('(pointer: coarse)').matches), (holder) => {
  if (!store.cards.has(Number(holder.dataset.card))) return
  const notice = holder.closest<HTMLElement>('button.card-notice')
  if (notice) inspectNotice(notice)
  else focus(holder, true)
  store.menu = null
  duel.sheet = true
  redraw()
})

// Cartes révélées (calque d'effets, hors du plateau) : un toucher ou un clic les lit, au doigt dans la fiche complète.
document.addEventListener('click', (ev) => {
  const holder = ev.target instanceof Element ? ev.target.closest<HTMLElement>('button.card-notice[data-card], .fx-reveal [data-card]') : null
  if (!holder || !onDuel()) return
  inspectNotice(holder)
})

addEventListener('keydown', (ev) => {
  if (!onDuel() || ev.defaultPrevented || (ev.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role="dialog"], [role="alertdialog"]')) return
  if (store.ask) return
  const prompt = activePrompt()
  if ((ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && prompt?.kind === 'cards' && isTargeting(prompt) && !duel.viewer && !store.menu && !(ev.target as HTMLElement).closest('button, [role="combobox"]')) {
    const targets = prompt.cards.flatMap((c) => {
      const el = boardCard(c.uid)
      return el && c.uid !== null ? [{ uid: c.uid, x: centerOf(el.getBoundingClientRect()).x }] : []
    }).sort((a, b) => a.x - b.x)
    const index = targets.findIndex((c) => c.uid === attackTargetOf(prompt))
    const next = targets[(index + (ev.key === 'ArrowRight' ? 1 : -1) + targets.length) % targets.length]
    if (next) { ev.preventDefault(); aimAttack(next.uid) }
    return
  }
  if (ev.key === 'Escape') cancel()
  if (duel.promptHidden) return
  if (ev.key === 'Enter' && !duel.viewer) {
    if ((ev.target as HTMLElement).closest('button')) return
    if (duel.direct || prompt?.kind === 'cards' && isTargeting(prompt)) confirmAttack()
    else sendPick()
  }
})

// Les coordonnées des deux extrémités changent quand le plateau se redimensionne.
addEventListener('resize', () => { if (onDuel()) syncArrows() })

addEventListener('contextmenu', (ev) => {
  if (!onDuel()) return
  // Au doigt, l'appui long ouvre la fiche : pas de menu du navigateur.
  if (isPhone()) return ev.preventDefault()
  const prompt = activePrompt()
  if (!duel.direct && !duel.targetArrow && prompt?.kind !== 'chain') return
  ev.preventDefault()
  cancel()
})
