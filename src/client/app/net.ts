// Connexion au serveur : une seule WebSocket, reconnexion automatique.
import type { ClientMessage, ServerMessage } from '../../shared/protocol.ts'
import { saved, savedAvatar, store } from './store.ts'
import { redraw, toast } from './render.ts'
import { t } from '../i18n.ts'
import { guestKey } from './guest.ts'

let ws: WebSocket | null = null

export function send(m: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
  else if (m.t === 'replay') { store.replaySavingId = null; toast(t('ui.offline')) }
}

export function connect(onMessage: (m: ServerMessage) => void): void {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  ws = socket
  // Le jeton permet au serveur de retrouver la session (et le duel en cours) après une coupure.
  socket.onopen = () => { if (ws !== socket) return; store.connection = 'online'; send({ t: 'hello', name: saved.get('name') ?? 'Joueur', token: saved.get('token') ?? undefined, auth: saved.get('auth') ?? undefined, guest: guestKey(), avatar: savedAvatar() }); redraw() }
  socket.onmessage = (ev) => { if (ws === socket) onMessage(JSON.parse(ev.data as string) as ServerMessage) }
  socket.onclose = () => {
    if (ws !== socket) return
    store.connection = 'offline'
    store.replaySavingId = null
    redraw()
    setTimeout(() => connect(onMessage), 1500)
  }
}
