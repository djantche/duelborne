// Connaissances et sélections partagées par les trois niveaux. Elles ne lisent que la vue du joueur.
import type { DuelView, MonsterView, Prompt, PromptCard, Seat } from '../../shared/protocol.ts'
import { parseMsg } from '../../shared/msg.ts'
import { TYPE, cardData } from '../ocg/data.ts'
import { makeCtx } from './playbook.ts'
import type { Playbook } from './playbook.ts'
import { effectValue, effectsOf } from './effects.ts'

export type CardsPrompt = Extract<Prompt, { kind: 'cards' }>
export type Intent = 'cost' | 'gain' | 'harm'
const COST = new Set([500, 501, 504, 507, 511, 512, 513, 519, 531])
const HARM = new Set([502, 503, 505, 514, 515, 516, 517, 520, 530, 549, 551, 575])
export const HAND_TRAPS = new Set([14558127, 97268402, 10045474, 23434538, 59438930, 73642296, 27204311, 94145021])
// Maxx « C », Droll, Nibiru et Ghost Ogre sont des interruptions, mais n'annulent pas le maillon en cours.
export const NEGATES = new Set([14558127, 97268402, 10045474, 73642296, 24224830, 84815190, 89604813, 80453041, 62318994, 41420027, 84749824, 40605147])

/** Une référence traduite du moteur devient un texte de travail, sans dépendre de la langue du client. */
export function effectText(label: string): string {
  const message = parseMsg(label)
  return message?.key === '=' ? String(message.params.en ?? message.params.fr ?? '') : label
}

export const intentOf = (p: CardsPrompt): Intent => p.sum || p.weights || COST.has(p.hint) ? 'cost' : HARM.has(p.hint) ? 'harm' : 'gain'

/** Valeur de conservation : effet, interruption et ressources priment aussi sur l'ATK. */
export function cardWorth(cardId: number | null, monster?: MonsterView | null): number {
  if (cardId === null) return 700
  const d = cardData(cardId)
  if (!d) return 500
  const type = d.type
  let value = 420
  if (type & TYPE.MONSTER) {
    value += 0.28 * Math.max(0, monster?.atk ?? d.attack) + 0.08 * Math.max(0, monster?.def ?? d.defense)
    if (type & 0x20) value += 220
    if (type & (0x40 | 0x2000 | TYPE.XYZ | TYPE.LINK | 0x80)) value += 450
    value += 100 * (monster?.materials ?? 0)
  } else value += type & TYPE.CONTINUOUS ? 250 : 160
  value += effectValue(cardId)
  if (HAND_TRAPS.has(cardId)) value = 1100
  return value
}

/** Score d'une sélection : élevé = choisir cette carte. */
export function selectionScore(view: DuelView, seat: Seat, p: CardsPrompt, card: PromptCard, pb: Playbook | null): number {
  const intent = intentOf(p)
  const own = card.seat === seat
  const monster = view.players[card.seat].monsters.find((m) => m?.card.uid === card.uid && card.uid !== null)
  let value = own ? pb?.rate?.(makeCtx(view, seat, pb.deck), card, intent, p) : undefined
  value ??= cardWorth(card.cardId, monster)
  if (intent === 'cost') {
    if (!own) return 4000 + value
    // Un matériel au Cimetière coûte moins qu'une interruption en main ou un monstre déjà déployé.
    if (card.zone === 'graveyard') value *= 0.35
    if (card.zone === 'hand' && effectsOf(card.cardId).grave) value *= 0.55
    return -value
  }
  if (intent === 'harm') {
    // Une négation ciblée doit d'abord viser le monstre dont l'effet attend sa résolution,
    // plutôt qu'un gros monstre sans rapport. La cible peut être demandée avant l'ajout de notre maillon.
    const top = view.chain.at(-1)
    const source = top?.seat === seat && NEGATES.has(top.cardId) ? view.chain.at(-2) : top
    const negating = p.hint === 575 || p.hint === 514
    const called = p.hint === 503 && view.players[seat].spellTraps.some((s) => s?.faceUp && s.card.cardId === 24224830)
    const disrupts = !own && source?.seat === card.seat && source.cardId === card.cardId && (negating || called)
    return own ? -value : 4000 + value + (disrupts ? 1800 : 0)
  }
  // Chercher un doublon d'une carte à usage unique apporte moins qu'une nouvelle ressource.
  const copies = own && card.cardId !== null ? view.players[seat].hand.filter((c) => c.cardId === card.cardId).length : 0
  return value - Math.min(2, copies) * 170
}

interface Selection { picks: number[]; total: number; score: number }

/**
 * Plusieurs sélections légales, classées par utilité. Les sommes sont résolues par programmation dynamique :
 * les cartes après la douzième, les niveaux alternatifs et les sacrifices doubles restent accessibles.
 */
export function cardSelections(p: CardsPrompt, score: (card: PromptCard) => number, limit = 12): number[][] {
  const pool = p.cards.map((card, i) => ({ card, i, score: score(card) })).filter((x) => !x.card.selected && x.i >= (p.mustCount ?? 0))
  const material = !!p.sum || !!p.weights
  const target = p.sum ? p.sum.target - (p.sum.fixed ?? 0) : p.min
  const maxCount = p.sum || p.weights ? pool.length : Math.min(p.max, pool.length)
  const exact = p.sum ? !p.sum.atLeast : !!p.weights
  const maximum = p.sum ? p.sum.atLeast ? target + Math.max(0, ...p.sum.amounts.flat()) : target : p.weights ? p.max : p.max
  let states: Selection[] = [{ picks: [], total: 0, score: 0 }]
  for (const entry of [...pool].sort((a, b) => b.score - a.score || a.i - b.i)) {
    const amounts = p.sum ? p.sum.amounts[entry.i] ?? [] : [p.weights?.[entry.i] ?? 1]
    const next = [...states]
    for (const state of states) {
      if (state.picks.length >= maxCount) continue
      for (const amount of new Set(amounts)) {
        const total = state.total + amount
        if (total > maximum) continue
        next.push({ picks: [...state.picks, entry.i], total, score: state.score + entry.score - (material ? 60 : 0) })
      }
    }
    // Garder plusieurs chemins par total ET nombre : on ne perd pas une solution à nombre de cartes imposé.
    const buckets = new Map<string, Selection[]>()
    for (const state of next.sort((a, b) => b.score - a.score)) {
      const key = `${state.total}:${state.picks.length}`
      const bucket = buckets.get(key) ?? []
      if (bucket.length >= Math.min(limit, 8) || bucket.some((s) => s.picks.join(',') === state.picks.join(','))) continue
      bucket.push(state)
      buckets.set(key, bucket)
    }
    states = [...buckets.values()].flat()
  }
  const found = states.filter((s) => {
    if (p.sum) return s.picks.length >= Math.max(1, p.min) && s.picks.length <= p.max && (exact ? s.total === target : s.total >= target)
    return s.total >= p.min && s.total <= p.max
  }).sort((a, b) => b.score - a.score || a.picks.length - b.picks.length || a.total - b.total)
  const unique = new Map<string, number[]>()
  for (const s of found) {
    const picks = s.picks.sort((a, b) => a - b)
    unique.set(picks.join(','), picks)
    if (unique.size >= limit) break
  }
  return [...unique.values()]
}

/** Les effets défensifs inconditionnels connus ; la simulation du moteur garde le dernier mot. */
const BATTLE_SAFE = new Set([78371393, 4779091, 31764700, 90829280, 80453041, 47172959])
export const battleSafe = (m: MonsterView): boolean => m.faceUp && BATTLE_SAFE.has(m.card.cardId ?? 0)

export interface Combat { damage: number; selfDamage: number; kills: boolean; dies: boolean }

/** Combat visible ordinaire ; les connaissances du deck peuvent décrire un effet de dégâts particulier. */
export function combat(view: DuelView, seat: Seat, a: MonsterView, b: MonsterView, pb: Playbook | null = null): Combat {
  const scripted = pb?.combat?.(makeCtx(view, seat, pb.deck), a, b)
  if (scripted) return scripted
  const atk = a.atk ?? 0
  const wall = b.faceUp ? b.position === 'atk' ? b.atk ?? 0 : b.def ?? 0 : 1600
  const safe = battleSafe(a)
  const otherSafe = battleSafe(b)
  const reflect = b.faceUp && b.position === 'atk' && [78371393, 4779091, 31764700, 47172959].includes(b.card.cardId ?? 0)
  return {
    damage: otherSafe ? 0 : b.position === 'atk' ? Math.max(0, atk - wall) : 0,
    selfDamage: reflect ? atk : safe ? 0 : Math.max(0, wall - atk),
    kills: !otherSafe && (atk > wall || (atk === wall && b.position === 'atk' && atk > 0)),
    dies: !safe && b.position === 'atk' && atk <= wall && wall > 0,
  }
}

/** Gain maximal du combat ordinaire : conserver le gros attaquant pour l'attaque directe peut donner la victoire. */
export function combatPotential(view: DuelView, seat: Seat, attackers: MonsterView[], pb: Playbook | null = null): number {
  const foes = view.players[seat === 0 ? 1 : 0].monsters.filter((m): m is MonsterView => m !== null)
  const ctx = pb ? makeCtx(view, seat, pb.deck) : null
  const mine = attackers.filter((m) => !ctx || !pb?.hold?.(ctx, m))
  // Les deux masques permettent aussi au gros monstre d'ouvrir le passage au petit. Un tri par ATK
  // imposait le petit d'abord, même lorsqu'il ne pouvait pas battre le seul défenseur.
  const gains = mine.map((a) => foes.map((b) => {
    const result = combat(view, seat, a, b, pb)
    return {
      kills: result.kills,
      gain: result.damage - result.selfDamage + (result.kills ? cardWorth(b.card.cardId, b) : 0) - (result.dies ? cardWorth(a.card.cardId, a) : 0),
    }
  }))
  const cache = new Map<string, number>()
  const walk = (available: number, mask: number): number => {
    if (!available) return 0
    const key = `${available}:${mask}`
    const hit = cache.get(key)
    if (hit !== undefined) return hit
    if (!mask) return mine.reduce((sum, a, i) => sum + (available & (1 << i) ? Math.max(0, a.atk ?? 0) : 0), 0)
    let best = 0 // S'arrêter reste possible ; aucune attaque perdante n'est imposée.
    for (let i = 0; i < mine.length; i++) {
      if (!(available & (1 << i))) continue
      for (let n = 0; n < foes.length; n++) {
        if (!(mask & (1 << n))) continue
        const result = gains[i]![n]!
        const next = result.kills ? mask & ~(1 << n) : mask
        best = Math.max(best, result.gain + walk(available & ~(1 << i), next))
      }
    }
    cache.set(key, best)
    return best
  }
  return walk((1 << mine.length) - 1, (1 << foes.length) - 1)
}
