// Point d'entrée des joueurs : sessions (invité ou compte), salles, et routage des messages vers la bonne salle.
import { msg as ref } from '../shared/msg.ts'
import type { UserStats } from '../shared/accounts.ts'
import { randomBytes } from 'node:crypto'
import type { WebSocket } from 'ws'
import type { ClientMessage, DeckInfo, RoomMode } from '../shared/protocol.ts'
import { OWN_PREFIX } from './accounts/decks.ts'
import { publicUser } from './accounts/service.ts'
import { recordDuel } from './history.ts'
import { deckInfo } from './ocg/decks.ts'
import type { DeckList } from './ocg/decks.ts'
import { Room } from './room.ts'
import type { DuelResult, RoomExt } from './room.ts'
import type { Services } from './services.ts'
import { Session } from './session.ts'
import { SoloTournamentQueue } from './tournaments/solo.ts'

/** Temps laissé à un joueur déconnecté en plein duel pour revenir avant l'abandon. */
const RECONNECT_GRACE = 3 * 60_000

export class Hub {
  private sessions = new Map<string, Session>()
  private rooms = new Set<Room>()
  private readonly s: Services
  private readonly solo: SoloTournamentQueue

  constructor(services: Services) {
    this.s = services
    this.solo = new SoloTournamentQueue(
      (id, running) => services.tournaments.nextBotMatch(id, running), (result) => this.finished(result),
      (id) => { const t = services.store.tournaments.byId(id); if (t) services.hooks.notify([t.ownerId], id, 'state') })
    services.hooks.notify = (userIds, id, reason) => {
      for (const session of this.sessions.values()) if (session.participantId && userIds.includes(session.participantId)) session.send({ t: 'tournamentUpdate', id, reason })
    }
    services.hooks.closeMatchRoom = (matchId) => {
      this.solo.cancel(matchId)
      for (const room of [...this.rooms]) if (room.tournamentMatch === matchId) room.close('closed')
    }
    services.hooks.scheduleBots = (id) => this.solo.enqueue(id)
    services.hooks.botError = (id) => this.solo.hasError(id)
    services.hooks.botProgress = (id) => this.solo.progress(id)
    services.hooks.watchable = (id) => this.solo.watchable(id) || [...this.rooms].some((r) => r.tournamentMatch === id && r.summary().state === 'duel')
    for (const t of services.store.tournaments.runningSolo?.() ?? []) this.solo.enqueue(t.id)
    // Nettoyage des anciennes sessions de connexion, une fois par heure.
    setInterval(() => services.accounts.purge(), 3600_000).unref()
  }

  // ───────────────────────────── Decks ─────────────────────────────

  /** Un deck choisi par un joueur : un des siens (s'il est connecté), sinon un deck du jeu. */
  private resolveDeck = (session: Session, id: string): DeckList | undefined => {
    if (id.startsWith(OWN_PREFIX)) return session.actor ? this.s.decks.get(session.actor.id, id) : undefined
    return this.s.provided.get(id)
  }

  /** Les decks que ce joueur peut choisir : ceux du jeu, et ses decks complets s'il est connecté. */
  private decksFor(session: Session): DeckInfo[] {
    const own = session.actor ? this.s.decks.list(session.actor.id).filter((d) => d.mainCount >= 40 && d.mainCount <= 60 && d.extraCount <= 15) : []
    return [...[...this.s.provided.values()].map(deckInfo), ...own.map(deckInfo)]
  }

  private roomExt(): RoomExt {
    return {
      resolveDeck: this.resolveDeck,
      formats: this.s.formats,
      onFinished: (result) => this.finished(result),
      onDeckChosen: (session, format, id) => this.rememberDeck(session, format, id),
    }
  }

  /** Mémorise sur le profil le deck choisi pour ce format : il sera proposé la prochaine fois. */
  private rememberDeck(session: Session, format: string, id: string): void {
    const user = session.user
    if (!user || user.prefs.activeDecks?.[format] === id) return
    const out = this.s.accounts.updateProfile(user.id, { prefs: { activeDecks: { ...user.prefs.activeDecks, [format]: id } } })
    if (out.ok) session.user = this.s.store.users.byId(user.id) ?? user
  }

  private finished(result: DuelResult): void {
    recordDuel(this.s.store, result)
    this.s.tournaments.onDuelFinished(result)
  }

  // ───────────────────────────── Connexions ─────────────────────────────

  /** Une nouvelle connexion ; renvoie de quoi traiter ses messages et sa fermeture. */
  connect(ws: WebSocket, admin: boolean): { message(msg: ClientMessage): void; close(): void } {
    let session: Session | null = null
    return {
      message: (msg) => {
        if (msg.t === 'hello') {
          session = this.hello(ws, msg.name, msg.token, msg.auth, admin, msg.guest, msg.avatar)
          return
        }
        if (!session || session.ws !== ws) return ws.send(JSON.stringify({ t: 'error', message: ref('err.expired') }))
        this.handle(session, msg)
      },
      close: () => {
        if (session?.ws === ws) this.disconnected(session)
      },
    }
  }

  /** Un invité ne peut pas porter le nom public d'un compte : on lui ajoute un numéro. */
  private guestName(name: string): string {
    let candidate = name
    for (let n = 2; this.s.accounts.isNameTaken(candidate); n++) candidate = `${name.slice(0, 20)} ${n}`
    return candidate
  }

  /** Attache (ou retire) le compte d'une session d'après un jeton de connexion. Renvoie vrai si le jeton était refusé. */
  private attach(session: Session, authToken: string | null | undefined): boolean {
    const auth = authToken ? this.s.accounts.authenticate(authToken) : null
    if (auth) {
      session.user = auth.user
      session.authHash = auth.tokenHash
      session.name = auth.user.displayName
      if (auth.user.prefs.avatar !== undefined) session.avatar = auth.user.prefs.avatar
      return false
    }
    const wasUser = session.user !== null
    session.user = null
    session.authHash = null
    if (wasUser) session.name = this.guestName(session.name)
    return !!authToken
  }

  private sendSession(session: Session, authInvalid = false): void {
    session.send({ t: 'session', token: session.token, name: session.name, admin: session.admin, decks: this.decksFor(session), user: session.user ? publicUser(session.user) : null, formats: this.s.formats.infos(), ...(authInvalid ? { authInvalid: true } : {}) })
  }

  private hello(ws: WebSocket, name: string, token: string | undefined, authToken: string | undefined, admin: boolean, guestKey?: string, avatar?: number | null): Session {
    let session = token ? this.sessions.get(token) : undefined
    if (session) {
      // Reprise de session : l'ancienne connexion, s'il y en a une, est remplacée.
      if (session.ws && session.ws !== ws) session.ws.close()
      clearTimeout(session.dropTimer)
    } else {
      session = new Session(randomBytes(16).toString('hex'), name, admin)
      this.sessions.set(session.token, session)
    }
    session.ws = ws
    session.admin = admin
    session.name = name
    if (avatar !== undefined) session.avatar = avatar
    const refused = this.attach(session, authToken)
    if (!session.user) session.name = this.guestName(name)
    session.guestKey = guestKey
    session.guestUser = this.s.accounts.guests.resolve(guestKey, session.name)
    this.sendSession(session, refused)
    if (session.room) {
      session.room.sync(session)
      session.room.resync()
    } else session.send({ t: 'home' })
    return session
  }

  private disconnected(session: Session): void {
    session.ws = null
    const room = session.room
    if (!room) return void this.sessions.delete(session.token)
    // En plein duel, on garde la place un moment ; l'adversaire est prévenu.
    room.resync()
    session.dropTimer = setTimeout(() => {
      if (session.ws) return
      session.room?.remove(session)
      this.sessions.delete(session.token)
    }, RECONNECT_GRACE)
  }

  // ───────────────────────────── Changements de compte (venus de l'API HTTP) ─────────────────────────────

  private sessionsOf(userId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.participantId === userId)
  }

  /** Le profil d'un compte a changé : nom public, préférences. */
  userChanged(userId: string): void {
    const user = this.s.store.users.byId(userId)
    for (const session of this.sessionsOf(userId)) {
      if (!user) continue
      if (session.user) {
        session.user = user
        session.name = user.displayName
        if (user.prefs.avatar !== undefined) session.avatar = user.prefs.avatar
      } else session.guestUser = user
      this.sendSession(session)
      session.room?.sync(session)
    }
  }

  /** Des connexions ont été coupées côté serveur : ces sessions redeviennent des invités. */
  signedOut(userId: string, keepHash?: string): void {
    for (const session of this.sessionsOf(userId)) {
      if (keepHash && session.authHash === keepHash) continue
      this.attach(session, null)
      this.sendSession(session, true)
      session.room?.sync(session)
    }
  }

  deleted(userId: string): void {
    this.signedOut(userId)
  }

  stats(userId: string): UserStats {
    return this.s.store.duels.stats(userId)
  }

  // ───────────────────────────── Messages ─────────────────────────────

  private newRoom(mode: RoomMode): Room {
    return new Room(mode, this.s.provided, (r) => this.rooms.delete(r), this.roomExt())
  }

  private handle(session: Session, msg: ClientMessage): void {
    switch (msg.t) {
      case 'hello':
        return
      case 'auth': {
        // Connexion ou déconnexion d'un compte sur cette connexion ouverte.
        const refused = this.attach(session, msg.token)
        this.sendSession(session, refused)
        return session.room?.sync(session)
      }
      case 'rename':
        // Le nom d'un compte est son nom public (profil) : seul un invité peut en changer ici.
        if (session.user) return
        session.name = this.guestName(msg.name)
        return session.room?.sync(session)
      case 'avatar': {
        session.avatar = msg.avatar
        // Un compte retrouve son avatar sur ses autres appareils.
        const user = session.user
        if (user && user.prefs.avatar !== msg.avatar && this.s.accounts.updateProfile(user.id, { prefs: { avatar: msg.avatar } }).ok) session.user = this.s.store.users.byId(user.id) ?? user
        return session.room?.sync(session)
      }
      case 'play': {
        if (session.room) return session.room.sync(session)
        // En réseau local, on rejoint la salle qui attend un joueur ; sinon on en ouvre une.
        const waiting = msg.mode === 'ai' || msg.mode === 'sandbox' || msg.mode === 'aivai' ? undefined : [...this.rooms].find((r) => r.mode === msg.mode && r.open && !r.isTournament && !(session.user && r.hasUser(session.user.id)))
        const room = waiting ?? this.newRoom(msg.mode)
        this.rooms.add(room)
        room.add(session)
        return
      }
      case 'rooms':
        // Les duels contre l'ordinateur, entre ordinateurs, le bac à sable et les matchs de tournoi sont privés : on ne les propose pas.
        return session.send({ t: 'rooms', rooms: [...this.rooms].filter((r) => (r.mode === 'lan' || r.mode === 'team') && !r.isTournament).map((r) => r.summary()) })
      case 'join': {
        if (session.room) return session.room.sync(session)
        const room = [...this.rooms].find((r) => r.id === msg.room && !r.isTournament)
        if (!room) return session.send({ t: 'error', message: ref('err.noRoom') })
        if (!msg.spectate && session.user && room.hasUser(session.user.id)) return session.send({ t: 'error', message: ref('err.sameAccount') })
        const ok = msg.spectate ? room.watch(session) : room.add(session)
        if (!ok) session.send({ t: 'error', message: msg.spectate ? ref('err.notStarted') : ref('err.full') })
        return
      }
      case 'tournamentMatch': {
        if (session.room) return session.room.sync(session)
        const participant = session.participantId
        if (!participant) return session.send({ t: 'error', message: ref('guest.unavailable') })
        if (msg.spectate) {
          const spec = this.s.tournaments.spectatorSpec(participant, msg.tournament, msg.match)
          if (!spec.ok) return session.send({ t: 'error', message: spec.error })
          const room = [...this.rooms].find((r) => r.tournamentMatch === msg.match && r.summary().state === 'duel')
          const watching = room ? room.watch(session) : this.solo.watch(msg.match, session)
          if (!watching) session.send({ t: 'error', message: ref('tournament.notWatchable') })
          return
        }
        // L'autorisation porte aussi sur le tournoi indiqué lorsque le salon existe déjà.
        const spec = this.s.tournaments.roomSpec(participant, msg.tournament, msg.match)
        if (!spec.ok) return session.send({ t: 'error', message: spec.error })
        // Le salon du match existe peut-être déjà (l'autre joueur est arrivé le premier).
        let room = [...this.rooms].find((r) => r.tournamentMatch === msg.match)
        if (!room) {
          room = new Room(spec.tournament.bots?.some(Boolean) ? 'ai' : 'lan', this.s.provided, (r) => this.rooms.delete(r), {
            ...this.roomExt(), tournament: spec.tournament,
            onPublicState: (state) => {
              if (!state.events.some((e) => e.type === 'start')) return
              const tournament = this.s.store.tournaments.byId(msg.tournament)
              if (tournament) this.s.hooks.notify([tournament.ownerId, ...this.s.store.tournaments.players(msg.tournament).map((p) => p.userId)], msg.tournament, 'state')
            },
          })
          this.rooms.add(room)
        }
        if (!room.add(session)) session.send({ t: 'error', message: ref('err.full') })
        return
      }
      case 'leave':
        return session.room?.remove(session)
      case 'surrender':
        // Un spectateur n'a rien à abandonner : il quitte la salle.
        return session.room?.isWatcher(session) ? session.room.remove(session) : session.room?.handle(session, msg)
      case 'kick':
        if (!session.admin) return session.send({ t: 'error', message: ref('err.adminOnly') })
        return session.room?.kickOther(session, msg.seat)
      default:
        if (!session.room) return session.send({ t: 'home' })
        return session.room.handle(session, msg)
    }
  }
}
