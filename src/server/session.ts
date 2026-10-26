import type { WebSocket } from 'ws'
import type { ServerMessage } from '../shared/protocol.ts'
import type { Room } from './room.ts'
import type { UserRecord } from './store/types.ts'

/** Salle jouée localement ou relais de consultation d'un duel entre ordinateurs. */
export type SessionRoom = Pick<Room, 'sync' | 'resync' | 'remove' | 'isWatcher' | 'handle' | 'kickOther'>

/**
 * Un joueur connecté. La session survit à une coupure de connexion (le jeton permet de la reprendre).
 * Elle est un invité tant qu'aucun compte n'y est attaché ; `user` vient toujours du serveur (jeton de connexion vérifié),
 * jamais d'un identifiant envoyé par le client.
 */
export class Session {
  readonly token: string
  name: string
  /** Carte dont l'illustration sert d'avatar (choisie sur l'appareil, ou gardée sur le profil du compte). */
  avatar: number | null = null
  admin: boolean
  /** Le compte connecté sur cette session, ou null pour un invité. */
  user: UserRecord | null = null
  /** Participant invité, séparé du compte et sans droits sur les routes d’authentification. */
  guestUser: UserRecord | null = null
  guestKey: string | undefined
  get actor(): UserRecord | null { return this.user ?? this.guestUser }
  get participantId(): string | null { return this.actor?.id ?? null }
  /** Empreinte du jeton de connexion utilisé (pour couper cette session si elle est révoquée). */
  authHash: string | null = null
  ws: WebSocket | null = null
  room: SessionRoom | null = null
  /** Abandon automatique si le joueur ne revient pas après une déconnexion en plein duel. */
  dropTimer: ReturnType<typeof setTimeout> | undefined

  constructor(token: string, name: string, admin: boolean) {
    this.token = token
    this.name = name
    this.admin = admin
  }

  send(msg: ServerMessage): void {
    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg))
  }
}
