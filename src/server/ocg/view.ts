// Ce qu'un joueur a le droit de voir : c'est la seule chose envoyée aux clients.
import type { CardView, CounterView, DuelView, LogEntry, MiniCard, Phase, PlayerView, Prompt, Seat, Winner } from '../../shared/protocol.ts'
import { TYPE, counterName, displayId, isKnownToClient, miniCard } from './data.ts'
import { ATTACK, isFaceUp } from './snapshot.ts'
import type { Card, Snap } from './snapshot.ts'

export interface ViewMeta {
  /** Zones rendues inutilisables : bits du moteur, 16 par joueur du moteur. */
  disabled: number
  turn: number
  turnPlayer: Seat
  phase: Phase
  winner: Winner
  log: LogEntry[]
  extraZones: boolean
  startLp: number
  /** seatOf[i] = siège du joueur n°i du moteur. */
  seatOf: [Seat, Seat]
}

export function buildView(seat: Seat | null, snap: Snap, meta: ViewMeta, pending: { seat: Seat; prompt: Prompt } | null): DuelView {
  const unknownCards: Record<number, MiniCard> = {}
  const show = (card: Card, visible: boolean): CardView => {
    if (!visible) return { uid: card.uid, cardId: null }
    const id = displayId(card.code)
    if (!isKnownToClient(id)) unknownCards[id] = miniCard(card.code)
    return { uid: card.uid, cardId: id }
  }
  /** Matériels Xyz d'un monstre visible : toujours face recto, donc publics. */
  const materialsOf = (c: Card, visible: boolean): { materialCards?: number[] } => {
    if (!visible || !c.overlay.length) return {}
    return { materialCards: c.overlay.map((code) => { const id = displayId(code); if (!isKnownToClient(id)) unknownCards[id] = miniCard(code); return id }) }
  }
  /** Compteurs d'une carte visible, sous la forme `{ counters }` (rien si elle n'en porte pas). */
  const counters = (c: Card, visible: boolean): { counters?: CounterView[] } => {
    const list = visible ? Object.entries(c.counters).flatMap(([type, count]) => (count > 0 ? [{ name: counterName(Number(type)), count }] : [])) : []
    return list.length ? { counters: list } : {}
  }
  const build = (s: Seat): PlayerView => {
    const side = snap.sides[meta.seatOf[0] === s ? 0 : 1]
    const mine = s === seat
    const spell = (c: Card | null | undefined): PlayerView['fieldZone'] =>
      c ? { card: show(c, mine || isFaceUp(c)), faceUp: isFaceUp(c), scale: isFaceUp(c) && c.type & TYPE.PENDULUM ? c.scale : null, ...counters(c, mine || isFaceUp(c)) } : null
    return {
      lp: side.lp,
      deckCount: side.deck,
      hand: side.hand.map((c) => show(c, mine || c.isPublic)),
      monsters: side.mzone.slice(0, 7).map((c) => {
        if (!c) return null
        const visible = mine || isFaceUp(c)
        return { card: show(c, visible), position: c.position & ATTACK ? 'atk' : 'def', faceUp: isFaceUp(c), atk: visible ? c.atk : null, def: visible ? c.def : null, materials: c.materials, ...materialsOf(c, visible), ...counters(c, visible) }
      }),
      spellTraps: side.szone.slice(0, 5).map(spell),
      fieldZone: spell(side.szone[5]),
      graveyard: side.grave.map((c) => show(c, true)),
      banished: side.removed.map((c) => show(c, mine || isFaceUp(c))),
      extra: side.extra.map((c) => show(c, mine || isFaceUp(c))),
    }
  }
  return {
    you: seat ?? 0,
    players: [build(0), build(1)],
    turn: meta.turn,
    turnPlayer: meta.turnPlayer,
    phase: meta.phase,
    winner: meta.winner,
    log: meta.log.slice(-80),
    logOffset: Math.max(0, meta.log.length - 80),
    prompt: pending?.seat === seat ? pending.prompt : null,
    waitingFor: pending?.seat ?? null,
    disabled: disabledZones(meta.disabled, meta.seatOf),
    chain: snap.chain.map((c) => ({ cardId: displayId(c.code), seat: meta.seatOf[c.controller === 0 ? 0 : 1] })),
    spectating: false,
    ...(seat === null ? { watching: true } : {}),
    startLp: meta.startLp,
    extraZones: meta.extraZones,
    unknownCards,
  }
}

/** Zones inutilisables, sous la forme « siège:m:rang » (monstres) ou « siège:s:rang » (Magies, Pièges, Terrain). */
function disabledZones(mask: number, seatOf: [Seat, Seat]): string[] {
  const out: string[] = []
  for (const engine of [0, 1] as const) {
    const bits = engine === 0 ? mask & 0xffff : mask >>> 16
    for (let i = 0; i < 7; i++) if (bits & (1 << i)) out.push(`${seatOf[engine]}:m:${i}`)
    for (let i = 0; i < 6; i++) if (bits & (1 << (8 + i))) out.push(`${seatOf[engine]}:s:${i}`)
  }
  return out
}
