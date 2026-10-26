import type { GameEvent, MoveKind } from '../../../shared/protocol.ts'
import type { MatchReplay } from '../../../shared/replay.ts'
import { MOTION } from '../duel/motion.ts'
import { FUSION_DURATION } from '../duel/fusionMotion.ts'
import { CARD_NOTICE_DURATION } from '../duel/cardNoticeMotion.ts'
import { SUMMON_DURATION } from '../duel/summonMotion.ts'
import { hasSummonArtwork } from '../duel/summonAssets.ts'
import { DESTRUCTION_DURATION } from '../duel/anim.ts'
import { ACTIVATION_LIFT_DURATION } from '../duel/effectActivation.ts'

/** Pause entre deux actions de la relecture, à vitesse ×1. */
export const STEP_GAP_MS = 400

// Durées reprises des mises en scène de `duel/sequence.ts` (vitesse ×1). Les vols ajoutent 50 ms de contact.
const LAND = 50
const SHOWCASE = CARD_NOTICE_DURATION
const RESOLVE = CARD_NOTICE_DURATION
const HINT = CARD_NOTICE_DURATION
const NEGATED = 160 + 260 + 600 + 180
const BATTLE = 330 + 110 + 170 + 340
const LIFE = 420 + 520
const CRUSH = DESTRUCTION_DURATION
const HAND_SHUFFLE = 1_300
const DECK_RIFFLE = 900
const THROW = 2_000
const RPS = 3_000
const START = 500 + DECK_RIFFLE + 120 + 150 * 5 + MOTION.deal.duration + LAND

const fly = (how: MoveKind): number => MOTION[how].duration + LAND + (how === 'banish' ? 480 : how === 'material' ? 260 : 0)
const toMove = (to: string | undefined): MoveKind => to === 'banished' ? 'banish' : to === 'deck' ? 'toDeck' : to === 'extra' ? 'toExtra' : to === 'hand' ? 'toHand' : 'toGrave'

/**
 * Durée prévue d'une action à vitesse ×1 : la mise en scène avant le redessin (séquentielle),
 * puis les vols après le redessin (simultanés) et les effets sur le plateau. Estimation, pas mesure.
 */
export function estimateFrameMs(events: GameEvent[]): number {
  const starting = events.some((e) => e.type === 'start')
  const shuffling = !starting && events.some((e) => e.type === 'shuffle')
  let pre = 0
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    switch (e.type) {
      case 'attack': pre += 220 + 340; break
      case 'flip': pre += 480; break
      case 'battle': pre += BATTLE; break
      case 'destroy': {
        let n = 0
        let longest = 0
        while (events[i + n]?.type === 'destroy') {
          const d = events[i + n] as Extract<GameEvent, { type: 'destroy' }>
          longest = Math.max(longest, n * 90 + CRUSH + (d.to === 'hand' && !shuffling ? 0 : fly(toMove(d.to))))
          n++
        }
        i += n - 1
        pre += longest
        break
      }
      case 'tribute': pre += 280 + fly(toMove(e.to)); break
      case 'chain': pre += SHOWCASE + (e.uid === null ? 0 : ACTIVATION_LIFT_DURATION); break
      case 'chainResolve': pre += RESOLVE; break
      case 'cardHint': {
        const before = events[i - 1]
        if (!(before?.type === 'cardHint' && before.cardId === e.cardId)) pre += HINT
        break
      }
      case 'target': pre += 360; break
      // La consultation des cartes révélées se joue en parallèle ; elle n'allonge pas cette action.
      case 'reveal': break
      case 'chainNegated': pre += NEGATED; break
      case 'attackNegated': pre += 520; break
      case 'move': {
        if (e.how === 'toField' || e.how === 'create') break
        let n = 0
        while (events[i + n]?.type === 'move' && (events[i + n] as Extract<GameEvent, { type: 'move' }>).how === e.how) n++
        i += n - 1
        if (e.how === 'toHand' && !shuffling) break
        pre += Math.min((n - 1) * (e.how === 'mill' ? 85 : 110), 660) + fly(e.how)
        break
      }
      case 'shuffle': if (!starting) pre += HAND_SHUFFLE; break
      case 'dice': case 'coin': pre += THROW; break
      case 'rps': pre += RPS; break
      case 'damage': case 'recover': case 'cost': pre += LIFE; break
      default: break
    }
  }
  // Après le redessin : les vols partent ensemble, la plus longue file donne le rythme.
  let flights = 0
  const drawn = [0, 0]
  for (const e of events) {
    if (e.type === 'draw') drawn[e.player] = (drawn[e.player] ?? 0) + e.count
    else if (e.type === 'move' && e.how === 'toField') flights = Math.max(flights, fly('toField'))
    else if (e.type === 'move' && e.how === 'toHand' && !shuffling) flights = Math.max(flights, fly('toHand'))
    else if (e.type === 'summon') flights = Math.max(flights, MOTION.summon.duration + LAND)
    else if (e.type === 'set') flights = Math.max(flights, MOTION.set.duration + LAND)
    else if (e.type === 'position') flights = Math.max(flights, 480)
    else if (e.type === 'control') flights = Math.max(flights, MOTION.control.duration + LAND)
  }
  if (!starting) for (const n of drawn) if (n) flights = Math.max(flights, 80 * n + MOTION.draw.duration + LAND)
  let effects = 0
  for (const e of events) {
    if (e.type === 'move' && e.how === 'create') effects = Math.max(effects, 560)
    else if (e.type === 'equip') effects = Math.max(effects, 520)
    else if (e.type === 'shuffleDeck') effects = Math.max(effects, DECK_RIFFLE)
  }
  const presentations = new Set(events.flatMap((event) => event.type === 'summon' && hasSummonArtwork(event.cardId) ? [event.cardId] : [])).size
  return Math.round(pre + presentations * SUMMON_DURATION + events.filter((event) => event.type === 'summon' && event.kind === 'fusion' && !!event.fusionMaterials?.length).length * FUSION_DURATION + (starting ? START : 0) + flights + effects)
}

/**
 * Chronologie en millisecondes (vitesse ×1) : `starts[i]` est l'instant où l'action i est jouée.
 * Les durées déjà mesurées sur cet appareil remplacent l'estimation.
 */
export function replayTimeline(match: MatchReplay, measured: (number | null)[] = []): number[] {
  const starts = [0]
  for (let i = 1; i < match.frames.length; i++) {
    const known = measured[i]
    const frame = match.frames[i]!
    const step = typeof known === 'number' && Number.isFinite(known) && known > 0 ? known : estimateFrameMs(frame.events) + STEP_GAP_MS
    starts.push(starts[i - 1]! + step)
  }
  return starts
}

/** « 4:07 » ou « 1:02:07 ». */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
