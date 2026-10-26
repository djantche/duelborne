// Tournois privés entre amis : ce que le client voit d'un tournoi. Les résultats viennent toujours du moteur de duel, jamais du client.
import type { FormatId } from './formats.ts'
import type { AiLevel, DuelSettings } from './protocol.ts'

/**
 * single : élimination directe · swiss : ronde suisse (tout le monde joue toutes les rondes, appariés selon ses points) ·
 * robin : championnat (chacun rencontre tous les autres une fois).
 */
export type TournamentKind = 'single' | 'swiss' | 'robin'
export const TOURNAMENT_KINDS: readonly TournamentKind[] = ['single', 'swiss', 'robin']
/** Un match se joue au meilleur de 1, 3 ou 5 duels. */
export type BestOf = 1 | 3 | 5
export const BEST_OF_CHOICES: readonly BestOf[] = [1, 3, 5]
export type TournamentMode = 'friends' | 'solo'
export type TournamentState = 'open' | 'running' | 'finished' | 'cancelled'
export type TournamentSettings = Pick<DuelSettings, 'turnTime' | 'startLp' | 'startHand' | 'drawPerTurn' | 'challenge' | 'handicap' | 'theme' | 'shuffle'> & { bestOf?: BestOf }

export const TOURNAMENT_MIN_PLAYERS = 2
export const TOURNAMENT_MAX_PLAYERS = 32
/** Taille limitée pour conserver un nombre raisonnable de duels entre ordinateurs en arrière-plan. */
export const SOLO_TOURNAMENT_SIZES = [2, 3, 4, 6, 8] as const
/** Un championnat solo reste raisonnable : 15 duels au plus. */
export const SOLO_ROBIN_MAX = 6
/** Un championnat entre amis : 120 matchs au plus. */
export const ROBIN_MAX = 16
/** Barème de la ronde suisse. */
export const POINTS = { win: 3, draw: 1, loss: 0 } as const

export interface TournamentSummary {
  id: string
  name: string
  kind: TournamentKind
  mode: TournamentMode
  format: FormatId
  state: TournamentState
  players: number
  maxPlayers: number
  round: number
  rounds: number
  bestOf: BestOf
  /** Tu l'as créé. */
  owner: boolean
  /** Code à donner aux amis pour qu'ils s'inscrivent. */
  code: string
  createdAt: number
}

export interface TournamentPlayerView {
  userId: string
  name: string
  deckName: string
  deckCover: number
  seed: number | null
  /** Ronde suisse : points, victoires, défaites, égalités, points des adversaires (départage). Élimination : rondes gagnées. */
  points: number
  wins: number
  losses: number
  draws: number
  tiebreak: number
  rank: number
  /** Élimination directe : encore en lice. */
  alive: boolean
  bot?: boolean
  level?: AiLevel
}

export interface MatchSide {
  userId: string
  name: string
  bot?: boolean
}

export interface TournamentMatchView {
  id: string
  round: number
  slot: number
  a: MatchSide | null
  b: MatchSide | null
  state: 'waiting' | 'ready' | 'done'
  winner: string | null
  result: 'a' | 'b' | 'draw' | 'bye' | 'forfeit' | null
  draws: number
  /** Série : duels gagnés par chaque côté (au meilleur de 3 ou 5). */
  scoreA: number
  scoreB: number
  /** C'est ton match. */
  mine: boolean
  /** Un duel de ce match est réellement en cours, et sa vue publique peut être rejointe. */
  watchable?: boolean
}

export interface TournamentView extends TournamentSummary {
  settings: TournamentSettings
  playerList: TournamentPlayerView[]
  matches: TournamentMatchView[]
  /** Ta place dans le tournoi, ou null si tu ne fais que le consulter. */
  me: { userId: string; deckName: string; matchId: string | null } | null
  champion: MatchSide | null
  botError?: boolean
  /** Tournoi solo : le match entre ordinateurs qui se joue en ce moment en arrière-plan. */
  botMatch?: string | null
}

// ───────────────────────────── Calculs partagés (écran de création et serveur) ─────────────────────────────

/** Nombre de rondes d'une formule pour n joueurs. */
export function roundCountOf(kind: TournamentKind, n: number): number {
  if (kind === 'single') return Math.ceil(Math.log2(Math.max(2, n)))
  if (kind === 'swiss') return Math.min(7, Math.max(1, Math.ceil(Math.log2(Math.max(2, n)))))
  return n % 2 === 0 ? n - 1 : n
}

/** Nombre de matchs d'une formule pour n joueurs (exempts non comptés). */
export function matchCountOf(kind: TournamentKind, n: number): number {
  if (kind === 'single') return n - 1
  if (kind === 'swiss') return Math.floor(n / 2) * roundCountOf(kind, n)
  return (n * (n - 1)) / 2
}

/** Duels qu'un joueur joue au plus dans la formule (en comptant la série la plus longue). */
export function maxGamesPerPlayer(kind: TournamentKind, n: number, bestOf: BestOf): number {
  const matches = kind === 'single' ? roundCountOf(kind, n) : kind === 'swiss' ? roundCountOf(kind, n) : n - 1
  return matches * bestOf
}
