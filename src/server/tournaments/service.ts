// Tournois privés entre amis.
//
// - On s'inscrit avec un code (donné par celui qui organise) et un deck, copié à l'inscription : il ne change plus.
// - Le serveur choisit les appariements ; les résultats viennent uniquement des duels joués dans les salons de tournoi
//   (jamais d'un message du client). L'organisateur peut seulement déclarer un forfait.
// - Élimination directe (une égalité fait rejouer le match) ou ronde suisse (l'égalité vaut 1 point).
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { msg } from '../../shared/msg.ts'
import { AI_LEVELS, DEFAULT_SETTINGS, cleanSettings } from '../../shared/protocol.ts'
import type { AiLevel } from '../../shared/protocol.ts'
import { BEST_OF_CHOICES, ROBIN_MAX, SOLO_ROBIN_MAX, SOLO_TOURNAMENT_SIZES, TOURNAMENT_KINDS, TOURNAMENT_MAX_PLAYERS, TOURNAMENT_MIN_PLAYERS, roundCountOf } from '../../shared/tournament.ts'
import type { BestOf, MatchSide, TournamentKind, TournamentMatchView, TournamentPlayerView, TournamentSettings, TournamentSummary, TournamentView } from '../../shared/tournament.ts'
import { FORMAT_IDS } from '../../shared/formats.ts'
import type { FormatId } from '../../shared/formats.ts'
import type { DeckService } from '../accounts/decks.ts'
import type { Failure, Outcome } from '../accounts/service.ts'
import type { FormatCatalog } from '../formats/catalog.ts'
import type { DeckList } from '../ocg/decks.ts'
import { findProvided } from '../ocg/decks.ts'
import type { DuelResult, RoomTournament } from '../room.ts'
import type { MatchRecord, Storage, TournamentPlayerRecord, TournamentRecord } from '../store/types.ts'
import { bracketSize, firstRound, nextSlot, ranked, robinRounds, standingsOf, swissPairings } from './bracket.ts'

const fail = (status: number, key: string, params?: Record<string, string | number>): Failure => ({ ok: false, status, error: msg(key, params) })

/** Lettres et chiffres faciles à dicter (ni 0/O ni 1/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = (): string => Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('')

const shuffle = <T>(list: T[]): T[] => {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

export interface TournamentHooks {
  /** Prévient les comptes connectés qu'un tournoi a changé. */
  notify(userIds: string[], tournamentId: string, reason: 'match' | 'result' | 'state'): void
  /** Ferme le salon d'un match (forfait, annulation). */
  closeMatchRoom(matchId: string): void
  /** Lance ou reprend les duels entre ordinateurs d'un tournoi solo. */
  scheduleBots?(id: string): void
  botError?(id: string): boolean
  /** Le duel entre ordinateurs en cours pour ce tournoi. */
  botProgress?(id: string): { matchId: string } | null
  watchable?(matchId: string): boolean
}

export interface TournamentInput {
  name: unknown
  kind: unknown
  format: unknown
  maxPlayers: unknown
  settings: unknown
  mode?: unknown
  deck?: unknown
  aiLevel?: unknown
  aiDeck?: unknown
  bestOf?: unknown
}

/** Les réglages d'un tournoi qui concernent le duel lui-même (la longueur des séries n'en fait pas partie). */
const duelSettings = ({ bestOf: _bestOf, ...rest }: TournamentSettings): Omit<TournamentSettings, 'bestOf'> => rest

export class TournamentService {
  private readonly store: Storage
  private readonly decks: DeckService
  private readonly formats: FormatCatalog
  private readonly hooks: TournamentHooks
  private readonly now: () => number
  private readonly provided: Map<string, DeckList>

  constructor(store: Storage, decks: DeckService, formats: FormatCatalog, hooks: TournamentHooks, now: () => number = Date.now, provided: Map<string, DeckList> = new Map()) {
    this.store = store
    this.decks = decks
    this.formats = formats
    this.hooks = hooks
    this.now = now
    this.provided = provided
  }

  // ───────────────────────────── Création et inscriptions ─────────────────────────────

  create(ownerId: string, input: TournamentInput): Outcome<{ id: string }> {
    const name = typeof input.name === 'string' ? input.name.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim() : ''
    if (name.length < 2 || name.length > 40) return fail(422, 'tournament.badName')
    const kind: TournamentKind | null = TOURNAMENT_KINDS.includes(input.kind as TournamentKind) ? (input.kind as TournamentKind) : null
    if (!kind) return fail(422, 'tournament.badKind')
    const format = FORMAT_IDS.includes(input.format as FormatId) ? (input.format as FormatId) : null
    if (!format || !this.formats.available(format)) return fail(422, 'err.formatMissing')
    const max = Number(input.maxPlayers)
    if (!Number.isInteger(max) || max < TOURNAMENT_MIN_PLAYERS || max > TOURNAMENT_MAX_PLAYERS) return fail(422, 'tournament.badSize')
    if (input.mode !== undefined && input.mode !== 'friends' && input.mode !== 'solo') return fail(422, 'tournament.badMode')
    const mode = input.mode === 'solo' ? 'solo' : 'friends'
    if (mode === 'solo' && !SOLO_TOURNAMENT_SIZES.some((n) => n === max)) return fail(422, 'tournament.soloSize')
    if (kind === 'robin' && max > (mode === 'solo' ? SOLO_ROBIN_MAX : ROBIN_MAX)) return fail(422, mode === 'solo' ? 'tournament.soloRobinSize' : 'tournament.robinSize', { n: mode === 'solo' ? SOLO_ROBIN_MAX : ROBIN_MAX })
    const bestOf = input.bestOf === undefined ? 1 : BEST_OF_CHOICES.find((n) => n === input.bestOf)
    if (!bestOf) return fail(422, 'tournament.badBestOf')
    const aiLevel = input.aiLevel ?? 'normal'
    if (!AI_LEVELS.some((l) => l.id === aiLevel)) return fail(422, 'tournament.badLevel')
    const clean = { ...DEFAULT_SETTINGS, ...cleanSettings(input.settings) }
    const settings: TournamentSettings = { turnTime: clean.turnTime, startLp: clean.startLp, startHand: clean.startHand, drawPerTurn: clean.drawPerTurn, challenge: clean.challenge, handicap: clean.handicap, theme: clean.theme, shuffle: true, bestOf }
    let code = newCode()
    while (this.store.tournaments.byCode(code)) code = newCode()
    const t: TournamentRecord = { id: randomUUID(), ownerId, name, code, kind, mode, aiLevel: aiLevel as AiLevel, format, settings, state: 'open', maxPlayers: max, rounds: 0, currentRound: 0, createdAt: this.now(), startedAt: null, finishedAt: null }
    if (mode === 'solo') {
      const human = this.entryDeck(ownerId, input.deck, t)
      if (!human.ok) return human
      const user = this.store.users.byId(ownerId)
      if (!user) return fail(401, 'auth.required')
      let pool: TournamentPlayerRecord['deck'][]
      const series = typeof input.aiDeck === 'string' && input.aiDeck.startsWith('series:') ? input.aiDeck.slice(7) : ''
      if (typeof input.aiDeck === 'string' && input.aiDeck && !series) {
        const chosen = this.entryDeck(ownerId, input.aiDeck, t)
        if (!chosen.ok) return chosen
        pool = [chosen.deck]
      } else {
        const candidates = [...this.provided.values(), ...this.decks.list(ownerId).flatMap((d) => this.decks.get(ownerId, d.id) ?? [])]
        pool = shuffle(candidates.filter((d) => !this.formats.check(t.format, d).issues.some((i) => i.level === 'blocking') && (!t.settings.theme || d.series === t.settings.theme) && (!series || d.series === series)))
      }
      if (!pool.length) return fail(422, 'tournament.noAiDeck')
      this.store.transaction(() => {
        this.store.tournaments.create(t)
        this.store.tournaments.addPlayer({ tournamentId: t.id, userId: ownerId, name: user.displayName, deck: human.deck, seed: null, joinedAt: t.createdAt })
        for (let i = 1; i < max; i++) {
          const deck = pool[(i - 1) % pool.length]!
          this.store.tournaments.addPlayer({ tournamentId: t.id, userId: `cpu-${randomUUID()}`, name: msg('srv.cpu', { n: i, level: msg(`level.${aiLevel}`) }), deck, seed: null, joinedAt: t.createdAt + i, aiLevel: aiLevel as AiLevel })
        }
      })
    } else this.store.tournaments.create(t)
    return { ok: true, id: t.id }
  }

  /** Le deck d'un joueur (un des siens ou un deck du jeu) face aux règles du tournoi. */
  private entryDeck(userId: string, deckId: unknown, t: TournamentRecord): Outcome<{ deck: TournamentPlayerRecord['deck'] }> {
    if (typeof deckId !== 'string') return fail(422, 'tournament.pickDeck')
    const list: DeckList | undefined = this.decks.get(userId, deckId) ?? findProvided(deckId)
    if (!list) return fail(404, 'api.noDeck')
    const check = this.formats.check(t.format, list)
    const issue = check.issues.find((i) => i.level === 'blocking')
    if (issue) return { ok: false, status: 422, error: issue.text }
    if (t.settings.theme && list.series !== t.settings.theme) return fail(422, 'format.issue.theme', { theme: t.settings.theme })
    return { ok: true, deck: { name: list.name, series: list.series, cover: list.cover, main: list.main, extra: list.extra } }
  }

  join(user: { id: string; displayName: string }, codeOrId: string, deckId: unknown): Outcome<{ id: string }> {
    const key = codeOrId.trim().toUpperCase()
    const t = this.store.tournaments.byCode(key) ?? this.store.tournaments.byId(codeOrId)
    if (!t) return fail(404, 'tournament.noSuch')
    if (t.mode === 'solo') return fail(404, 'tournament.noSuch')
    if (t.state !== 'open') return fail(409, 'tournament.closed')
    const players = this.store.tournaments.players(t.id)
    if (players.some((p) => p.userId === user.id)) return fail(409, 'tournament.already')
    if (players.length >= t.maxPlayers) return fail(409, 'tournament.full')
    const entry = this.entryDeck(user.id, deckId, t)
    if (!entry.ok) return entry
    this.store.tournaments.addPlayer({ tournamentId: t.id, userId: user.id, name: user.displayName, deck: entry.deck, seed: null, joinedAt: this.now() })
    this.hooks.notify([t.ownerId, ...players.map((p) => p.userId)], t.id, 'state')
    return { ok: true, id: t.id }
  }

  changeDeck(userId: string, id: string, deckId: unknown): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || !this.store.tournaments.players(id).some((p) => p.userId === userId)) return fail(404, 'tournament.noSuch')
    if (t.state !== 'open') return fail(409, 'tournament.locked')
    const entry = this.entryDeck(userId, deckId, t)
    if (!entry.ok) return entry
    this.store.tournaments.setDeck(id, userId, entry.deck)
    return { ok: true }
  }

  leave(userId: string, id: string): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || !this.store.tournaments.players(id).some((p) => p.userId === userId)) return fail(404, 'tournament.noSuch')
    if (t.mode === 'solo') return fail(409, 'tournament.soloLeave')
    if (t.state !== 'open') return fail(409, 'tournament.locked')
    this.store.tournaments.removePlayer(id, userId)
    this.hooks.notify([t.ownerId], id, 'state')
    return { ok: true }
  }

  // ───────────────────────────── Déroulement ─────────────────────────────

  start(ownerId: string, id: string): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || t.ownerId !== ownerId) return fail(404, 'tournament.noSuch')
    if (t.state !== 'open') return fail(409, 'tournament.closed')
    const players = this.store.tournaments.players(id)
    if (players.length < TOURNAMENT_MIN_PLAYERS) return fail(422, 'tournament.needTwo')
    this.store.transaction(() => {
      const order = shuffle(players.map((p) => p.userId))
      order.forEach((userId, i) => this.store.tournaments.setSeed(id, userId, i + 1))
      const rounds = roundCountOf(t.kind, order.length)
      this.store.tournaments.update(id, { state: 'running', rounds, currentRound: 1, startedAt: this.now() })
      if (t.kind === 'single') this.buildBracket(t.id, order, rounds)
      else if (t.kind === 'robin') this.buildRobin(t.id, order)
      else this.pairSwissRound(t.id, 1)
    })
    this.hooks.notify(players.map((p) => p.userId), id, 'match')
    if (t.mode === 'solo') this.hooks.scheduleBots?.(id)
    return { ok: true }
  }

  resumeBots(ownerId: string, id: string): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || t.ownerId !== ownerId || t.mode !== 'solo' || t.state !== 'running') return fail(404, 'tournament.noSuch')
    this.hooks.scheduleBots?.(id)
    return { ok: true }
  }

  /** Crée tous les matchs d'une élimination directe ; les exempts du premier tour passent aussitôt. */
  private buildBracket(id: string, seeded: string[], rounds: number): void {
    const first = firstRound(seeded)
    first.forEach((pair, slot) => this.store.tournaments.insertMatch(this.blank(id, 1, slot, pair.a, pair.b)))
    for (let round = 2; round <= rounds; round++) for (let slot = 0; slot < bracketSize(seeded.length) / 2 ** round; slot++) this.store.tournaments.insertMatch(this.blank(id, round, slot, null, null))
    for (const m of this.store.tournaments.matches(id).filter((x) => x.round === 1 && x.a && !x.b)) this.finish(m, 'bye', m.a)
  }

  private blank(tournamentId: string, round: number, slot: number, a: string | null, b: string | null): MatchRecord {
    return { id: randomUUID(), tournamentId, round, slot, a, b, state: a && b ? 'ready' : 'waiting', winner: null, result: null, draws: 0, scoreA: 0, scoreB: 0, duelId: null, finishedAt: null }
  }

  /** Championnat : tous les matchs sont créés d'emblée, à jouer dans n'importe quel ordre ; les exempts passent. */
  private buildRobin(id: string, order: string[]): void {
    robinRounds(order).forEach((pairs, r) => pairs.forEach(([a, b], slot) => this.store.tournaments.insertMatch(this.blank(id, r + 1, slot, a, b))))
    for (const m of this.store.tournaments.matches(id).filter((x) => x.a && !x.b)) this.finish(m, 'bye', m.a)
  }

  private pairSwissRound(id: string, round: number): void {
    const players = this.store.tournaments.players(id)
    const done = this.store.tournaments.matches(id)
    const stand = new Map(standingsOf(players.map((p) => p.userId), done.map((m) => ({ a: m.a, b: m.b, winner: m.winner, result: m.result, done: m.state === 'done' }))).map((s) => [s.id, s]))
    const pairs = swissPairings(
      players.map((p) => ({
        id: p.userId,
        points: stand.get(p.userId)?.points ?? 0,
        seed: p.seed ?? 99,
        opponents: new Set(done.flatMap((m) => (m.a === p.userId && m.b ? [m.b] : m.b === p.userId && m.a ? [m.a] : []))),
        hadBye: done.some((m) => m.result === 'bye' && m.a === p.userId),
      })),
    )
    pairs.forEach(([a, b], slot) => {
      const m = this.blank(id, round, slot, a, b)
      this.store.tournaments.insertMatch(m)
      if (!b) this.finish(m, 'bye', a)
    })
  }

  /** Termine un match et en tire les conséquences (tour suivant, fin du tournoi). */
  private finish(m: MatchRecord, result: NonNullable<MatchRecord['result']>, winner: string | null, duelId: string | null = null): void {
    const done: MatchRecord = { ...m, state: 'done', result, winner, duelId, finishedAt: this.now() }
    this.store.tournaments.updateMatch(done)
    const t = this.store.tournaments.byId(m.tournamentId) as TournamentRecord
    if (t.kind === 'single') this.advance(t, done)
    else if (t.kind === 'robin') this.settleRobin(t)
    else this.settleSwiss(t)
  }

  private settleRobin(t: TournamentRecord): void {
    if (this.store.tournaments.matches(t.id).every((x) => x.state === 'done')) this.conclude(t)
  }

  private advance(t: TournamentRecord, m: MatchRecord): void {
    if (m.round >= t.rounds) return void this.conclude(t)
    const next = this.store.tournaments.matches(t.id).find((x) => x.round === m.round + 1 && x.slot === nextSlot(m.slot).slot)
    if (!next) return
    const side = nextSlot(m.slot).side
    const updated: MatchRecord = { ...next, [side]: m.winner }
    this.store.tournaments.updateMatch({ ...updated, state: updated.a && updated.b ? 'ready' : 'waiting' })
    // Un exempt dans le tour suivant (cas des petits tableaux) : le seul joueur présent passe.
  }

  private settleSwiss(t: TournamentRecord): void {
    const round = this.store.tournaments.matches(t.id).filter((x) => x.round === t.currentRound)
    if (!round.length || round.some((x) => x.state !== 'done')) return
    if (t.currentRound >= t.rounds) return void this.conclude(t)
    this.store.tournaments.update(t.id, { currentRound: t.currentRound + 1 })
    this.pairSwissRound(t.id, t.currentRound + 1)
  }

  private conclude(t: TournamentRecord): void {
    this.store.tournaments.update(t.id, { state: 'finished', finishedAt: this.now() })
  }

  /** Un duel de tournoi est terminé : seul le résultat du moteur compte, et seulement pour les deux joueurs attendus. */
  onDuelFinished(result: DuelResult): void {
    const link = result.tournament
    if (!link) return
    const m = this.store.tournaments.matchById(link.matchId)
    const t = this.store.tournaments.byId(link.id)
    if (!m || !t || m.tournamentId !== t.id || m.state !== 'ready' || t.state !== 'running') return
    const entrants = this.store.tournaments.players(t.id)
    const matches = (team: 0 | 1, id: string | null): boolean => {
      const expected = entrants.find((p) => p.userId === id)
      const actual = result.players.find((p) => p.team === team)
      return !!expected && !!actual && (expected.aiLevel ? actual.bot && actual.userId === null : !actual.bot && actual.userId === id)
    }
    if (!matches(0, m.a) || !matches(1, m.b)) return
    const bestOf = t.settings.bestOf ?? 1
    this.store.transaction(() => {
      if (result.winner === 'draw') {
        // Élimination directe ou série : on rejoue le duel. Ronde suisse et championnat en un duel : l'égalité est un résultat.
        if (t.kind === 'single' || bestOf > 1) this.store.tournaments.updateMatch({ ...m, draws: m.draws + 1, duelId: result.id })
        else this.finish(m, 'draw', null, result.id)
        return
      }
      const side = result.winner === 0 ? 'a' : 'b'
      const scoreA = m.scoreA + (side === 'a' ? 1 : 0)
      const scoreB = m.scoreB + (side === 'b' ? 1 : 0)
      const need = Math.floor(bestOf / 2) + 1
      // La série continue tant qu'aucun des deux n'a assez de victoires : le match reste à jouer, avec son score.
      if (Math.max(scoreA, scoreB) < need) return void this.store.tournaments.updateMatch({ ...m, scoreA, scoreB, duelId: result.id })
      this.finish({ ...m, scoreA, scoreB }, scoreA > scoreB ? 'a' : 'b', scoreA > scoreB ? m.a : m.b, result.id)
    })
    this.hooks.notify([t.ownerId, ...this.store.tournaments.players(t.id).map((p) => p.userId)], t.id, 'result')
    if (t.mode === 'solo') this.hooks.scheduleBots?.(t.id)
  }

  /** L'organisateur déclare qu'un joueur perd son match par forfait (absent, parti). */
  forfeit(ownerId: string, id: string, matchId: unknown, loser: unknown): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || t.ownerId !== ownerId) return fail(404, 'tournament.noSuch')
    if (t.mode === 'solo') return fail(409, 'tournament.soloForfeit')
    const m = typeof matchId === 'string' ? this.store.tournaments.matchById(matchId) : undefined
    if (!m || m.tournamentId !== id || m.state !== 'ready' || t.state !== 'running') return fail(409, 'tournament.noMatch')
    if (loser !== m.a && loser !== m.b) return fail(422, 'tournament.noMatch')
    this.store.transaction(() => this.finish(m, 'forfeit', loser === m.a ? m.b : m.a))
    this.hooks.closeMatchRoom(m.id)
    this.hooks.notify([t.ownerId, ...this.store.tournaments.players(id).map((p) => p.userId)], id, 'result')
    return { ok: true }
  }

  /** Ouvert : supprimé. En cours : annulé. Terminé ou annulé : retiré de la liste. */
  cancel(ownerId: string, id: string): Outcome<object> {
    const t = this.store.tournaments.byId(id)
    if (!t || t.ownerId !== ownerId) return fail(404, 'tournament.noSuch')
    const ids = [t.ownerId, ...this.store.tournaments.players(id).map((p) => p.userId)]
    if (t.state === 'running') {
      for (const m of this.store.tournaments.matches(id)) this.hooks.closeMatchRoom(m.id)
      this.store.tournaments.update(id, { state: 'cancelled', finishedAt: this.now() })
    } else this.store.tournaments.delete(id)
    this.hooks.notify(ids, id, 'state')
    return { ok: true }
  }

  // ───────────────────────────── Consultation ─────────────────────────────

  private summary(t: TournamentRecord, userId: string, count: number): TournamentSummary {
    return { id: t.id, name: t.name, kind: t.kind, mode: t.mode ?? 'friends', format: t.format, state: t.state, players: count, maxPlayers: t.maxPlayers, round: t.currentRound, rounds: t.rounds, bestOf: t.settings.bestOf ?? 1, owner: t.ownerId === userId, code: t.code, createdAt: t.createdAt }
  }

  list(userId: string): TournamentSummary[] {
    return this.store.tournaments.ofUser(userId).map((t) => this.summary(t, userId, this.store.tournaments.players(t.id).length))
  }

  /** Le tournoi vu par un participant ou par son organisateur ; les autres n'y ont pas accès. */
  view(userId: string, id: string): TournamentView | null {
    const t = this.store.tournaments.byId(id)
    if (!t) return null
    const players = this.store.tournaments.players(id)
    const mine = players.find((p) => p.userId === userId)
    if (!mine && t.ownerId !== userId) return null
    const matches = this.store.tournaments.matches(id)
    const nameOf = (uid: string | null): MatchSide | null => (uid ? { userId: uid, name: players.find((p) => p.userId === uid)?.name ?? '—', bot: !!players.find((p) => p.userId === uid)?.aiLevel } : null)
    const seedOf = (uid: string): number => players.find((p) => p.userId === uid)?.seed ?? 99
    const rows = ranked(standingsOf(players.map((p) => p.userId), matches.map((m) => ({ a: m.a, b: m.b, winner: m.winner, result: m.result, done: m.state === 'done' }))), seedOf)
    const lost = new Set(matches.filter((m) => m.state === 'done' && m.result !== 'bye' && m.winner && m.a && m.b).map((m) => (m.winner === m.a ? m.b : m.a)))
    const playerList: TournamentPlayerView[] = rows.map((r, i) => {
      const p = players.find((x) => x.userId === r.id) as TournamentPlayerRecord
      return { userId: r.id, name: p.name, bot: !!p.aiLevel, ...(p.aiLevel ? { level: p.aiLevel } : {}), deckName: p.deck.name, deckCover: p.deck.cover, seed: p.seed, points: r.points, wins: r.wins, losses: r.losses, draws: r.draws, tiebreak: r.tiebreak, rank: i + 1, alive: t.state === 'running' && !lost.has(r.id) }
    })
    const matchViews: TournamentMatchView[] = matches.map((m) => ({ id: m.id, round: m.round, slot: m.slot, a: nameOf(m.a), b: nameOf(m.b), state: m.state, winner: m.winner, result: m.result, draws: m.draws, scoreA: m.scoreA, scoreB: m.scoreB, mine: m.a === userId || m.b === userId, watchable: t.state === 'running' && m.state === 'ready' && (this.hooks.watchable?.(m.id) ?? false) }))
    const playable = matches.find((m) => m.state === 'ready' && (m.a === userId || m.b === userId))
    const final = t.kind === 'single' ? matches.find((m) => m.round === t.rounds) : undefined
    const champion = t.state !== 'finished' ? null : t.kind === 'single' ? nameOf(final?.winner ?? null) : nameOf(rows[0]?.id ?? null)
    return {
      ...this.summary(t, userId, players.length),
      settings: t.settings,
      playerList,
      matches: matchViews,
      me: mine ? { userId, deckName: mine.deck.name, matchId: t.state === 'running' ? (playable?.id ?? null) : null } : null,
      champion,
      botError: this.hooks.botError?.(id) ?? false,
      botMatch: this.hooks.botProgress?.(id)?.matchId ?? null,
    }
  }

  /** De quoi ouvrir le salon d'un match : ses deux joueurs, leurs decks copiés et les réglages du tournoi. */
  roomSpec(userId: string, id: string, matchId: string): Outcome<{ tournament: RoomTournament }> {
    const t = this.store.tournaments.byId(id)
    const m = this.store.tournaments.matchById(matchId)
    if (!t || !m || m.tournamentId !== id) return fail(404, 'tournament.noSuch')
    if (t.state !== 'running' || m.state !== 'ready' || !m.a || !m.b || (m.a !== userId && m.b !== userId)) return fail(409, 'tournament.noMatch')
    return { ok: true, tournament: this.matchSpec(t, m) }
  }

  /** La consultation d'un match reste réservée à l'organisateur et aux inscrits du tournoi. */
  spectatorSpec(userId: string, id: string, matchId: string): Outcome<{ tournament: RoomTournament }> {
    const t = this.store.tournaments.byId(id)
    const m = this.store.tournaments.matchById(matchId)
    if (!t || !m || m.tournamentId !== id || t.ownerId !== userId && !this.store.tournaments.players(id).some((p) => p.userId === userId)) return fail(404, 'tournament.noSuch')
    if (t.state !== 'running' || m.state !== 'ready' || !m.a || !m.b) return fail(409, 'tournament.noMatch')
    return { ok: true, tournament: this.matchSpec(t, m) }
  }

  /** Prochain duel entre ordinateurs : appelé uniquement par la file interne du serveur. */
  nextBotMatch(id: string, running: ReadonlySet<string> = new Set()): RoomTournament | null {
    const t = this.store.tournaments.byId(id)
    if (!t || t.mode !== 'solo' || t.state !== 'running') return null
    const bots = new Set(this.store.tournaments.players(id).filter((p) => p.aiLevel).map((p) => p.userId))
    const match = this.store.tournaments.matches(id).find((m) => m.state === 'ready' && m.a && m.b && bots.has(m.a) && bots.has(m.b) && !running.has(m.id))
    return match ? this.matchSpec(t, match) : null
  }

  private matchSpec(t: TournamentRecord, m: MatchRecord): RoomTournament {
    const id = t.id
    const players = this.store.tournaments.players(id)
    const deckOf = (uid: string): DeckList => {
      const p = players.find((x) => x.userId === uid) as TournamentPlayerRecord
      return { id: `tournament-${m.id}-${uid}`, name: p.deck.name, series: p.deck.series, cover: p.deck.cover, mainCount: p.deck.main.length, extraCount: p.deck.extra.length, main: p.deck.main, extra: p.deck.extra }
    }
    const a = players.find((p) => p.userId === m.a)!
    const b = players.find((p) => p.userId === m.b)!
    return { id: t.id, name: t.name, round: m.round, matchId: m.id, players: [a.userId, b.userId], bots: [a.aiLevel ?? null, b.aiLevel ?? null], names: [a.name, b.name], settings: { ...duelSettings(t.settings), format: t.format, first: DEFAULT_SETTINGS.first }, decks: [deckOf(a.userId), deckOf(b.userId)] }
  }
}
