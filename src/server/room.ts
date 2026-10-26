// Une salle : 2 places (duel simple) ou 4 (par équipes), tenues par des joueurs ou par l'ordinateur ;
// un salon, puis un duel. Places paires = équipe 1, impaires = équipe 2.
import { msg as ref } from '../shared/msg.ts'
import { randomBytes } from 'node:crypto'
import { DEFAULT_SETTINGS } from '../shared/protocol.ts'
import type { AiLevel, ClientMessage, DeckInfo, DuelPlayer, GameEvent, DuelSettings, DuelView, Hand, LobbySeat, RoomInfo, RoomMode, RoomSummary, RpsInfo, Seat, ServerMessage } from '../shared/protocol.ts'
import type { DuelMeta, FormatCheck } from '../shared/formats.ts'
import { randomHand, rpsWinner } from '../shared/rps.ts'
import { Computer } from './ai/computer.ts'
import { evaluateChallenge } from './challenges.ts'
import type { FormatCatalog } from './formats/catalog.ts'
import { deckInfo } from './ocg/decks.ts'
import type { DeckList } from './ocg/decks.ts'
import { Duel } from './ocg/duel.ts'
import type { Step } from './ocg/duel.ts'
import type { Session } from './session.ts'
import { ReplayRecorder } from './replay.ts'

interface SeatState {
  /** null pour l'ordinateur. */
  session: Session | null
  name: string
  deck: string | null
  /** Le deck choisi, tel qu'il était au moment du choix (et revu à chaque « prêt »). */
  list: DeckList | null
  /** Premier défaut bloquant du deck face au format et au thème de la salle, ou null s'il est autorisé. */
  issue: string | null
  ready: boolean
  bot: Computer | null
  /** Place de l'ordinateur sans deck choisi : le deck est tiré au hasard parmi cette série de decks du jeu (toutes, si absent). */
  randomSeries?: string
}

/** Ce que la salle reçoit du reste du serveur (tout est facultatif : un salon de test n'a besoin de rien). */
export interface RoomExt {
  /** Retrouve un deck choisi par un joueur : les siens, puis ceux du jeu. */
  resolveDeck?: (session: Session, id: string) => DeckList | undefined
  formats?: FormatCatalog
  /** Un duel vient de se terminer : à enregistrer. */
  onFinished?: (result: DuelResult) => void
  /** Un joueur vient de choisir ce deck pour ce format : à mémoriser sur son profil. */
  onDeckChosen?: (session: Session, format: string, deckId: string) => void
  /** Salon d'un match de tournoi privé. */
  tournament?: RoomTournament
  /** Duel entre ordinateurs en arrière-plan : aucune animation à attendre. */
  automated?: boolean
  onStartFailed?: () => void
  /** Vue publique uniquement : diffusion d'un duel de worker ou notification de son démarrage. */
  onPublicState?: (state: Extract<ServerMessage, { t: 'state' }>) => void
}

/** Salon d'un match de tournoi : réservé à deux comptes, avec des réglages imposés. */
export interface RoomTournament {
  id: string
  name: string
  round: number
  matchId: string
  /** Comptes autorisés à s'asseoir (un par équipe). */
  players: [string, string]
  bots?: [AiLevel | null, AiLevel | null]
  names?: [string, string]
  /** Leurs decks, copiés à l'inscription : on ne les change pas pendant le tournoi. */
  decks: [DeckList, DeckList]
  settings: Partial<DuelSettings>
}

/** Fin d'un duel : de quoi l'enregistrer dans l'historique et, au besoin, régler un match de tournoi. */
export interface DuelResult {
  id: string
  startedAt: number
  endedAt: number
  mode: RoomMode
  meta: DuelMeta
  winner: Seat | 'draw'
  players: { place: number; team: Seat; userId: string | null; name: string; bot: boolean; deckName: string; result: 'win' | 'loss' | 'draw' }[]
  /** Graine, cartes mélangées et réponses : de quoi refaire le duel. Contient les Decks : privé. */
  record: ReturnType<Duel['exportRecord']>
  tournament?: { id: string; matchId: string }
}

/** Délai minimal avant que l'ordinateur réponde (réflexion comprise), pour laisser les animations se jouer chez le joueur. */
const BOT_DELAY = Number(process.env.BOT_DELAY ?? 850)
const BOT_PASS_DELAY = Math.min(300, BOT_DELAY)
/** IA contre IA : les ordinateurs n'ont pas à se presser, on les regarde jouer (un peu plus lent que contre un joueur). */
const WATCH_DELAY = Math.round(BOT_DELAY * 1.4)
/** IA contre IA : au plus ce temps (ms) d'attente de l'écran du spectateur avant de reprendre le jeu quand même. */
const WATCH_PATIENCE = Number(process.env.WATCH_PATIENCE ?? 9000)

/** Pile ou face : durée du lancer chez les joueurs, temps laissé pour choisir, puis annonce avant le duel. */
const TOSS_SPIN = 2400
const TOSS_TIMEOUT = 20_000
const TOSS_ANNOUNCE = 1800

/** Pierre-feuille-ciseaux : temps pour choisir une carte, et durée de l'entrechoc chez les joueurs (cartes retournées, choc, carte perdante détruite). */
const RPS_TIMEOUT = 20_000
const RPS_REVEAL = Number(process.env.RPS_REVEAL ?? 5200)

/** Niveau de l'ordinateur tant qu'on ne le change pas dans le salon. */
const DEFAULT_LEVEL: AiLevel = 'normal'
const LEVEL_KEY: Record<AiLevel, string> = { easy: 'level.easy', normal: 'level.normal', hard: 'level.hard' }

const coin = (): Seat => (randomBytes(1).readUInt8() < 128 ? 0 : 1)

/** Pour les tests visuels : mains de départ imposées à chaque équipe, ex. TEST_HANDS='[[62089826],[89631139]]'. */
const TEST_HANDS = process.env.TEST_HANDS ? (JSON.parse(process.env.TEST_HANDS) as [number[], number[]]) : null

/** Pierre-feuille-ciseaux d'avant-duel : une carte par équipe, jouée par un représentant (un humain de l'équipe, sinon l'ordinateur). */
interface RpsState {
  round: number
  picks: (Hand | null)[]
  phase: 'pick' | 'reveal' | 'won'
  outcome: Seat | 'draw' | null
  /** Place qui joue pour chaque équipe. */
  reps: number[]
}

export class Room {
  readonly id = randomBytes(3).toString('hex')
  readonly mode: RoomMode
  private seats: (SeatState | null)[]
  private duel: Duel | null = null
  private recording: ReplayRecorder | null = null
  /** Spectateurs : ils voient le duel comme le public (ni main ni carte posée), sans pouvoir jouer. */
  private spectators: Session[] = []
  private starting = false
  private lifecycle = 0
  /** Pile ou face en cours, entre le salon et le duel : place du joueur qui choisit, équipe qui commencera. */
  private toss: { kind: 'coin' | 'rps'; winner: Seat; chooser: number; first: Seat | null; decks: DeckList[]; deadline: number; timer: ReturnType<typeof setTimeout>; rps?: RpsState } | null = null
  /** Decks fournis avec le jeu : ceux que l'ordinateur peut jouer. */
  private decks: Map<string, DeckList>
  private ext: RoomExt
  private startedAt = 0
  private deckNames: string[] = []
  private reported = false
  private onEmpty: (room: Room) => void
  private botTimer: ReturnType<typeof setTimeout> | undefined
  private botAttempts = 0
  /** Question à laquelle l'ordinateur est en train de réfléchir (une seule réflexion à la fois). */
  private thinking: number | null = null
  /** Dernière vue envoyée à chaque place : on ne renvoie pas un état identique. */
  private lastSent = new Map<number, string>()
  private lastWatch = ''
  private settings: DuelSettings = { ...DEFAULT_SETTINGS }
  /** IA contre IA : celui qui a ouvert la salle. Il n'a pas de place : il règle les deux ordinateurs, puis regarde (c'est un spectateur). */
  private host: Session | null = null
  /** IA contre IA : l'écran du spectateur a fini de jouer ce qu'il a reçu ; sinon les ordinateurs l'attendent. */
  private hostIdle = true
  private idleWaiters: (() => void)[] = []
  /** Compte à rebours de la décision en cours : place concernée et échéance. */
  private clock: { place: number; deadline: number; timer: ReturnType<typeof setTimeout> } | null = null

  constructor(mode: RoomMode, decks: Map<string, DeckList>, onEmpty: (room: Room) => void, ext: RoomExt = {}) {
    this.mode = mode
    this.decks = decks
    this.ext = ext
    this.onEmpty = onEmpty
    this.seats = Array.from({ length: mode === 'team' ? 4 : 2 }, () => null)
    if (mode === 'ai' || mode === 'sandbox') this.seats[1] = this.botSeat()
    // IA contre IA : les deux places sont tenues par l'ordinateur.
    if (mode === 'aivai') this.seats = [this.botSeat(), this.botSeat()]
    // Bac à sable : pas de limite de temps, et c'est toujours le joueur qui commence.
    if (mode === 'sandbox') this.settings = { ...this.settings, turnTime: 0, first: 0 }
    // Match de tournoi : les réglages viennent du tournoi et ne changent plus.
    if (ext.tournament) {
      const t = ext.tournament
      this.settings = { ...this.settings, ...t.settings }
      if (t.bots) this.seats = t.bots.map((level, place) => level ? {
        ...this.botSeat(), bot: new Computer(level), name: t.names?.[place] ?? ref('srv.computer'),
        deck: t.decks[place]!.id, list: t.decks[place]!, issue: this.issueOf(t.decks[place]!),
      } : null)
    }
  }

  /** Réservé à la file des matchs de tournoi entre ordinateurs. */
  startAutomatedTournament(): boolean {
    if (!this.ext.automated || !this.ext.tournament || !this.seats.every((s) => s?.bot)) return false
    this.startDuel()
    return true
  }

  get isTournament(): boolean {
    return !!this.ext.tournament
  }

  /** Ce compte a-t-il déjà une place (ou regarde-t-il) dans cette salle ? */
  hasUser(userId: string): boolean {
    return this.seats.some((s) => s?.session?.user?.id === userId)
  }

  get tournamentMatch(): string | undefined {
    return this.ext.tournament?.matchId
  }

  // ───────────────────────────── Decks et format ─────────────────────────────

  private pick(session: Session | null, id: string): DeckList | undefined {
    const t = this.ext.tournament
    if (t) {
      const i = session?.participantId ? t.players.indexOf(session.participantId) : -1
      return i >= 0 ? t.decks[i] : undefined
    }
    return session && this.ext.resolveDeck ? this.ext.resolveDeck(session, id) : this.decks.get(id)
  }

  /** Premier défaut bloquant d'un deck face au format et au thème de la salle ; null si le deck est autorisé. */
  private issueOf(list: DeckList): string | null {
    const check: FormatCheck | null = this.ext.formats ? this.ext.formats.check(this.settings.format, list) : null
    const first = check?.issues.find((i) => i.level === 'blocking')
    if (first) return first.text
    if (!this.ext.formats && this.settings.format !== 'casual') return ref('format.issue.noList')
    if (this.settings.theme && list.series !== this.settings.theme) return ref('format.issue.theme', { theme: this.settings.theme })
    return null
  }

  /** Revoit tous les decks choisis (le format ou le thème a changé), et propose le deck habituel à qui n'en a plus de valable. */
  private revalidate(): void {
    this.seats.forEach((s, place) => {
      if (!s) return
      if (s.list) s.issue = this.issueOf(s.list)
      if (!s.bot && s.session && (!s.list || s.issue)) this.autoPick(s, place)
    })
  }

  /** Le deck que ce joueur avait choisi la dernière fois pour ce format, s'il existe encore et respecte les règles de la salle. */
  private autoPick(s: SeatState, _place: number): void {
    const id = s.session?.user?.prefs.activeDecks?.[this.settings.format]
    const list = id && s.session ? this.pick(s.session, id) : undefined
    if (!list || !id || this.issueOf(list)) return
    s.deck = id
    s.list = list
    s.issue = null
  }

  /** Applique des réglages ; false si la salle ne le permet pas (duel commencé, tournoi). */
  private applySettings(patch: Partial<DuelSettings>, from?: Session): boolean {
    if (this.duel || this.ext.tournament) return false
    const next = { ...patch }
    // Un format sans liste ne se choisit pas : on ne laisse pas croire qu'un deck serait en règle.
    if (next.format && !(this.ext.formats ? this.ext.formats.available(next.format) : next.format === 'casual')) {
      from?.send({ t: 'error', message: ref('err.formatMissing') })
      delete next.format
    }
    this.settings = { ...this.settings, ...next }
    this.revalidate()
    return true
  }

  /** Une place tenue par l'ordinateur. Son deck est tiré au hasard tant qu'on ne lui en choisit pas. */
  private botSeat(): SeatState {
    // Dans le bac à sable, l'adversaire ne joue pas : il laisse le joueur tester ce qu'il veut.
    return { session: null, name: ref(this.mode === 'sandbox' ? 'srv.passive' : 'srv.computer'), deck: null, ready: true, list: null, issue: null, bot: new Computer(DEFAULT_LEVEL, { passive: this.mode === 'sandbox' }) }
  }

  /** Une place est libre et la partie n'a pas commencé. */
  get open(): boolean {
    return this.mode !== 'aivai' && !this.duel && !this.toss && !this.starting && this.seats.some((s) => s === null)
  }

  private get humans(): Session[] {
    return this.seats.flatMap((s) => (s?.session ? [s.session] : []))
  }

  private seatOf(session: Session): number | null {
    const i = this.seats.findIndex((s) => s?.session === session)
    return i < 0 ? null : i
  }

  /** Membres d'une équipe (places paires ou impaires). */
  private team(team: number): SeatState[] {
    return this.seats.filter((s, i): s is SeatState => s !== null && i % 2 === team)
  }

  /** Nom affiché de chaque équipe : « David & Ordinateur ». */
  private names(): string[] {
    return [0, 1].map((t) => this.seats.flatMap((s, place) => (s && place % 2 === t ? [this.nameOf(s, place)] : [])).join(' & ') || '—')
  }

  /** Nom affiché d'une place. Entre ordinateurs, chacun porte son numéro et son niveau : « Ordinateur 2 (Expert) ». */
  private nameOf(s: SeatState, place: number): string {
    return this.mode === 'aivai' && s.bot ? ref('srv.cpu', { n: place + 1, level: ref(LEVEL_KEY[s.bot.level]) }) : s.name
  }

  /** Chaque duelliste à sa place, avec son avatar : le nom d'équipe ne dit pas qui joue. */
  private players(): DuelPlayer[] {
    return this.seats.flatMap((s, place) => (s ? [{ place, name: this.nameOf(s, place), avatar: s.bot ? null : (s.session?.avatar ?? null), bot: !!s.bot }] : []))
  }

  private connected(): boolean[] {
    return [0, 1].map((t) => this.team(t).every((s) => s.bot !== null || s.session?.ws != null))
  }

  // ───────────────────────────── Entrées et sorties ─────────────────────────────

  add(session: Session): boolean {
    // IA contre IA : on entre comme spectateur, sans place ; le salon est montré dès l'arrivée.
    if (this.mode === 'aivai') {
      if (this.host) return false
      this.host = session
      this.spectators.push(session)
      session.room = this
      this.broadcastLobby()
      return true
    }
    const t = this.ext.tournament
    // Tournoi : seuls les deux joueurs du match entrent, chacun à sa place.
    if (t && !(session.participantId && t.players.includes(session.participantId))) return false
    const free = t && session.participantId ? t.players.indexOf(session.participantId) : this.seats.findIndex((s) => s === null)
    if (free < 0 || this.seats[free] !== null || this.duel || this.toss) return false
    const seat: SeatState = { session, name: session.name, deck: null, list: null, issue: null, ready: false, bot: null }
    this.seats[free] = seat
    if (t) {
      // Le deck du tournoi est imposé.
      const list = t.decks[free] as DeckList
      seat.deck = list.id
      seat.list = list
      seat.issue = this.issueOf(list)
    } else this.autoPick(seat, free)
    session.room = this
    this.broadcastLobby()
    return true
  }

  /** Un résumé du salon, pour la liste des salles. */
  summary(): RoomSummary {
    const state = this.duel ? (this.duel.finished ? 'over' : 'duel') : this.toss ? 'toss' : 'lobby'
    return {
      id: this.id,
      mode: this.mode,
      state,
      seats: this.seats.map((s) => (s ? { name: s.name, bot: s.bot !== null } : null)),
      spectators: this.spectators.length,
      turn: this.duel?.currentView(0).turn ?? 0,
      open: this.open,
      watchable: this.duel !== null,
      format: this.settings.format,
      challenge: this.settings.challenge,
      theme: this.settings.theme,
      tournament: this.isTournament,
    }
  }

  isWatcher(session: Session): boolean {
    return this.spectators.includes(session)
  }

  /** Regarder le duel sans y jouer. */
  watch(session: Session): boolean {
    if (!this.duel) return false
    this.spectators.push(session)
    session.room = this
    this.sendWatch(session, [])
    return true
  }

  private sendWatch(session: Session, events: GameEvent[]): void {
    const duel = this.duel
    if (!duel) return
    session.send({ t: 'state', view: this.withJournal(duel.watchView()), events, names: this.names(), players: this.players(), connected: this.connected(), timer: this.timeLeft(), matchId: this.recording?.replay.id, ...(this.isTournament ? { room: this.lobbyInfo(-1) } : {}) })
  }

  private withJournal(view: DuelView): DuelView {
    return this.recording ? { ...view, log: [...this.recording.replay.log], logOffset: 0 } : view
  }

  /** Un joueur quitte la salle. En plein duel, c'est un abandon. */
  remove(session: Session, reason?: 'kicked' | 'reset' | 'closed'): void {
    const seat = this.seatOf(session)
    if (seat === null) {
      // Un spectateur s'en va : rien ne change pour les joueurs.
      if (this.spectators.includes(session)) {
        // IA contre IA : sans spectateur, le duel n'a plus de raison de continuer.
        if (session === this.host) return this.close()
        this.spectators = this.spectators.filter((x) => x !== session)
        session.room = null
        session.send({ t: 'home', ...(reason ? { reason } : {}) })
      }
      return
    }
    if (this.duel && !this.duel.finished) this.sendSteps(this.duel.surrender(seat))
    this.seats[seat] = null
    session.room = null
    session.send({ t: 'home', ...(reason ? { reason } : {}) })
    this.cancelToss()
    if (!this.humans.length) return this.close()
    for (const s of this.seats) if (s && !s.bot) s.ready = false
    if (!this.duel) this.broadcastLobby()
    else this.resync()
  }

  /** Ferme la salle : tout le monde retourne à l'accueil. */
  close(reason?: 'reset' | 'closed'): void {
    this.lifecycle++
    clearTimeout(this.botTimer)
    clearTimeout(this.clock?.timer)
    this.clock = null
    this.cancelToss()
    this.duel?.destroy()
    this.duel = null
    for (const session of [...this.humans, ...this.spectators]) {
      session.room = null
      session.send({ t: 'home', ...(reason ? { reason } : {}) })
    }
    this.spectators = []
    this.seats = this.seats.map(() => null)
    this.onEmpty(this)
  }

  /** L'hôte éjecte un joueur de sa salle (celui de la place indiquée, sinon tous les autres). */
  kickOther(session: Session, place?: number): void {
    const targets = place === undefined ? this.humans.filter((s) => s !== session) : this.humans.filter((s) => s !== session && this.seatOf(s) === place)
    for (const other of targets) this.remove(other, 'kicked')
  }

  /** Renvoie à un joueur l'état courant de la salle (arrivée, reconnexion). */
  sync(session: Session): void {
    const seat = this.seatOf(session)
    if (seat === null) {
      return this.mode === 'aivai' && !this.duel ? this.broadcastLobby() : this.sendWatch(session, [])
    }
    const s = this.seats[seat] as SeatState
    s.name = session.name
    if (this.duel) session.send({ t: 'state', view: this.withJournal(this.duel.currentView(seat)), events: [], names: this.names(), players: this.players(), connected: this.connected(), timer: this.timeLeft(), matchId: this.recording?.replay.id, ...(this.isTournament ? { room: this.lobbyInfo(seat) } : {}) })
    else if (this.toss) this.broadcastToss()
    else this.broadcastLobby()
  }

  /** Un joueur a perdu ou retrouvé sa connexion : on prévient l'autre. */
  resync(): void {
    if (!this.duel) return this.toss ? this.broadcastToss() : this.broadcastLobby()
    const duel = this.duel
    this.seats.forEach((s, place) => s?.session?.send({ t: 'state', view: this.withJournal(duel.currentView(place)), events: [], names: this.names(), players: this.players(), connected: this.connected(), timer: this.timeLeft(), matchId: this.recording?.replay.id }))
    for (const w of this.spectators) this.sendWatch(w, [])
  }

  // ───────────────────────────── Salon ─────────────────────────────

  private lobbyInfo(you: number): RoomInfo {
    const seats = this.seats.map((s, place): LobbySeat | null => {
      if (!s) return null
      const info: DeckInfo | null = s.list ? deckInfo(s.list) : null
      return { name: this.nameOf(s, place), deck: s.deck, deckInfo: info, legal: s.list ? s.issue === null : null, ...(s.issue ? { issue: s.issue } : {}), ready: s.ready, connected: !!s.bot || s.session?.ws != null, bot: !!s.bot, ...(s.bot && this.mode !== 'sandbox' ? { level: s.bot.level } : {}), ...(s.bot && !s.list && s.randomSeries ? { randomSeries: s.randomSeries } : {}) }
    })
    const t = this.ext.tournament
    const tournament = t ? { tournament: { id: t.id, name: t.name, round: t.round } } : {}
    return { id: this.id, mode: this.mode, settings: this.settings, you, seats, ...tournament }
  }

  private broadcastLobby(): void {
    this.seats.forEach((s, you) => s?.session?.send({ t: 'lobby', room: this.lobbyInfo(you) }))
    this.host?.send({ t: 'lobby', room: this.lobbyInfo(-1) })
  }

  /** Tous les joueurs sont prêts : on décide qui commence (réglage, ou pile ou face), puis le duel démarre. */
  private startDuel(): void {
    if (this.starting || this.duel || this.toss) return
    // Toutes les places doivent être prises. L'ordinateur joue le deck choisi pour lui, sinon un deck du jeu tiré au hasard
    // parmi ceux que le format et le thème de la salle autorisent.
    if (this.seats.some((s) => s === null)) return
    const allowed = [...this.decks.values()].filter((d) => !this.issueOf(d))
    const draw = (s: SeatState): DeckList | undefined => {
      // Une série demandée mais sans deck autorisé par le format ou le thème : on tire parmi tous les decks autorisés.
      const ofSeries = s.randomSeries ? allowed.filter((d) => d.series === s.randomSeries) : []
      const pool = ofSeries.length ? ofSeries : allowed
      return pool.length ? (pool[randomBytes(2).readUInt16BE() % pool.length] as DeckList) : undefined
    }
    const chosen = this.seats.map((s) => (s ? (s.list ?? (s.bot ? draw(s) : undefined)) : undefined))
    if (chosen.some((d) => !d)) {
      for (const s of this.humans) s.send({ t: 'error', message: ref('err.noLegalDeck') })
      for (const s of this.seats) if (s && !s.bot) s.ready = false
      this.ext.onStartFailed?.()
      return this.broadcastLobby()
    }
    const blocked = this.seats.find((s) => s?.issue)
    if (blocked) {
      for (const s of this.humans) s.send({ t: 'error', message: blocked.issue as string })
      this.ext.onStartFailed?.()
      for (const s of this.seats) if (s && !s.bot) s.ready = false
      return this.broadcastLobby()
    }
    const decks = chosen as DeckList[]
    if (this.mode === 'sandbox') return void this.launch(decks, 0)
    // IA contre IA : personne ne choisit, le tirage est un simple hasard (ou une équipe imposée).
    if (this.mode === 'aivai' || this.ext.automated) return void this.launch(decks, this.settings.first === 0 || this.settings.first === 1 ? this.settings.first : coin())
    if (this.settings.first === 'rps') return this.startRps(decks)
    if (this.settings.first !== 'coin') return void this.launch(decks, this.settings.first === 'random' ? coin() : this.settings.first)

    // Pile ou face : l'équipe désignée choisit. Un joueur humain de l'équipe décide ; à défaut, l'ordinateur commence.
    const winner = coin()
    const team = this.seats.flatMap((s, place) => (s && place % 2 === winner ? [place] : []))
    const chooser = team.find((place) => !this.seats[place]?.bot) ?? (team[0] as number)
    const wait = TOSS_SPIN + (this.seats[chooser]?.bot ? 700 : TOSS_TIMEOUT)
    this.toss = { kind: 'coin', winner, chooser, first: null, decks, deadline: Date.now() + wait, timer: setTimeout(() => this.decideToss(winner), wait) }
    this.broadcastToss()
  }

  // ───────────────────────────── Pierre-feuille-ciseaux ─────────────────────────────

  /** Chaque équipe joue une carte, en secret ; elles se découvrent ensemble, la perdante est détruite, et une égalité se rejoue. */
  private startRps(decks: DeckList[]): void {
    const reps = [0, 1].map((t) => {
      const team = this.seats.flatMap((s, place) => (s && place % 2 === t ? [place] : []))
      return team.find((place) => !this.seats[place]?.bot) ?? (team[0] as number)
    })
    const rps: RpsState = { round: 1, picks: [null, null], phase: 'pick', outcome: null, reps }
    this.toss = { kind: 'rps', winner: 0, chooser: -1, first: null, decks, deadline: Date.now() + RPS_TIMEOUT, timer: setTimeout(() => this.rpsExpire(), RPS_TIMEOUT), rps }
    this.botsPick()
    this.broadcastToss()
  }

  /** Les équipes tenues par l'ordinateur jouent au bout d'un instant, pour laisser voir qu'elles « réfléchissent ». */
  private botsPick(): void {
    const toss = this.toss
    const r = toss?.rps
    if (!toss || !r) return
    const round = r.round
    r.reps.forEach((place, team) => {
      if (!this.seats[place]?.bot) return
      setTimeout(() => {
        if (this.toss === toss && r.round === round && r.phase === 'pick') this.rpsPick(team, randomHand())
      }, Math.min(BOT_DELAY, 700) + randomBytes(1).readUInt8() * 4 * (BOT_DELAY < 100 ? 0 : 1))
    })
  }

  private rpsPick(team: number, hand: Hand): void {
    const r = this.toss?.rps
    if (!r || r.phase !== 'pick' || r.picks[team] !== null) return
    r.picks[team] = hand
    if (r.picks.every((p) => p !== null)) return this.rpsReveal()
    this.broadcastToss()
  }

  /** Le temps est écoulé : qui n'a pas choisi joue au hasard. */
  private rpsExpire(): void {
    const r = this.toss?.rps
    if (!r || r.phase !== 'pick') return
    r.picks = r.picks.map((p) => p ?? randomHand())
    this.rpsReveal()
  }

  private rpsReveal(): void {
    const toss = this.toss
    const r = toss?.rps
    if (!toss || !r) return
    const [a, b] = r.picks as [Hand, Hand]
    const w = rpsWinner(a, b)
    r.outcome = w === null ? 'draw' : w === 'a' ? 0 : 1
    r.phase = 'reveal'
    clearTimeout(toss.timer)
    toss.deadline = Date.now() + RPS_REVEAL
    toss.timer = setTimeout(() => this.rpsAfter(), RPS_REVEAL)
    this.broadcastToss()
  }

  /** L'entrechoc est joué : égalité = nouvelle manche ; sinon l'équipe gagnante choisit qui commence. */
  private rpsAfter(): void {
    const toss = this.toss
    const r = toss?.rps
    if (!toss || !r || r.phase !== 'reveal' || r.outcome === null) return
    if (r.outcome === 'draw') {
      r.round++
      r.picks = [null, null]
      r.phase = 'pick'
      r.outcome = null
      toss.deadline = Date.now() + RPS_TIMEOUT
      toss.timer = setTimeout(() => this.rpsExpire(), RPS_TIMEOUT)
      this.botsPick()
      return this.broadcastToss()
    }
    const winner = r.outcome
    const team = this.seats.flatMap((s, place) => (s && place % 2 === winner ? [place] : []))
    toss.winner = winner
    toss.chooser = team.find((place) => !this.seats[place]?.bot) ?? (team[0] as number)
    r.phase = 'won'
    const wait = this.seats[toss.chooser]?.bot ? 1200 : TOSS_TIMEOUT
    toss.deadline = Date.now() + wait
    toss.timer = setTimeout(() => this.decideToss(winner), wait)
    this.broadcastToss()
  }

  /** Le choix est fait (ou le délai écoulé) : on l'annonce, puis le duel démarre. */
  private decideToss(first: Seat): void {
    const toss = this.toss
    if (!toss || toss.first !== null) return
    clearTimeout(toss.timer)
    toss.first = first
    toss.timer = setTimeout(() => {
      this.toss = null
      void this.launch(toss.decks, first)
    }, TOSS_ANNOUNCE)
    this.broadcastToss()
  }

  private cancelToss(): void {
    clearTimeout(this.toss?.timer)
    this.toss = null
  }

  private broadcastToss(): void {
    const toss = this.toss
    if (!toss) return
    const names = this.names()
    const chooser = this.seats[toss.chooser]?.name ?? ''
    this.seats.forEach((s, place) => {
      const you: Seat = place % 2 === 0 ? 0 : 1
      const r = toss.rps
      const rps: RpsInfo | undefined = r
        ? {
            round: r.round,
            phase: r.phase,
            plays: r.reps[you] === place,
            picked: r.picks[you] !== null,
            foePicked: r.picks[you === 0 ? 1 : 0] !== null,
            // Les cartes ne sont dévoilées qu'une fois les deux choisies.
            picks: r.phase === 'pick' ? null : (r.picks as [Hand, Hand]),
            outcome: r.phase === 'pick' ? null : r.outcome,
          }
        : undefined
      s?.session?.send({ t: 'toss', toss: { kind: toss.kind, ...(rps ? { rps } : {}), winner: toss.winner, you, names, chooser, choose: place === toss.chooser, first: toss.first, ms: Math.max(0, toss.deadline - Date.now()) } })
    })
  }

  private async launch(decks: DeckList[], first: Seat): Promise<void> {
    if (this.starting || this.duel) return
    this.starting = true
    const lifecycle = this.lifecycle
    try {
      this.lastSent.clear()
      const duel = await Duel.create(decks, first, TEST_HANDS ? { hands: TEST_HANDS } : undefined, { ...this.settings, sandbox: this.mode === 'sandbox' })
      if (lifecycle !== this.lifecycle) { duel.destroy(); return }
      this.duel = duel
      this.startedAt = Date.now()
      this.reported = false
      this.deckNames = decks.map((d) => d.name)
      this.recording = new ReplayRecorder(this.mode, this.names(), decks.map((d, place) => ({ seat: place % 2 as Seat, name: d.name, cover: d.cover || null })), this.metaFor(first), this.players())
      this.botAttempts = 0
      for (const s of this.seats) s?.bot?.reset()
      this.sendSteps(this.duel.start())
    } catch (e) {
      console.error(e)
      this.duel = null
      for (const s of this.seats) if (s && !s.bot) s.ready = false
      for (const session of this.humans) session.send({ t: 'error', message: ref('err.cantStart') })
      this.broadcastLobby()
      this.ext.onStartFailed?.()
    } finally {
      this.starting = false
    }
  }

  // ───────────────────────────── Duel ─────────────────────────────

  /**
   * Compte à rebours de la décision attendue. Il repart quand quelque chose de visible s'est produit
   * ou que la main passe à un autre joueur ; tant qu'un joueur enchaîne des choix invisibles (zone,
   * Tribut, annulation), il continue de tourner. L'ordinateur n'est pas chronométré.
   */
  private armClock(visible: boolean): void {
    const waiting = this.duel?.waiting
    const limit = this.settings.turnTime * 1000
    if (!waiting || !limit || this.seats[waiting.seat]?.bot) {
      clearTimeout(this.clock?.timer)
      this.clock = null
      return
    }
    if (this.clock?.place === waiting.seat && !visible) return
    clearTimeout(this.clock?.timer)
    const place = waiting.seat
    this.clock = { place, deadline: Date.now() + limit, timer: setTimeout(() => this.timeUp(place), limit) }
  }

  private timeUp(place: number): void {
    const duel = this.duel
    if (!duel || duel.finished || duel.waiting?.seat !== place) return
    for (const s of this.humans) s.send({ t: 'error', message: ref('err.timeUp', { name: this.seats[place]?.name ?? ref('err.aPlayer') }) })
    this.sendSteps(duel.surrender(place, ref('log.timeout')))
  }

  /** Temps restant à l'équipe dont on attend la réponse. */
  private timeLeft(): { seat: Seat; ms: number } | null {
    return this.clock ? { seat: this.clock.place % 2 === 0 ? 0 : 1, ms: Math.max(0, this.clock.deadline - Date.now()) } : null
  }

  /** Envoie chaque lot d'animations, dans l'ordre, avec la vue de chaque joueur. */
  private sendSteps(steps: Step[]): void {
    // Défi : la partie peut se terminer ici, sur la vue publique du dernier lot.
    const duel = this.duel
    const last = steps.at(-1)
    if (duel && last && !duel.finished && this.settings.challenge !== 'none') {
      const won = evaluateChallenge(last.watch.view, this.settings)
      if (won) steps = [...steps, ...duel.conclude(won.winner, won.reason)]
    }
    const names = this.names()
    const players = this.players()
    const connected = this.connected()
    this.armClock(steps.some((step) => step.events.some((e) => e.length > 0)))
    const timer = this.timeLeft()
    for (const step of steps) {
      this.recording?.record(step)
      this.seats.forEach((s, place) => {
        const view = step.views[place]
        const events = step.events[place] ?? []
        if (!view || !s?.session) return
        // Tant qu'un joueur hésite (choix d'une zone, d'un Tribut...), rien ne change pour les autres :
        // ils ne reçoivent rien, et voient seulement qu'il réfléchit.
        const key = JSON.stringify(view)
        if (!events.length && this.lastSent.get(place) === key) return
        this.lastSent.set(place, key)
        s.session.send({ t: 'state', view, events, names, players, connected, timer, matchId: this.recording?.replay.id })
      })
      // Les spectateurs reçoivent la même suite d'animations, privée de ce qui est réservé à un joueur.
      if (this.spectators.length || this.ext.onPublicState) {
        const key = JSON.stringify(step.watch.view)
        if (step.watch.events.length || this.lastWatch !== key) {
          this.lastWatch = key
          if (this.mode === 'aivai' && step.watch.events.length) this.hostIdle = false
          for (const w of this.spectators) w.send({ t: 'state', view: step.watch.view, events: step.watch.events, names, players, connected, timer, matchId: this.recording?.replay.id })
          this.ext.onPublicState?.({ t: 'state', view: step.watch.view, events: step.watch.events, names, players, connected, timer })
        }
      }
    }
    if (this.duel?.finished && !this.reported) this.report()
    this.scheduleBot()
  }

  /** Ce qui caractérise la partie, pour la comprendre et la rejouer. */
  private metaFor(first: Seat): DuelMeta {
    const f = this.ext.formats?.info(this.settings.format)
    const s = this.settings
    const t = this.ext.tournament
    return {
      mode: this.mode,
      format: { id: s.format, status: f?.status ?? 'ready', region: f?.region ?? null, version: f?.version ?? null },
      challenge: s.challenge,
      handicap: s.handicap,
      theme: s.theme,
      settings: { turnTime: s.turnTime, startLp: s.startLp, startHand: s.startHand, drawPerTurn: s.drawPerTurn, first: String(s.first), shuffle: s.shuffle },
      first,
      ...(t ? { tournament: { id: t.id, name: t.name, round: t.round } } : {}),
    }
  }

  /** Le duel est terminé : on le transmet à l'historique (et au tournoi, le cas échéant). */
  private report(): void {
    const duel = this.duel
    const recording = this.recording
    if (!duel || !recording || duel.winner === null || this.reported || !recording.replay.meta) return
    this.reported = true
    const winner: Seat | 'draw' = duel.winner
    const t = this.ext.tournament
    const result: DuelResult = {
      id: recording.replay.id,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      mode: this.mode,
      meta: recording.replay.meta,
      winner,
      players: this.seats.flatMap((s, place) => (s ? [{ place, team: (place % 2) as Seat, userId: s.session?.user?.id ?? (this.isTournament ? s.session?.guestUser?.id ?? null : null), name: s.name, bot: s.bot !== null, deckName: this.deckNames[place] ?? '', result: winner === 'draw' ? ('draw' as const) : winner === place % 2 ? ('win' as const) : ('loss' as const) }] : [])),
      record: duel.exportRecord(),
      ...(t ? { tournament: { id: t.id, matchId: t.matchId } } : {}),
    }
    try {
      this.ext.onFinished?.(result)
    } catch (e) {
      console.error('[historique]', e)
    }
  }

  /** Un duel automatisé que quelqu'un regarde reprend le rythme d'un duel entre ordinateurs en direct. */
  private watched = false

  setWatched(watched: boolean): void {
    this.watched = watched
    if (watched) this.scheduleBot()
  }

  /** Si c'est à l'ordinateur de répondre, il réfléchit, puis répond (pas avant un court délai). */
  private scheduleBot(): void {
    clearTimeout(this.botTimer)
    const waiting = this.duel?.waiting
    const bot = waiting ? this.seats[waiting.seat]?.bot : null
    if (!this.duel || !waiting || !bot || this.thinking === waiting.prompt.id) return
    const quick = waiting.prompt.kind === 'chain' || this.botAttempts > 0
    // La réflexion commence aussitôt ; la réponse attend que les animations aient eu le temps de se jouer.
    this.botTimer = setTimeout(() => void this.playBot(waiting.seat, bot, Date.now() + (this.ext.automated && !this.watched ? 0 : quick ? BOT_PASS_DELAY : this.mode === 'aivai' ? WATCH_DELAY : BOT_DELAY)), 0)
  }

  private async playBot(seat: number, bot: Computer, notBefore: number): Promise<void> {
    const duel = this.duel
    const waiting = duel?.waiting
    if (!duel || !waiting || waiting.seat !== seat) return
    const id = waiting.prompt.id
    this.thinking = id
    try {
      const refusedBefore = duel.refused
      const value = await bot.choose(duel, seat, this.botAttempts)
      const wait = notBefore - Date.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      // IA contre IA : on laisse l'écran du spectateur finir de jouer ce qu'il a reçu (animations) avant de poursuivre.
      await this.hostCaughtUp()
      // Pendant la réflexion, la partie a pu s'arrêter (abandon, départ d'un joueur) : on ne répond plus.
      if (this.duel !== duel || duel.waiting?.seat !== seat || duel.waiting.prompt.id !== id) return
      // Aucune réponse acceptable : l'ordinateur abandonne plutôt que de bloquer la partie.
      if (value === undefined) return this.sendSteps(duel.surrender(seat))
      const result = duel.answer(seat, id, value)
      if (typeof result === 'string') {
        this.botAttempts++
        this.thinking = null
        return this.scheduleBot()
      }
      this.botAttempts = duel.refused > refusedBefore ? this.botAttempts + 1 : 0
      this.thinking = null
      this.sendSteps(result)
    } catch (e) {
      console.error(e)
      if (this.duel === duel) this.sendSteps(duel.surrender(seat))
    } finally {
      if (this.thinking === id) this.thinking = null
    }
  }

  /** IA contre IA : rend la main quand l'écran du spectateur est à jour (ou, au pire, après un délai de patience). */
  private async hostCaughtUp(): Promise<void> {
    if (this.mode !== 'aivai' || this.hostIdle || !this.host) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, WATCH_PATIENCE)
      function done(): void {
        clearTimeout(timer)
        resolve()
      }
      this.idleWaiters.push(done)
    })
  }

  private hostIsIdle(): void {
    this.hostIdle = true
    for (const wake of this.idleWaiters.splice(0)) wake()
  }

  /** Réglage d'un ordinateur : son deck (null : au hasard) ou son niveau. */
  private setAi(msg: Extract<ClientMessage, { t: 'aiDeck' | 'aiLevel' }>, from: Session): void {
    const bot = this.seats[msg.seat ?? 1]
    if (this.duel || this.ext.tournament || !bot?.bot) return
    if (msg.t === 'aiDeck') {
      // L'ordinateur peut jouer un deck du jeu ou un deck de celui qui le règle.
      const list = msg.deck === null ? null : (this.pick(from, msg.deck) ?? null)
      if (msg.deck !== null && !list) return
      bot.deck = msg.deck
      bot.list = list
      bot.issue = list ? this.issueOf(list) : null
      // Sans deck choisi : tirage au hasard, éventuellement limité à une série de decks du jeu.
      if (msg.deck === null && msg.series) bot.randomSeries = msg.series
      else delete bot.randomSeries
    } else {
      if (this.mode === 'sandbox') return
      bot.bot.level = msg.level
    }
    this.broadcastLobby()
  }

  /** IA contre IA : les messages de celui qui regarde (il n'a pas de place). */
  private handleHost(msg: ClientMessage): void {
    switch (msg.t) {
      case 'aiDeck':
      case 'aiLevel':
        return this.setAi(msg, this.host as Session)
      case 'settings':
        if (!this.applySettings(msg.settings, this.host ?? undefined)) return
        return this.broadcastLobby()
      case 'ready':
        // « Commencer le duel » (et sa seule annulation possible : rien, le duel part aussitôt).
        if (msg.ready && !this.duel) this.startDuel()
        return
      case 'idle':
        return this.hostIsIdle()
      case 'rematch':
        // Un autre duel entre les mêmes ordinateurs : retour au salon, où l'on peut changer decks et niveaux.
        if (!this.duel?.finished) return
        clearTimeout(this.botTimer)
        clearTimeout(this.clock?.timer)
        this.clock = null
        this.duel.destroy()
        this.duel = null
        this.lastSent.clear()
        this.lastWatch = ''
        this.hostIsIdle()
        return this.broadcastLobby()
    }
  }

  handle(session: Session, msg: ClientMessage): void {
    if (msg.t === 'replay') {
      if (!this.duel?.finished || !this.recording || msg.id !== this.recording.replay.id) return session.send({ t: 'error', message: ref('replay.notAvailable') })
      if (this.seatOf(session) === null && !this.isWatcher(session)) return
      return session.send({ t: 'replay', replay: this.recording.replay })
    }
    if (this.mode === 'aivai' && session === this.host) return this.handleHost(msg)
    const seat = this.seatOf(session)
    const me = seat === null ? null : this.seats[seat]
    if (seat === null || !me) return
    if (this.toss) {
      const toss = this.toss
      // Pierre-feuille-ciseaux : seul le représentant de l'équipe joue sa carte.
      if (msg.t === 'rps' && toss.rps) {
        const team = seat % 2
        if (toss.rps.reps[team] === seat) this.rpsPick(team, msg.hand)
        return
      }
      // Seule compte ensuite la décision du joueur désigné (par la pièce, ou par la manche gagnée).
      if (msg.t === 'toss' && seat === toss.chooser && (toss.kind === 'coin' || toss.rps?.phase === 'won')) this.decideToss(msg.first ? toss.winner : toss.winner === 0 ? 1 : 0)
      return
    }

    switch (msg.t) {
      case 'deck': {
        const list = this.pick(session, msg.deck)
        if (this.duel || !list || this.ext.tournament) return
        me.deck = msg.deck
        me.list = list
        me.issue = this.issueOf(list)
        me.ready = false
        if (!me.issue) this.ext.onDeckChosen?.(session, this.settings.format, msg.deck)
        return this.broadcastLobby()
      }
      case 'aiDeck':
      case 'aiLevel':
        return this.setAi(msg, session)
      case 'seat':
        // Changer de place (donc d'équipe) tant que le duel n'a pas commencé.
        if (this.duel || this.ext.tournament || this.seats[msg.seat] !== null || msg.seat >= this.seats.length) return
        this.seats[seat] = null
        this.seats[msg.seat] = me
        me.ready = false
        return this.broadcastLobby()
      case 'bot':
        if (this.duel || this.mode !== 'team' || msg.seat >= this.seats.length) return
        if (msg.add && this.seats[msg.seat] === null) this.seats[msg.seat] = this.botSeat()
        else if (!msg.add && this.seats[msg.seat]?.bot) this.seats[msg.seat] = null
        return this.broadcastLobby()
      case 'settings':
        // Un réglage modifié demande à chacun de se redéclarer prêt.
        if (!this.applySettings(msg.settings, session)) return
        for (const s of this.seats) if (s && !s.bot) s.ready = false
        return this.broadcastLobby()
      case 'ready':
        if (this.duel) return
        if (!me.deck) return session.send({ t: 'error', message: ref('err.pickDeck') })
        if (msg.ready) {
          // Le deck a pu être modifié ou supprimé depuis le choix : on le relit, puis on le confronte aux règles de la salle.
          const list = this.pick(session, me.deck)
          if (!list) {
            me.deck = null
            me.list = null
            me.issue = null
            this.broadcastLobby()
            return session.send({ t: 'error', message: ref('err.deckGone') })
          }
          me.list = list
          me.issue = this.issueOf(list)
          if (me.issue) {
            this.broadcastLobby()
            return session.send({ t: 'error', message: me.issue })
          }
        }
        me.ready = msg.ready
        this.broadcastLobby()
        if (this.seats.every((s) => s?.ready)) this.startDuel()
        return
      case 'rematch':
        if (!this.duel?.finished) return session.send({ t: 'error', message: ref('err.notOver') })
        // Un match de tournoi ne se rejoue pas : le résultat est enregistré.
        if (this.ext.tournament) return session.send({ t: 'error', message: ref('err.tournamentNoRematch') })
        clearTimeout(this.botTimer)
        clearTimeout(this.clock?.timer)
        this.clock = null
        this.duel.destroy()
        this.duel = null
        // Les spectateurs reviennent à la liste des salles : la prochaine partie est une autre partie.
        for (const w of this.spectators) {
          w.room = null
          w.send({ t: 'home' })
        }
        this.spectators = []
        for (const s of this.seats) if (s && !s.bot) s.ready = false
        return this.broadcastLobby()
      case 'surrender':
        if (this.duel && !this.duel.finished) this.sendSteps(this.duel.surrender(seat))
        return
      case 'consoleNavigate': {
        if (this.mode !== 'sandbox' || !this.duel) return
        const result = this.duel.navigateConsole(seat, msg.id, msg.destination)
        if (typeof result === 'string') return session.send({ t: 'error', message: result })
        return this.sendSteps(result)
      }
      case 'undo': {
        if (!this.duel) return
        const result = this.duel.undo(seat)
        if (typeof result === 'string') return session.send({ t: 'error', message: result })
        return this.sendSteps(result)
      }
      case 'answer': {
        if (!this.duel) return
        try {
          const result = this.duel.answer(seat, msg.id, msg.value)
          if (typeof result === 'string') return session.send({ t: 'error', message: result })
          return this.sendSteps(result)
        } catch (e) {
          // Erreur inattendue du moteur : on ne laisse pas les joueurs bloqués.
          console.error(e)
          for (const s of this.humans) s.send({ t: 'error', message: ref('err.engine') })
          return this.close('closed')
        }
      }
    }
  }
}
