// Relais de la vue publique d'un duel de worker. Il ne diffuse ni Decks ni vues privées, et n'accepte aucune action de jeu.
import { DEFAULT_SETTINGS } from '../../shared/protocol.ts'
import type { ClientMessage, RoomInfo, ServerMessage } from '../../shared/protocol.ts'
import type { RoomTournament } from '../room.ts'
import type { Session, SessionRoom } from '../session.ts'

type PublicState = Extract<ServerMessage, { t: 'state' }>

export class TournamentSpectators implements SessionRoom {
  private readonly viewers = new Set<Session>()
  private readonly lobby: RoomInfo
  private readonly onViewers: (count: number) => void
  private last: PublicState | null = null
  private closed = false

  constructor(spec: RoomTournament, onViewers: (count: number) => void = () => {}) {
    this.onViewers = onViewers
    this.lobby = {
      id: spec.matchId, mode: 'lan', you: -1, settings: { ...DEFAULT_SETTINGS, ...spec.settings },
      seats: spec.players.map((_, i) => ({ name: spec.names?.[i] ?? '', deck: null, deckInfo: null, legal: true, ready: true, connected: true, bot: true, level: spec.bots?.[i] ?? undefined })),
      tournament: { id: spec.id, name: spec.name, round: spec.round },
    }
  }

  get watchable(): boolean { return !this.closed && !!this.last && this.last.view.winner === null }

  push(state: PublicState): void {
    if (this.closed) return
    const log = [...(this.last?.view.log ?? [])]
    const offset = state.view.logOffset ?? 0
    log.splice(offset, Math.max(0, log.length - offset), ...state.view.log)
    this.last = { ...state, events: [], view: { ...state.view, log, logOffset: 0, unknownCards: { ...this.last?.view.unknownCards, ...state.view.unknownCards }, prompt: null, watching: true, spectating: true } }
    for (const viewer of this.viewers) viewer.send(state)
  }

  watch(session: Session): boolean {
    if (!this.watchable) return false
    this.viewers.add(session)
    session.room = this
    this.sync(session)
    this.onViewers(this.viewers.size)
    return true
  }

  sync(session: Session): void {
    if (!this.viewers.has(session) || !this.last) return
    session.send({ ...this.last, room: this.lobby })
  }

  resync(): void { /* Les ordinateurs continuent même si un spectateur perd sa connexion. */ }
  isWatcher(session: Session): boolean { return this.viewers.has(session) }
  handle(_session: Session, _msg: ClientMessage): void { /* Consultation uniquement. */ }
  kickOther(_session: Session, _place?: number): void { /* Aucune place de joueur dans ce relais. */ }

  remove(session: Session, reason?: 'kicked' | 'reset' | 'closed'): void {
    if (!this.viewers.delete(session)) return
    session.room = null
    session.send({ t: 'home', ...(reason ? { reason } : {}) })
    this.onViewers(this.viewers.size)
  }

  close(): void {
    this.closed = true
    for (const viewer of this.viewers) this.remove(viewer)
  }
}
