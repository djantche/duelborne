// Lecture complète du terrain auprès du moteur, et identités stables des cartes.
//
// La vérité vient toujours du moteur : à chaque étape on relit tout, plutôt que de tenir à la main
// un état qui pourrait dériver.
import { OcgLocation, OcgMessageType, OcgPosition, OcgQueryFlags } from '../../../vendor/ocgcore/dist/index.js'
import type { OcgCoreSync, OcgDuelHandle, OcgMessage } from '../../../vendor/ocgcore/dist/index.js'

export const FACEUP = OcgPosition.FACEUP_ATTACK | OcgPosition.FACEUP_DEFENSE
export const ATTACK = OcgPosition.FACEUP_ATTACK | OcgPosition.FACEDOWN_ATTACK

const QUERY =
  OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.TYPE | OcgQueryFlags.LEVEL | OcgQueryFlags.RANK | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.IS_PUBLIC | OcgQueryFlags.OVERLAY_CARD | OcgQueryFlags.LSCALE | OcgQueryFlags.COUNTERS

/** Une carte telle que le moteur la décrit, plus l'identité stable qu'on lui attribue. */
export interface Card {
  uid: number
  code: number
  position: number
  type: number
  atk: number
  def: number
  level: number
  isPublic: boolean
  materials: number
  /** Codes des Matériels Xyz attachés (publics). */
  overlay: number[]
  scale: number
  /** Compteurs posés sur la carte : type du moteur → nombre. */
  counters: Record<number, number>
}

export interface Side {
  lp: number
  deck: number
  hand: Card[]
  /** 7 zones : 5 principales, puis les 2 Zones Monstre Extra. */
  mzone: (Card | null)[]
  /** 8 zones : 5 Magie/Piège (les extrémités servent de Zones Pendule), puis la Zone Terrain (5). */
  szone: (Card | null)[]
  grave: Card[]
  removed: Card[]
  extra: Card[]
}

/** État complet du terrain, indexé par numéro de joueur DU MOTEUR (0 = celui qui joue en premier). */
export interface Snap {
  sides: [Side, Side]
  chain: { code: number; controller: number }[]
}

export interface Loc {
  controller: number
  location: number
  sequence: number
}

export const isFaceUp = (c: Card): boolean => (c.position & FACEUP) !== 0

export function readSnapshot(core: OcgCoreSync, handle: OcgDuelHandle): Snap {
  const field = core.duelQueryField(handle)
  const read = (p: 0 | 1, location: number): (Card | null)[] =>
    core.duelQueryLocation(handle, { controller: p, location: location as never, flags: QUERY as never }).map((q) =>
      q && q.code !== undefined
        ? {
            uid: 0,
            code: q.code,
            position: q.position ?? OcgPosition.FACEDOWN_DEFENSE,
            type: q.type ?? 0,
            atk: q.attack ?? 0,
            def: q.defense ?? 0,
            level: q.level || q.rank || 0,
            isPublic: q.isPublic ?? false,
            materials: q.overlayCards?.length ?? 0,
            overlay: q.overlayCards ?? [],
            scale: q.leftScale ?? 0,
            counters: q.counters ?? {},
          }
        : null,
    )
  const list = (p: 0 | 1, location: number): Card[] => read(p, location).filter((c): c is Card => c !== null)
  const side = (p: 0 | 1): Side => ({
    // Les LP passent sous zéro au coup fatal.
    lp: Math.max(0, field.players[p].lp),
    deck: field.players[p].deck_size,
    hand: list(p, OcgLocation.HAND),
    mzone: read(p, OcgLocation.MZONE),
    szone: read(p, OcgLocation.SZONE),
    grave: list(p, OcgLocation.GRAVE),
    removed: list(p, OcgLocation.REMOVED),
    extra: list(p, OcgLocation.EXTRA),
  })
  return { sides: [side(0), side(1)], chain: field.chain.map((c) => ({ code: c.code, controller: c.controller })) }
}

export function cardAt(snap: Snap, loc: Loc): Card | null {
  const side = snap.sides[loc.controller === 0 ? 0 : 1]
  const l = loc.location
  if (l & OcgLocation.MZONE) return side.mzone[loc.sequence] ?? null
  if (l & OcgLocation.SZONE) return side.szone[loc.sequence] ?? null
  if (l & OcgLocation.HAND) return side.hand[loc.sequence] ?? null
  if (l & OcgLocation.GRAVE) return side.grave[loc.sequence] ?? null
  if (l & OcgLocation.REMOVED) return side.removed[loc.sequence] ?? null
  if (l & OcgLocation.EXTRA) return side.extra[loc.sequence] ?? null
  return null
}

const LISTS = ['hand', 'grave', 'removed', 'extra'] as const
const SLOTS = ['mzone', 'szone'] as const

/** Suit les MOVE dans leur ordre moteur avant de raccorder la lecture finale. Deux copies identiques gardent ainsi leur propre uid. */
export class UidTracker {
  private next = 1
  private moves = new WeakMap<object, Card>()

  movement(message: object): Card | null { return this.moves.get(message) ?? null }

  /** @param reshuffled joueurs (du moteur) dont la main vient d'être mélangée */
  assign(prev: Snap | null, snap: Snap, reshuffled: Set<number> = new Set(), messages: OcgMessage[] = []): void {
    const free = new Map<number, number[]>()
    const used = new Set<number>()
    const take = (old: Card | null | undefined, card: Card): boolean => {
      if (card.uid || !old || old.code !== card.code || used.has(old.uid)) return false
      card.uid = old.uid
      used.add(old.uid)
      return true
    }
    this.moves = new WeakMap()
    if (prev && messages.length) {
      const projected = this.project(prev, messages)
      for (const p of [0, 1] as const) for (const zone of [...SLOTS, ...LISTS]) snap.sides[p][zone].forEach((card, i) => card && take(projected.sides[p][zone][i], card))
    }
    if (prev) {
      for (const p of [0, 1] as const) {
        const a = prev.sides[p]
        const b = snap.sides[p]
        for (const zone of SLOTS) b[zone].forEach((card, i) => card && take(a[zone][i], card))
        for (const zone of LISTS) {
          // Une main mélangée repart avec de nouvelles identités : on ne doit pas pouvoir suivre une carte cachée.
          if (zone === 'hand' && reshuffled.has(p)) continue
          b[zone].forEach((card, i) => take(a[zone][i], card))
          for (const card of b[zone]) if (!card.uid) a[zone].some((old) => take(old, card))
        }
      }
      for (const p of [0, 1] as const) {
        const a = prev.sides[p]
        const olds = [...a.mzone, ...a.szone, ...a.grave, ...a.removed, ...a.extra, ...(reshuffled.has(p) ? [] : a.hand)]
        for (const old of olds) if (old && !used.has(old.uid)) free.set(old.code, [...(free.get(old.code) ?? []), old.uid])
      }
    }
    for (const side of snap.sides) {
      for (const card of [...side.mzone, ...side.szone, ...side.hand, ...side.grave, ...side.removed, ...side.extra]) {
        if (!card || card.uid) continue
        card.uid = free.get(card.code)?.shift() ?? this.next++
      }
    }
  }
  private token(code: number, position: number): Card {
    return { uid: this.next++, code, position, type: 0, atk: 0, def: 0, level: 0, isPublic: false, materials: 0, overlay: [], scale: 0, counters: {} }
  }

  private project(prev: Snap, messages: OcgMessage[]): Snap {
    const work = structuredClone(prev)
    const listAt = (loc: Loc & { overlay_sequence?: number }): (Card | null)[] | null => {
      if (loc.overlay_sequence !== undefined) return null
      const side = work.sides[loc.controller === 0 ? 0 : 1]
      for (const [bit, key] of [[OcgLocation.HAND, 'hand'], [OcgLocation.MZONE, 'mzone'], [OcgLocation.SZONE, 'szone'], [OcgLocation.GRAVE, 'grave'], [OcgLocation.REMOVED, 'removed'], [OcgLocation.EXTRA, 'extra']] as const) if (loc.location & bit) return side[key]
      return null
    }
    for (const message of messages) {
      if (message.type === OcgMessageType.MOVE) {
        const source = listAt(message.from)
        let card = source?.[message.from.sequence] ?? null
        if (source && message.from.sequence < source.length) {
          if (message.from.location & (OcgLocation.MZONE | OcgLocation.SZONE)) source[message.from.sequence] = null
          else source.splice(message.from.sequence, 1)
        }
        if (!card || card.code !== message.card) card = this.token(message.card, message.from.position)
        this.moves.set(message, { ...card })
        card.position = message.to.position
        const destination = listAt(message.to)
        if (destination) {
          if (message.to.location & (OcgLocation.MZONE | OcgLocation.SZONE)) destination[message.to.sequence] = card
          else destination.splice(Math.min(message.to.sequence, destination.length), 0, card)
        }
      } else if (message.type === OcgMessageType.DRAW) {
        work.sides[message.player === 0 ? 0 : 1].hand.push(...message.drawn.map((drawn) => this.token(drawn.code, drawn.position)))
      } else if (message.type === OcgMessageType.SHUFFLE_HAND) {
        work.sides[message.player === 0 ? 0 : 1].hand = message.cards.map((code) => this.token(code & 0x7fffffff, OcgPosition.FACEDOWN_DEFENSE))
      } else if (message.type === OcgMessageType.TAG_SWAP) {
        work.sides[message.player === 0 ? 0 : 1].hand = []
      } else if (message.type === OcgMessageType.SWAP) {
        const a = listAt(message.card1), b = listAt(message.card2)
        if (a && b) [a[message.card1.sequence], b[message.card2.sequence]] = [b[message.card2.sequence] ?? null, a[message.card1.sequence] ?? null]
      }
    }
    return work
  }

}
