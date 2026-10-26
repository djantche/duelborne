// Ce que la question en cours change à l'écran : cartes en surbrillance, zones proposées, message d'aide.
// Tout est calculé à partir de l'état (aucun accès au DOM) : les composants n'ont plus qu'à l'afficher.
import type { DuelView, Prompt, Zone } from '../../../shared/protocol.ts'
import { cx } from '../../ui/cx.ts'
import { duel } from './state.ts'
import type { Side } from './state.ts'
import { t, tx } from '../../i18n.ts'
import { duelistName } from './perspective.ts'

export type CardsPrompt = Extract<Prompt, { kind: 'cards' }>
export type ChainPrompt = Extract<Prompt, { kind: 'chain' }>

/** Question à laquelle le joueur peut répondre maintenant (aucune pendant qu'une animation se joue). */
export const activePrompt = (): Prompt | null => (duel.busy ? null : (duel.view?.prompt ?? null))

export const isTargeting = (p: CardsPrompt): boolean => p.attackerUid !== undefined
/** Une visée reste toujours sur une cible légale, y compris avant le premier geste. */
export const attackTargetOf = (p: CardsPrompt): number | null => p.cards.find((c) => c.uid === duel.attackTarget)?.uid ?? p.cards.find((c) => c.uid !== null)?.uid ?? null
/** Valeur d'un Sacrifice cocher (certains monstres en valent 2). */
export const pickedWeight = (p: CardsPrompt): number => duel.picked.reduce((t, i) => t + (p.weights?.[i] ?? 1), 0)

export const canSendPick = (p: CardsPrompt): boolean => {
  if (p.mode === 'step') return duel.picked.length === 1
  // Sacrifices : c'est le total des valeurs qui doit atteindre le nombre demandé.
  if (p.weights) return pickedWeight(p) >= p.min && pickedWeight(p) <= p.max
  return duel.picked.length >= p.min && duel.picked.length <= p.max
}

/** Les cartes imposées (déjà cochées par le moteur) ne se touchent pas. */
export const isFixed = (p: CardsPrompt, i: number): boolean => i < (p.mustCount ?? 0)

/** Cartes visibles sur le plateau : mains, terrain, dessus des Cimetières. */
export function boardUids(v: DuelView): Set<number> {
  const uids = new Set<number>()
  for (const p of v.players) {
    for (const c of p.hand) uids.add(c.uid)
    for (const z of [...p.monsters, ...p.spellTraps, p.fieldZone]) if (z) uids.add(z.card.uid)
    const top = p.graveyard[p.graveyard.length - 1]
    if (top) uids.add(top.uid)
  }
  return uids
}

/** Une carte proposée est-elle visible sur le plateau (main, terrain, dessus du Cimetière) ? */
export const cardOnBoard = (c: CardsPrompt['cards'][number], board: Set<number>): boolean => c.uid !== null && board.has(c.uid)

/** Une sélection se fait sur le plateau dès qu'une carte proposée y est visible : les autres (Deck, Extra, Cimetière) s'ouvrent à la demande. */
export const onBoard = (p: CardsPrompt, board: Set<number>): boolean => p.cards.some((c) => cardOnBoard(c, board))

/** Indices des cartes proposées qui ne sont pas sur le plateau. */
export const offBoardIndexes = (p: CardsPrompt, board: Set<number>): number[] => p.cards.flatMap((c, i) => (cardOnBoard(c, board) ? [] : [i]))

/**
 * Cocher cette carte rendrait la sélection impossible : nombre maximal atteint, total des Niveaux dépassé, Sacrifices en trop.
 * Ces cartes sont grisées et ne se cochent pas. Rien n'est jamais bloqué pour une carte déjà cochée (on peut toujours décocher).
 */
export function isBlocked(p: CardsPrompt, i: number): boolean {
  if (isFixed(p, i) || duel.picked.includes(i) || p.mode === 'step' || p.ordered || isTargeting(p)) return false
  if (p.sum) {
    // Une carte qui peut valoir plusieurs Niveaux rend le calcul ambigu : on laisse le moteur trancher.
    if (p.sum.amounts.some((a) => a.length > 1)) return false
    const total = pickedTotal(p)
    const add = p.sum.amounts[i]?.[0] ?? 0
    return p.sum.atLeast ? total >= p.sum.target : total + add > p.sum.target
  }
  if (p.weights) return pickedWeight(p) + (p.weights[i] ?? 1) > p.max
  return p.max > 1 && duel.picked.length >= p.max
}

/** Niveau(x) que vaut une carte dans une sélection par somme (« 4 » ou « 4/1 » quand elle peut compter pour deux valeurs). */
export const amountOf = (p: CardsPrompt, i: number): string => (p.sum?.amounts[i] ?? []).join('/')
/** Somme des Niveaux des cartes cochées (première valeur de chaque carte), cartes imposées comprises. */
export const pickedTotal = (p: CardsPrompt): number => (p.sum?.fixed ?? 0) + duel.picked.reduce((t, i) => t + (p.sum?.amounts[i]?.[0] ?? 0), 0)

/**
 * Numéro d'effet à afficher pour chaque option, quand une même carte en propose plusieurs (sinon rien) :
 * celui du script de la carte s'ils sont tous connus et distincts, sinon l'ordre proposé par le moteur.
 * L'activation de la carte elle-même (ni texte ni numéro) n'est pas comptée parmi ses effets.
 */
export function effectNumbers<T extends { uid: number | null; cardId: number | null; effect?: number; label?: string; hasText?: true }>(options: T[]): Map<T, number> {
  const groups = new Map<string, T[]>()
  for (const o of options) groups.set(`${o.uid}:${o.cardId}`, [...(groups.get(`${o.uid}:${o.cardId}`) ?? []), o])
  const numbers = new Map<T, number>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const effects = group.filter((o) => o.effect !== undefined || o.label || o.hasText)
    const known = new Set(effects.map((o) => o.effect))
    const trusted = !known.has(undefined) && known.size === effects.length
    effects.forEach((o, i) => numbers.set(o, trusted ? (o.effect as number) : i + 1))
  }
  return numbers
}

/** Réponse en chaîne : les options regroupées par carte (indices dans prompt.options). Une carte = une vignette. */
export function replyGroups(p: ChainPrompt): number[][] {
  const groups = new Map<string, number[]>()
  p.options.forEach((o, i) => {
    const key = o.uid === null ? `#${i}` : String(o.uid)
    groups.set(key, [...(groups.get(key) ?? []), i])
  })
  return [...groups.values()]
}

/** Comment la question en cours se présente. */
export type PromptMode = 'none' | 'actions' | 'direct' | 'reply' | 'yesno' | 'options' | 'position' | 'place' | 'target' | 'pick' | 'chooser' | 'announce' | 'counters'

export interface Marks {
  mode: PromptMode
  /** Classes d'état de chaque carte (« can », « pickable », « picked »...), par uid. */
  cards: Map<number, string>
  /** Valeur annoncée sur une carte pendant un choix par somme de Niveaux. */
  lv: Map<number, string>
  /** Classes des piles, par « côté:pile » (« me:gy »). */
  piles: Map<string, string>
  /** Zones proposées : « siège:m:rang » (monstres) ou « siège:s:rang » (Magies, Pièges, Terrain) → valeur à renvoyer. */
  places: Map<string, number>
  /** Zones déjà cochées (quand il en faut plusieurs). */
  placed: Set<string>
  /** Zones rendues inutilisables par un effet. */
  disabled: Set<string>
  aiming: boolean
  /** Message d'aide affiché au-dessus de la main ; `waiting` : ce n'est pas à nous de jouer. */
  hint: string
  waiting: boolean
}

const pileKind = (zone: Zone | null): 'extra' | 'gy' | 'deck' | null => (zone === 'extra' ? 'extra' : zone === 'graveyard' || zone === 'banished' ? 'gy' : zone === 'deck' ? 'deck' : null)

export function computeMarks(): Marks {
  const m: Marks = { mode: 'none', cards: new Map(), lv: new Map(), piles: new Map(), places: new Map(), placed: new Set(), disabled: new Set(), aiming: false, hint: '', waiting: false }
  const v = duel.view
  if (!v) return m
  for (const z of v.disabled ?? []) m.disabled.add(z)
  const board = boardUids(v)
  const mark = (uid: number | null | undefined, cls: string): void => {
    if (uid !== null && uid !== undefined) m.cards.set(uid, cx(m.cards.get(uid), cls))
  }
  const flag = (zone: Zone | null, cls: string, side: Side = 'me'): void => {
    const kind = pileKind(zone)
    if (kind) m.piles.set(`${side}:${kind}`, cx(m.piles.get(`${side}:${kind}`), cls))
  }
  const prompt = activePrompt()

  // La consultation du terrain garde les cartes lisibles, sans proposer d'actions ni changer les choix.
  if (prompt && duel.promptHidden) return m

  if (!prompt) {
    if (duel.busy || v.winner !== null || v.waitingFor === null) m.hint = ''
    else if (v.watching) m.hint = t('hint.playerThinks', { name: duelistName(duel.names, v.waitingFor) })
    else if (v.waitingFor !== v.you) m.hint = t('hint.foeThinks')
    else if (v.spectating) m.hint = t('hint.mateThinks')
    m.waiting = m.hint !== ''
  } else if (duel.direct) {
    m.mode = 'direct'
    m.aiming = true
    mark(duel.direct.uid, 'selected')
  } else if (prompt.kind === 'idle' || prompt.kind === 'battle') {
    m.mode = 'actions'
    for (const o of prompt.options) {
      mark(o.uid, 'can')
      if (o.action === 'activate') mark(o.uid, 'effect-ready')
      if (prompt.kind === 'battle' && o.action === 'attack') mark(o.uid, 'attack-ready')
      // Une pile ne signale que les effets activables des cartes qui ne sont pas visibles sur le plateau.
      if (o.action === 'activate' && (o.uid === null || !board.has(o.uid))) flag(o.zone, 'has-actions')
    }
    if (prompt.kind === 'battle' && prompt.options.some((o) => o.action === 'attack')) m.hint = t('hint.pickAttacker')
  } else if (prompt.kind === 'chain') {
    m.mode = 'reply'
    for (const o of prompt.options) mark(o.uid, 'chainable effect-ready')
    const group = duel.replyGroup === null ? undefined : replyGroups(prompt)[duel.replyGroup]
    mark(prompt.options[group?.[0] ?? -1]?.uid, 'picked')
  } else if (prompt.kind === 'yesno') {
    m.mode = 'yesno'
  } else if (prompt.kind === 'announce') {
    m.mode = 'announce'
  } else if (prompt.kind === 'counters') {
    m.mode = 'counters'
  } else if (prompt.kind === 'option' || prompt.kind === 'number') {
    m.mode = 'options'
  } else if (prompt.kind === 'position') {
    m.mode = 'position'
  } else if (prompt.kind === 'place') {
    m.mode = 'place'
    prompt.zones.forEach((z, i) => {
      const key = `${z.seat}:${z.zone === 'monster' ? 'm' : 's'}:${z.index}`
      m.places.set(key, i)
      if (duel.picked.includes(i)) m.placed.add(key)
    })
    // Tant que la zone n'est pas choisie, la carte n'est pas posée : le panneau propose encore de renoncer.
    if (!prompt.undoable && prompt.count === 1) m.hint = tx(prompt.text)
  } else if (prompt.kind !== 'cards') {
    // toutes les autres questions ont été traitées plus haut
  } else if (isTargeting(prompt)) {
    // Cible d'une attaque : flèche depuis l'attaquant.
    m.mode = 'target'
    m.aiming = true
    mark(prompt.attackerUid, 'selected')
    for (const c of prompt.cards) mark(c.uid, 'targetable')
    mark(attackTargetOf(prompt), 'aimed')
    if (!prompt.cancelable) m.hint = t('p.targetHint')
  } else if (onBoard(prompt, board)) {
    m.mode = 'pick'
    prompt.cards.forEach((c, i) => {
      const picked = isFixed(prompt, i) || duel.picked.includes(i)
      if (cardOnBoard(c, board)) {
        mark(c.uid, picked ? 'picked' : isBlocked(prompt, i) ? 'blocked' : 'pickable')
        if (c.selected) mark(c.uid, 'selected')
        // Sélection par somme : chaque carte annonce ce qu'elle vaut.
        if (prompt.sum && c.uid !== null) m.lv.set(c.uid, amountOf(prompt, i))
      } else flag(c.zone, picked ? 'locate' : isBlocked(prompt, i) ? '' : 'has-actions', c.seat === v.you ? 'me' : 'foe')
    })
  } else {
    m.mode = 'chooser'
    // Rien n'est visible sur le plateau : les piles qui contiennent des cartes proposées pulsent.
    prompt.cards.forEach((c, i) => flag(c.zone, duel.picked.includes(i) ? 'locate' : 'has-actions', c.seat === v.you ? 'me' : 'foe'))
  }
  return m
}
