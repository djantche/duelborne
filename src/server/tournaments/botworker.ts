// Thread de travail des duels entre ordinateurs d'un tournoi solo. Le moteur et la réflexion de l'IA occupent un cœur à plein
// régime pendant des dizaines de secondes : dans le processus principal, ils ralentiraient les duels et les écrans des joueurs.
// Ici, le même moteur, les mêmes salles et la même IA jouent un vrai duel ; la vue publique est diffusée et le résultat est renvoyé.
import { parentPort } from 'node:worker_threads'
import { FormatCatalog } from '../formats/catalog.ts'
import { loadData } from '../ocg/data.ts'
import { Room } from '../room.ts'
import type { DuelResult, RoomTournament } from '../room.ts'
import type { ServerMessage } from '../../shared/protocol.ts'

export type WorkerRequest = { t: 'run'; job: number; spec: RoomTournament } | { t: 'cancel'; job: number } | { t: 'watched'; job: number; watched: boolean }
export type WorkerReply = { t: 'ready' } | { t: 'finished'; job: number; result: DuelResult } | { t: 'failed'; job: number; reason: string } | { t: 'public'; job: number; state: Extract<ServerMessage, { t: 'state' }> }

const port = parentPort
if (port) {
  loadData()
  const formats = new FormatCatalog().load()
  const reply = (m: WorkerReply): void => port.postMessage(m)
  let current: { job: number; room: Room } | null = null

  port.on('message', (m: WorkerRequest) => {
    if (m.t === 'cancel') {
      if (current?.job === m.job) current.room.close()
      return
    }
    if (m.t === 'watched') return void (current?.job === m.job && current.room.setWatched(m.watched))
    const job = m.job
    const fail = (reason: string): void => {
      reply({ t: 'failed', job, reason })
      // Laisser le traitement de la dernière réponse se terminer avant de détruire le moteur.
      setImmediate(() => current?.job === job && current.room.close())
    }
    try {
      const room = new Room('lan', new Map(), () => { if (current?.job === job) current = null }, {
        formats, tournament: m.spec, automated: true,
        onPublicState: (state) => reply({ t: 'public', job, state }),
        onStartFailed: () => fail('start'),
        onFinished: (result) => {
          reply({ t: 'finished', job, result })
          setImmediate(() => current?.job === job && current.room.close())
        },
      })
      current = { job, room }
      if (!room.startAutomatedTournament()) fail('start')
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    }
  })
  reply({ t: 'ready' })
}
