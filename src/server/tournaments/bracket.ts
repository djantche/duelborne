// Appariements d'un tournoi : fonctions pures, sans base de données, faciles à vérifier.
import { POINTS } from '../../shared/tournament.ts'

/** Plus petite puissance de 2 qui contient n. */
export const bracketSize = (n: number): number => {
  let size = 2
  while (size < n) size *= 2
  return size
}

export const eliminationRounds = (n: number): number => Math.log2(bracketSize(n))

/** Ronde suisse : assez de rondes pour qu'il reste un seul invaincu (plafonné à 7). */
export const swissRounds = (n: number): number => Math.min(7, Math.max(1, Math.ceil(Math.log2(Math.max(2, n)))))

/** Ordre des têtes de série dans un tableau de `size` places : la 1 et la 2 ne se rencontrent qu'en finale. */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const next = order.length * 2
    order = order.flatMap((s) => [s, next + 1 - s])
  }
  return order
}

/**
 * Premier tour d'une élimination directe. `seeded` : les inscrits, du mieux classé au moins bien classé.
 * Les places non occupées (null) sont des exempts : la tête de série concernée passe directement au tour suivant.
 */
export function firstRound(seeded: string[]): { a: string | null; b: string | null }[] {
  const size = bracketSize(seeded.length)
  const order = seedOrder(size)
  const pairs: { a: string | null; b: string | null }[] = []
  for (let i = 0; i < size; i += 2) pairs.push({ a: seeded[(order[i] as number) - 1] ?? null, b: seeded[(order[i + 1] as number) - 1] ?? null })
  return pairs
}

/** Le match du tour suivant qui reçoit le vainqueur du match (round, slot), et de quel côté. */
export const nextSlot = (slot: number): { slot: number; side: 'a' | 'b' } => ({ slot: Math.floor(slot / 2), side: slot % 2 === 0 ? 'a' : 'b' })

// ───────────────────────────── Championnat ─────────────────────────────

/**
 * Championnat : chacun rencontre tous les autres une fois (méthode des tables de Berger). Avec un nombre impair, un exempt (null)
 * est ajouté : le joueur qui le « rencontre » passe la ronde.
 */
export function robinRounds(ids: string[]): [string, string | null][][] {
  const list: (string | null)[] = ids.length % 2 === 1 ? [...ids, null] : [...ids]
  const n = list.length
  const rounds: [string, string | null][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string | null][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = list[i] as string | null
      const b = list[n - 1 - i] as string | null
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a])
      else if (a ?? b) pairs.push([(a ?? b) as string, null])
    }
    rounds.push(pairs)
    // Le premier reste en place, les autres tournent d'un cran.
    list.splice(1, 0, list.pop() as string | null)
  }
  return rounds
}

// ───────────────────────────── Ronde suisse ─────────────────────────────

export interface SwissPlayer {
  id: string
  points: number
  seed: number
  opponents: ReadonlySet<string>
  hadBye: boolean
}

/**
 * Apparie les joueurs d'une ronde : par points décroissants, sans rejouer un adversaire déjà rencontré quand c'est possible.
 * Avec un nombre impair, le joueur le moins bien classé qui n'a pas encore eu d'exempt passe la ronde (il marque la victoire).
 */
export function swissPairings(players: SwissPlayer[]): [string, string | null][] {
  const sorted = [...players].sort((a, b) => b.points - a.points || a.seed - b.seed)
  let bye: SwissPlayer | undefined
  if (sorted.length % 2 === 1) {
    bye = [...sorted].reverse().find((p) => !p.hadBye) ?? sorted.at(-1)
    sorted.splice(sorted.indexOf(bye as SwissPlayer), 1)
  }
  // Recherche en profondeur : on prend le mieux classé et le meilleur adversaire jamais rencontré ; en cas d'impasse on revient en arrière.
  const solve = (rest: SwissPlayer[], allowRematch: boolean): [string, string][] | null => {
    if (!rest.length) return []
    const [first, ...others] = rest as [SwissPlayer, ...SwissPlayer[]]
    for (let i = 0; i < others.length; i++) {
      const other = others[i] as SwissPlayer
      if (!allowRematch && first.opponents.has(other.id)) continue
      const tail = solve(others.filter((_, j) => j !== i), allowRematch)
      if (tail) return [[first.id, other.id], ...tail]
    }
    return null
  }
  const pairs = solve(sorted, false) ?? solve(sorted, true) ?? []
  return bye ? [...pairs, [bye.id, null]] : pairs
}

// ───────────────────────────── Classement ─────────────────────────────

export interface Played {
  a: string | null
  b: string | null
  winner: string | null
  result: 'a' | 'b' | 'draw' | 'bye' | 'forfeit' | null
  done: boolean
}

export interface Standing {
  id: string
  points: number
  wins: number
  losses: number
  draws: number
  /** Points des adversaires rencontrés (départage). */
  tiebreak: number
}

/** Points, bilan et départage de chaque joueur d'après les matchs terminés. */
export function standingsOf(ids: string[], matches: Played[]): Standing[] {
  const rows = new Map<string, Standing>(ids.map((id) => [id, { id, points: 0, wins: 0, losses: 0, draws: 0, tiebreak: 0 }]))
  const opponents = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const m of matches) {
    if (!m.done || !m.a) continue
    const a = rows.get(m.a)
    const b = m.b ? rows.get(m.b) : undefined
    if (m.result === 'bye') {
      if (a) (a.points += POINTS.win), a.wins++
      continue
    }
    if (m.result === 'draw') {
      for (const r of [a, b]) if (r) (r.points += POINTS.draw), r.draws++
    } else if (m.winner) {
      const [win, lose] = m.winner === m.a ? [a, b] : [b, a]
      if (win) (win.points += POINTS.win), win.wins++
      if (lose) lose.losses++
    }
    if (m.a && m.b) {
      opponents.get(m.a)?.push(m.b)
      opponents.get(m.b)?.push(m.a)
    }
  }
  for (const [id, row] of rows) row.tiebreak = (opponents.get(id) ?? []).reduce((sum, o) => sum + (rows.get(o)?.points ?? 0), 0)
  return [...rows.values()]
}

/** Classement : points, puis départage, puis victoires, puis tête de série. */
export const ranked = (rows: Standing[], seed: (id: string) => number): Standing[] =>
  [...rows].sort((x, y) => y.points - x.points || y.tiebreak - x.tiebreak || y.wins - x.wins || seed(x.id) - seed(y.id))
