// Ce que le serveur sait demander à la base. Les écrans, le hub et les salles ne connaissent que ces interfaces :
// remplacer SQLite par PostgreSQL revient à écrire une autre implémentation de Storage (les appels y sont synchrones
// aujourd'hui ; il faudra les rendre asynchrones à ce moment-là, dans les services qui les appellent).
import type { UserPrefs, UserStats } from '../../shared/accounts.ts'
import type { ChallengeId, DuelMeta, FormatId } from '../../shared/formats.ts'
import type { AiLevel, RoomMode } from '../../shared/protocol.ts'
import type { TournamentKind, TournamentMode, TournamentSettings, TournamentState } from '../../shared/tournament.ts'

export interface UserRecord {
  id: string
  username: string
  displayName: string
  passwordHash: string
  prefs: UserPrefs
  createdAt: number
  updatedAt: number
}

export interface AuthSessionRecord {
  tokenHash: string
  userId: string
  createdAt: number
  lastSeen: number
  expiresAt: number
  revokedAt: number | null
  agent: string
}

export interface DeckRecord {
  id: string
  /** null : deck d'avant les comptes, pas encore récupéré. */
  userId: string | null
  name: string
  series: string
  cover: number
  main: number[]
  extra: number[]
  createdAt: number
  updatedAt: number
}

export interface UserRepo {
  create(user: UserRecord): void
  byId(id: string): UserRecord | undefined
  byUsername(username: string): UserRecord | undefined
  byDisplayName(name: string): UserRecord | undefined
  count(): number
  setDisplayName(id: string, name: string, now: number): void
  setPrefs(id: string, prefs: UserPrefs, now: number): void
  setPassword(id: string, hash: string, now: number): void
  delete(id: string): void
}

export interface AuthSessionRepo {
  create(session: AuthSessionRecord): void
  byHash(hash: string): AuthSessionRecord | undefined
  touch(hash: string, now: number, expiresAt: number): void
  revoke(hash: string, now: number): void
  /** Révoque toutes les sessions d'un compte, sauf celle indiquée. */
  revokeAll(userId: string, now: number, except?: string): number
  /** Supprime les sessions expirées ou révoquées depuis longtemps. */
  purge(before: number): number
}

export interface DeckRepo {
  byId(id: string): DeckRecord | undefined
  ofUser(userId: string): DeckRecord[]
  orphans(): DeckRecord[]
  save(deck: DeckRecord): void
  delete(id: string): boolean
  /** Compte du nom, sans tenir compte des majuscules, hors le deck indiqué. */
  nameTaken(userId: string | null, name: string, exceptId?: string): boolean
  /** Donne un deck sans propriétaire à un compte. */
  claim(id: string, userId: string, name: string, now: number): void
}

export interface MetaRepo {
  get(key: string): string | undefined
  set(key: string, value: string): void
}

// ───────────────────────────── Historique des duels ─────────────────────────────

export interface DuelPlayerRecord {
  place: number
  team: 0 | 1
  userId: string | null
  name: string
  bot: boolean
  deckName: string
  result: 'win' | 'loss' | 'draw'
}

export interface DuelRecord {
  id: string
  startedAt: number
  endedAt: number
  mode: RoomMode
  format: FormatId
  challenge: ChallengeId
  winner: string
  meta: DuelMeta
  /** Graine, cartes et réponses : contient les Decks. */
  record: unknown
  tournamentId: string | null
  matchId: string | null
  players: DuelPlayerRecord[]
}

/** Une ligne de l'historique d'un joueur. */
export interface DuelSummary {
  id: string
  endedAt: number
  mode: RoomMode
  format: FormatId
  challenge: ChallengeId
  result: 'win' | 'loss' | 'draw'
  deckName: string
  opponents: string[]
  meta: DuelMeta
}

export interface DuelRepo {
  insert(duel: DuelRecord): void
  byId(id: string): DuelRecord | undefined
  ofUser(userId: string, limit: number): DuelSummary[]
  stats(userId: string): UserStats
}

// ───────────────────────────── Tournois ─────────────────────────────

export type { TournamentKind, TournamentSettings, TournamentState }

export interface TournamentRecord {
  id: string
  ownerId: string
  name: string
  code: string
  kind: TournamentKind
  mode?: TournamentMode
  aiLevel?: AiLevel
  format: FormatId
  settings: TournamentSettings
  state: TournamentState
  maxPlayers: number
  rounds: number
  currentRound: number
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface TournamentPlayerRecord {
  tournamentId: string
  userId: string
  name: string
  deck: { name: string; series: string; cover: number; main: number[]; extra: number[] }
  seed: number | null
  joinedAt: number
  /** Présent uniquement pour un participant ordinateur, dont userId est un identifiant local au tournoi. */
  aiLevel?: AiLevel
}

export interface MatchRecord {
  id: string
  tournamentId: string
  round: number
  slot: number
  a: string | null
  b: string | null
  /** waiting : un des joueurs n'est pas encore connu · ready : à jouer · done : terminé. */
  state: 'waiting' | 'ready' | 'done'
  winner: string | null
  result: 'a' | 'b' | 'draw' | 'bye' | 'forfeit' | null
  /** Égalités déjà jouées (en élimination directe, le match est rejoué). */
  draws: number
  /** Série au meilleur de 3 ou 5 : duels gagnés par chaque côté. */
  scoreA: number
  scoreB: number
  duelId: string | null
  finishedAt: number | null
}

export interface TournamentRepo {
  create(t: TournamentRecord): void
  byId(id: string): TournamentRecord | undefined
  byCode(code: string): TournamentRecord | undefined
  /** Les tournois créés par ce compte ou auxquels il est inscrit, du plus récent au plus ancien. */
  ofUser(userId: string): TournamentRecord[]
  runningSolo?(): TournamentRecord[]
  update(id: string, patch: Partial<Pick<TournamentRecord, 'state' | 'rounds' | 'currentRound' | 'startedAt' | 'finishedAt'>>): void
  delete(id: string): void
  players(id: string): TournamentPlayerRecord[]
  addPlayer(p: TournamentPlayerRecord): void
  removePlayer(id: string, userId: string): void
  setSeed(id: string, userId: string, seed: number): void
  setDeck(id: string, userId: string, deck: TournamentPlayerRecord['deck']): void
  matches(id: string): MatchRecord[]
  matchById(id: string): MatchRecord | undefined
  insertMatch(m: MatchRecord): void
  updateMatch(m: MatchRecord): void
}

export interface Storage {
  readonly users: UserRepo
  readonly sessions: AuthSessionRepo
  readonly decks: DeckRepo
  readonly duels: DuelRepo
  readonly tournaments: TournamentRepo
  readonly meta: MetaRepo
  /** Tout ou rien. */
  transaction<T>(fn: () => T): T
  /** Copie de sécurité de la base ; renvoie le fichier créé. */
  backup(why: string): string
  close(): void
}
