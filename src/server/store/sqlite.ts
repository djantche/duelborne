// Implémentation SQLite de Storage.
import { cleanPrefs } from '../../shared/accounts.ts'
import { backupNamed, openDatabase, transaction } from './database.ts'
import type { Db } from './database.ts'
import type { AuthSessionRecord, AuthSessionRepo, DeckRecord, DeckRepo, DuelRecord, DuelRepo, DuelSummary, MatchRecord, MetaRepo, Storage, TournamentPlayerRecord, TournamentRecord, TournamentRepo, UserRecord, UserRepo } from './types.ts'

type Row = Record<string, unknown>

const user = (r: Row | undefined): UserRecord | undefined =>
  r && {
    id: r.id as string,
    username: r.username as string,
    displayName: r.display_name as string,
    passwordHash: r.password_hash as string,
    prefs: parsePrefs(r.prefs as string),
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }

function parsePrefs(text: string): UserRecord['prefs'] {
  try {
    return cleanPrefs(JSON.parse(text))
  } catch {
    return {}
  }
}

const ids = (text: string): number[] => {
  try {
    const list = JSON.parse(text) as unknown
    return Array.isArray(list) ? list.filter((n): n is number => Number.isSafeInteger(n)) : []
  } catch {
    return []
  }
}

const deck = (r: Row | undefined): DeckRecord | undefined =>
  r && {
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    name: r.name as string,
    series: r.series as string,
    cover: r.cover as number,
    main: ids(r.main as string),
    extra: ids(r.extra as string),
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }

const session = (r: Row | undefined): AuthSessionRecord | undefined =>
  r && {
    tokenHash: r.token_hash as string,
    userId: r.user_id as string,
    createdAt: r.created_at as number,
    lastSeen: r.last_seen as number,
    expiresAt: r.expires_at as number,
    revokedAt: (r.revoked_at as number | null) ?? null,
    agent: r.agent as string,
  }

function users(db: Db): UserRepo {
  return {
    create: (u) => void db.prepare('INSERT INTO users (id, username, display_name, password_hash, prefs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(u.id, u.username, u.displayName, u.passwordHash, JSON.stringify(u.prefs), u.createdAt, u.updatedAt),
    byId: (id) => user(db.prepare('SELECT * FROM users WHERE id = ?').get(id)),
    byUsername: (name) => user(db.prepare('SELECT * FROM users WHERE username = ?').get(name)),
    byDisplayName: (name) => user(db.prepare('SELECT * FROM users WHERE display_name = ?').get(name)),
    count: () => (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n,
    setDisplayName: (id, name, now) => void db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?').run(name, now, id),
    setPrefs: (id, prefs, now) => void db.prepare('UPDATE users SET prefs = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(prefs), now, id),
    setPassword: (id, hash, now) => void db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, now, id),
    delete: (id) => void db.prepare('DELETE FROM users WHERE id = ?').run(id),
  }
}

function sessions(db: Db): AuthSessionRepo {
  return {
    create: (s) => void db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, last_seen, expires_at, revoked_at, agent) VALUES (?, ?, ?, ?, ?, ?, ?)').run(s.tokenHash, s.userId, s.createdAt, s.lastSeen, s.expiresAt, s.revokedAt, s.agent),
    byHash: (hash) => session(db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(hash)),
    touch: (hash, now, expiresAt) => void db.prepare('UPDATE auth_sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?').run(now, expiresAt, hash),
    revoke: (hash, now) => void db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, hash),
    revokeAll: (userId, now, except) => Number(db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND token_hash != ?').run(now, userId, except ?? '').changes),
    purge: (before) => Number(db.prepare('DELETE FROM auth_sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').run(before, before).changes),
  }
}

function decks(db: Db): DeckRepo {
  return {
    byId: (id) => deck(db.prepare('SELECT * FROM decks WHERE id = ?').get(id)),
    ofUser: (userId) => db.prepare('SELECT * FROM decks WHERE user_id = ? ORDER BY name COLLATE NOCASE').all(userId).map((r) => deck(r) as DeckRecord),
    orphans: () => db.prepare('SELECT * FROM decks WHERE user_id IS NULL ORDER BY name COLLATE NOCASE').all().map((r) => deck(r) as DeckRecord),
    save: (d) =>
      void db
        .prepare(
          `INSERT INTO decks (id, user_id, name, series, cover, main, extra, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, series = excluded.series, cover = excluded.cover, main = excluded.main, extra = excluded.extra, updated_at = excluded.updated_at`,
        )
        .run(d.id, d.userId, d.name, d.series, d.cover, JSON.stringify(d.main), JSON.stringify(d.extra), d.createdAt, d.updatedAt),
    delete: (id) => Number(db.prepare('DELETE FROM decks WHERE id = ?').run(id).changes) > 0,
    nameTaken: (userId, name, exceptId) =>
      userId === null
        ? !!db.prepare('SELECT 1 FROM decks WHERE user_id IS NULL AND name = ? COLLATE NOCASE AND id != ?').get(name, exceptId ?? '')
        : !!db.prepare('SELECT 1 FROM decks WHERE user_id = ? AND name = ? COLLATE NOCASE AND id != ?').get(userId, name, exceptId ?? ''),
    claim: (id, userId, name, now) => void db.prepare('UPDATE decks SET user_id = ?, name = ?, updated_at = ? WHERE id = ? AND user_id IS NULL').run(userId, name, now, id),
  }
}

const json = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

function duels(db: Db): DuelRepo {
  const players = (id: string): DuelRecord['players'] =>
    db.prepare('SELECT * FROM duel_players WHERE duel_id = ? ORDER BY place').all(id).map((r) => ({ place: r.place as number, team: r.team as 0 | 1, userId: (r.user_id as string | null) ?? null, name: r.name as string, bot: r.bot === 1, deckName: r.deck_name as string, result: r.result as 'win' | 'loss' | 'draw' }))
  return {
    insert: (d) => {
      db.prepare('INSERT INTO duels (id, started_at, ended_at, mode, format, challenge, winner, meta, record, tournament_id, match_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(d.id, d.startedAt, d.endedAt, d.mode, d.format, d.challenge, d.winner, JSON.stringify(d.meta), JSON.stringify(d.record), d.tournamentId, d.matchId)
      const add = db.prepare('INSERT INTO duel_players (duel_id, place, team, user_id, name, bot, deck_name, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      for (const p of d.players) add.run(d.id, p.place, p.team, p.userId, p.name, p.bot ? 1 : 0, p.deckName, p.result)
    },
    byId: (id) => {
      const r = db.prepare('SELECT * FROM duels WHERE id = ?').get(id)
      return r && { id: r.id as string, startedAt: r.started_at as number, endedAt: r.ended_at as number, mode: r.mode as DuelRecord['mode'], format: r.format as DuelRecord['format'], challenge: r.challenge as DuelRecord['challenge'], winner: r.winner as string, meta: json(r.meta as string, {} as DuelRecord['meta']), record: json(r.record as string, null), tournamentId: (r.tournament_id as string | null) ?? null, matchId: (r.match_id as string | null) ?? null, players: players(id) }
    },
    ofUser: (userId, limit) =>
      db
        .prepare('SELECT d.*, p.result AS my_result, p.deck_name AS my_deck, p.team AS my_team FROM duel_players p JOIN duels d ON d.id = p.duel_id WHERE p.user_id = ? ORDER BY d.ended_at DESC LIMIT ?')
        .all(userId, limit)
        .map((r): DuelSummary => {
          const others = db.prepare('SELECT name FROM duel_players WHERE duel_id = ? AND team != ? ORDER BY place').all(r.id as string, r.my_team as number)
          return { id: r.id as string, endedAt: r.ended_at as number, mode: r.mode as DuelSummary['mode'], format: r.format as DuelSummary['format'], challenge: r.challenge as DuelSummary['challenge'], result: r.my_result as DuelSummary['result'], deckName: r.my_deck as string, opponents: others.map((o) => o.name as string), meta: json(r.meta as string, {} as DuelSummary['meta']) }
        }),
    stats: (userId) => {
      const rows = db.prepare('SELECT result, COUNT(*) AS n FROM duel_players WHERE user_id = ? GROUP BY result').all(userId)
      const n = (result: string): number => Number(rows.find((r) => r.result === result)?.n ?? 0)
      return { duels: n('win') + n('loss') + n('draw'), wins: n('win'), losses: n('loss'), draws: n('draw') }
    },
  }
}

const tournament = (r: Row | undefined): TournamentRecord | undefined =>
  r && {
    id: r.id as string,
    ownerId: r.owner_id as string,
    name: r.name as string,
    code: r.code as string,
    kind: r.kind as TournamentRecord['kind'],
    mode: r.mode === 'solo' ? 'solo' : 'friends',
    aiLevel: r.ai_level === 'easy' || r.ai_level === 'hard' ? r.ai_level : 'normal',
    format: r.format as TournamentRecord['format'],
    settings: json(r.settings as string, {} as TournamentRecord['settings']),
    state: r.state as TournamentRecord['state'],
    maxPlayers: r.max_players as number,
    rounds: r.rounds as number,
    currentRound: r.current_round as number,
    createdAt: r.created_at as number,
    startedAt: (r.started_at as number | null) ?? null,
    finishedAt: (r.finished_at as number | null) ?? null,
  }

const match = (r: Row | undefined): MatchRecord | undefined =>
  r && {
    id: r.id as string,
    tournamentId: r.tournament_id as string,
    round: r.round as number,
    slot: r.slot as number,
    a: (r.a_user as string | null) ?? null,
    b: (r.b_user as string | null) ?? null,
    state: r.state as MatchRecord['state'],
    winner: (r.winner as string | null) ?? null,
    result: (r.result as MatchRecord['result']) ?? null,
    draws: r.draws as number,
    scoreA: (r.score_a as number | null) ?? 0,
    scoreB: (r.score_b as number | null) ?? 0,
    duelId: (r.duel_id as string | null) ?? null,
    finishedAt: (r.finished_at as number | null) ?? null,
  }

function tournaments(db: Db): TournamentRepo {
  return {
    create: (t) => void db.prepare('INSERT INTO tournaments (id, owner_id, name, code, kind, format, settings, state, max_players, rounds, current_round, created_at, started_at, finished_at, mode, ai_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(t.id, t.ownerId, t.name, t.code, t.kind, t.format, JSON.stringify(t.settings), t.state, t.maxPlayers, t.rounds, t.currentRound, t.createdAt, t.startedAt, t.finishedAt, t.mode ?? 'friends', t.aiLevel ?? 'normal'),
    byId: (id) => tournament(db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id)),
    byCode: (code) => tournament(db.prepare('SELECT * FROM tournaments WHERE code = ?').get(code)),
    ofUser: (userId) => db.prepare('SELECT * FROM tournaments WHERE owner_id = ? OR id IN (SELECT tournament_id FROM tournament_players WHERE user_id = ?) ORDER BY created_at DESC').all(userId, userId).map((r) => tournament(r) as TournamentRecord),
    runningSolo: () => db.prepare("SELECT * FROM tournaments WHERE mode = 'solo' AND state = 'running' ORDER BY created_at").all().map((r) => tournament(r) as TournamentRecord),
    update: (id, patch) => {
      const cols: Record<string, string> = { state: 'state', rounds: 'rounds', currentRound: 'current_round', startedAt: 'started_at', finishedAt: 'finished_at' }
      const entries = Object.entries(patch).filter(([k]) => k in cols)
      if (!entries.length) return
      db.prepare(`UPDATE tournaments SET ${entries.map(([k]) => `${cols[k]} = ?`).join(', ')} WHERE id = ?`).run(...(entries.map(([, v]) => v) as (string | number | null)[]), id)
    },
    delete: (id) => void db.prepare('DELETE FROM tournaments WHERE id = ?').run(id),
    players: (id) =>
      db.prepare('SELECT *, NULL AS ai_level FROM tournament_players WHERE tournament_id = ? UNION ALL SELECT * FROM tournament_bots WHERE tournament_id = ? ORDER BY joined_at').all(id, id).map(
        (r): TournamentPlayerRecord => ({ tournamentId: r.tournament_id as string, userId: r.user_id as string, name: r.name as string, deck: { name: r.deck_name as string, series: r.deck_series as string, cover: r.deck_cover as number, main: ids(r.deck_main as string), extra: ids(r.deck_extra as string) }, seed: (r.seed as number | null) ?? null, joinedAt: r.joined_at as number, ...(r.ai_level ? { aiLevel: r.ai_level as TournamentPlayerRecord['aiLevel'] } : {}) }),
      ),
    addPlayer: (p) => {
      const values = [p.tournamentId, p.userId, p.name, p.deck.name, p.deck.series, p.deck.cover, JSON.stringify(p.deck.main), JSON.stringify(p.deck.extra), p.seed, p.joinedAt]
      if (p.aiLevel) db.prepare('INSERT INTO tournament_bots (tournament_id, user_id, name, deck_name, deck_series, deck_cover, deck_main, deck_extra, seed, joined_at, ai_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values, p.aiLevel)
      else db.prepare('INSERT INTO tournament_players (tournament_id, user_id, name, deck_name, deck_series, deck_cover, deck_main, deck_extra, seed, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(...values)
    },
    removePlayer: (id, userId) => void db.prepare('DELETE FROM tournament_players WHERE tournament_id = ? AND user_id = ?').run(id, userId),
    setSeed: (id, userId, seed) => {
      db.prepare('UPDATE tournament_players SET seed = ? WHERE tournament_id = ? AND user_id = ?').run(seed, id, userId)
      db.prepare('UPDATE tournament_bots SET seed = ? WHERE tournament_id = ? AND user_id = ?').run(seed, id, userId)
    },
    setDeck: (id, userId, d) => void db.prepare('UPDATE tournament_players SET deck_name = ?, deck_series = ?, deck_cover = ?, deck_main = ?, deck_extra = ? WHERE tournament_id = ? AND user_id = ?').run(d.name, d.series, d.cover, JSON.stringify(d.main), JSON.stringify(d.extra), id, userId),
    matches: (id) => db.prepare('SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, slot').all(id).map((r) => match(r) as MatchRecord),
    matchById: (id) => match(db.prepare('SELECT * FROM tournament_matches WHERE id = ?').get(id)),
    insertMatch: (m) => void db.prepare('INSERT INTO tournament_matches (id, tournament_id, round, slot, a_user, b_user, state, winner, result, draws, duel_id, finished_at, score_a, score_b) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(m.id, m.tournamentId, m.round, m.slot, m.a, m.b, m.state, m.winner, m.result, m.draws, m.duelId, m.finishedAt, m.scoreA, m.scoreB),
    updateMatch: (m) => void db.prepare('UPDATE tournament_matches SET a_user = ?, b_user = ?, state = ?, winner = ?, result = ?, draws = ?, duel_id = ?, finished_at = ?, score_a = ?, score_b = ? WHERE id = ?').run(m.a, m.b, m.state, m.winner, m.result, m.draws, m.duelId, m.finishedAt, m.scoreA, m.scoreB, m.id),
  }
}

function meta(db: Db): MetaRepo {
  return {
    get: (key) => (db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value,
    set: (key, value) => void db.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value),
  }
}

export class SqliteStorage implements Storage {
  readonly users: UserRepo
  readonly sessions: AuthSessionRepo
  readonly decks: DeckRepo
  readonly duels: DuelRepo
  readonly tournaments: TournamentRepo
  readonly meta: MetaRepo
  readonly db: Db
  private readonly file: string
  /** Résumé de l'ouverture : version avant et après les migrations, sauvegarde faite avant. */
  readonly migrated: { from: number; to: number; backup: string | null }

  constructor(file: string) {
    this.file = file
    const opened = openDatabase(file)
    this.db = opened.db
    this.migrated = opened.migrated
    this.users = users(this.db)
    this.sessions = sessions(this.db)
    this.decks = decks(this.db)
    this.duels = duels(this.db)
    this.tournaments = tournaments(this.db)
    this.meta = meta(this.db)
  }

  transaction<T>(fn: () => T): T {
    return transaction(this.db, fn)
  }

  backup(why: string): string {
    return backupNamed(this.db, this.file, why)
  }

  close(): void {
    this.db.close()
  }
}
