import type { DuelView, Seat } from '../../shared/protocol.ts'
import type { Playbook } from './playbook.ts'
import type { Suspicion } from './suspicion.ts'

export interface Knowledge {
  seat: Seat
  hidden: Set<number>
  /** Instances adverses identifiées avant la simulation, sans connaître le contenu futur de son Deck. */
  visibleFoe?: Set<number>
  suspect: Suspicion
  playbook?: Playbook | null
  drawn?: Set<number>
  rootTurn?: number
  endPosition?: DuelView
}

export function branchKnowledge(k: Knowledge): Knowledge {
  return { ...k, hidden: new Set(k.hidden), drawn: new Set(k.drawn) }
}

export function visibleFoeOf(view: DuelView, seat: Seat): Set<number> {
  const foe = view.players[seat === 0 ? 1 : 0]
  return new Set([
    ...foe.hand, ...foe.graveyard, ...foe.banished, ...foe.extra,
    ...foe.monsters.flatMap((m) => m?.faceUp ? [m.card] : []),
    ...[...foe.spellTraps, foe.fieldZone].flatMap((s) => s?.faceUp ? [s.card] : []),
  ].filter((c) => c.cardId !== null).map((c) => c.uid))
}

/** Les cartes apparues du Deck adverse dans une copie n'étaient pas connues à la racine. */
export function rememberSimulation(view: DuelView, k: Knowledge): void {
  if (!k.visibleFoe) return
  const foe = view.players[k.seat === 0 ? 1 : 0]
  for (const c of [
    ...foe.hand, ...foe.graveyard, ...foe.banished, ...foe.extra,
    ...foe.monsters.flatMap((m) => m ? [m.card] : []),
    ...[...foe.spellTraps, foe.fieldZone].flatMap((s) => s ? [s.card] : []),
  ]) if (!k.visibleFoe.has(c.uid)) k.hidden.add(c.uid)
}

/** Instances que notre vue ne permet pas d'identifier au début de la recherche. */
export function hiddenOf(view: DuelView, seat: Seat): Set<number> {
  const foe = view.players[seat === 0 ? 1 : 0]
  const hidden = new Set<number>()
  for (const c of foe.hand) if (c.cardId === null) hidden.add(c.uid)
  for (const m of foe.monsters) if (m && (!m.faceUp || m.card.cardId === null)) hidden.add(m.card.uid)
  for (const s of [...foe.spellTraps, foe.fieldZone]) if (s && (!s.faceUp || s.card.cardId === null)) hidden.add(s.card.uid)
  return hidden
}

/** Même masque pour le jugement, les scripts et l'énumération des choix dans les copies. */
export function knownView(view: DuelView, k: Knowledge): DuelView {
  if (k.endPosition && k.rootTurn !== undefined && view.turn > k.rootTurn && view.winner === null) view = k.endPosition
  const other = k.seat === 0 ? 1 : 0
  const foe = view.players[other]
  const card = <T extends { uid: number | null; cardId: number | null }>(c: T): T => c.uid !== null && k.hidden.has(c.uid) ? { ...c, cardId: null } : c
  const players = [...view.players] as DuelView['players']
  players[other] = {
    ...foe,
    hand: foe.hand.map(card),
    graveyard: foe.graveyard.map(card),
    banished: foe.banished.map(card),
    extra: foe.extra.map(card),
    monsters: foe.monsters.map((m) => m && k.hidden.has(m.card.uid) ? { ...m, card: card(m.card), faceUp: false, atk: null, def: null } : m),
    spellTraps: foe.spellTraps.map((s) => s && k.hidden.has(s.card.uid) ? { ...s, card: card(s.card), faceUp: false } : s),
    fieldZone: foe.fieldZone && k.hidden.has(foe.fieldZone.card.uid) ? { ...foe.fieldZone, card: card(foe.fieldZone.card), faceUp: false } : foe.fieldZone,
  }
  if (k.drawn?.size) {
    const own = players[k.seat]
    const opaque = <T extends { uid: number; cardId: number | null }>(c: T): T => k.drawn!.has(c.uid) ? { ...c, cardId: null } : c
    players[k.seat] = {
      ...own,
      hand: own.hand.map(opaque), graveyard: own.graveyard.map(opaque), banished: own.banished.map(opaque), extra: own.extra.map(opaque),
      monsters: own.monsters.map((m) => m && k.drawn!.has(m.card.uid) ? { ...m, card: opaque(m.card), atk: null, def: null } : m),
      spellTraps: own.spellTraps.map((s) => s ? { ...s, card: opaque(s.card) } : s),
      fieldZone: own.fieldZone ? { ...own.fieldZone, card: opaque(own.fieldZone.card) } : null,
    }
  }
  let prompt = view.prompt
  if (prompt?.kind === 'cards') prompt = { ...prompt, cards: prompt.cards.map((c) => c.seat === other ? card(c) : c) }
  const maskedIds = new Set([
    ...foe.hand, ...foe.graveyard, ...foe.banished, ...foe.extra,
    ...foe.monsters.flatMap((m) => m ? [m.card] : []),
    ...[...foe.spellTraps, foe.fieldZone].flatMap((s) => s ? [s.card] : []),
  ].filter((c) => k.hidden.has(c.uid)).map((c) => c.cardId))
  const chain = view.chain.map((c) => c.seat === other && maskedIds.has(c.cardId) ? { ...c, cardId: 0 } : c)
  return { ...view, players, prompt, chain }
}
