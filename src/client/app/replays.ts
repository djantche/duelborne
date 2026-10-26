// Archives locales dans IndexedDB : les matchs ne sont pas limités aux quelques Mo de localStorage.
import type { DuelMeta } from '../../shared/formats.ts'
import type { MatchReplay, ReplayDeck } from '../../shared/replay.ts'
import type { Winner } from '../../shared/protocol.ts'
import { parseReplay } from '../../shared/replay.ts'
import { send } from './net.ts'
import { redraw, toast } from './render.ts'
import { store } from './store.ts'
import { duel } from '../screens/duel/state.ts'
import { t } from '../i18n.ts'

export interface ReplaySummary {
  id: string; names: string[]; createdAt: number; duration: number; turns: number; frames: number; winner: Winner
  decks?: ReplayDeck[]
  art?: [number | null, number | null]
  /** Format, défi, thème et tournoi de la partie (absent des archives faites avant son ajout). */
  meta?: DuelMeta
  presentationVersion?: 2
}

function summarize(replay: MatchReplay): ReplaySummary {
  const last = replay.frames.at(-1)!.view
  const art: [number | null, number | null] = [null, null]
  const score = [-Infinity, -Infinity]
  // Anciennes archives : choisir un monstre révélé sur chaque terrain, jamais une carte cachée.
  for (const frame of replay.frames) {
    for (const seat of [0, 1] as const) {
      for (const zone of frame.view.players[seat].monsters) {
        if (zone?.faceUp && zone.card.cardId !== null && (zone.atk ?? 0) > score[seat]!) {
          art[seat] = zone.card.cardId
          score[seat] = zone.atk ?? 0
        }
      }
    }
  }
  for (const seat of [0, 1] as const) art[seat] = replay.decks?.find((d) => d.seat === seat && d.cover)?.cover ?? art[seat]
  return { id: replay.id, names: replay.names, createdAt: replay.createdAt, duration: replay.duration, turns: last.turn, frames: replay.frames.length, winner: last.winner, decks: replay.decks, art, ...(replay.meta ? { meta: replay.meta } : {}), presentationVersion: 2 }
}
let database: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  return database ??= new Promise((resolve, reject) => {
    // Nom d'avant Duelborne, gardé : changer de base ferait disparaître la bibliothèque des joueurs.
    const request = indexedDB.open('duel-lan-replays', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('matches', { keyPath: 'id' }); request.result.createObjectStore('index', { keyPath: 'id' }) }
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null }; resolve(request.result) }
    request.onerror = () => { database = null; reject(request.error) }
    request.onblocked = () => { database = null; reject(new Error('Archive database blocked')) }
  })
}
const requested = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
const committed = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error) })

export async function saveReplay(replay: MatchReplay): Promise<void> {
  const summary = summarize(replay)
  const transaction = (await db()).transaction(['matches', 'index'], 'readwrite')
  const done = committed(transaction)
  transaction.objectStore('matches').put(replay)
  transaction.objectStore('index').put(summary)
  await done
  store.replaySavedIds.add(replay.id)
  store.replayRevision++
  redraw()
}
export async function listReplays(): Promise<ReplaySummary[]> {
  const database = await db()
  const list = await requested(database.transaction('index').objectStore('index').getAll()) as ReplaySummary[]
  const outdated = list.filter((m) => m.presentationVersion !== 2)
  if (outdated.length) {
    // Enrichir une seule fois l'index existant : les visites suivantes ne chargent pas les matchs.
    const enriched = new Map<string, ReplaySummary>()
    // Un match à la fois pour ne pas garder toutes les grosses archives en mémoire.
    for (const m of outdated) {
      const replay = await requested(database.transaction('matches').objectStore('matches').get(m.id)) as MatchReplay | undefined
      if (!replay) continue
      const summary = summarize(replay)
      enriched.set(m.id, summary)
      const transaction = database.transaction('index', 'readwrite')
      const done = committed(transaction)
      const index = transaction.objectStore('index')
      const request = index.get(m.id)
      request.onsuccess = () => { if (request.result && request.result.presentationVersion !== 2) index.put(summary) }
      await done
    }
    return list.map((m) => enriched.get(m.id) ?? m).sort((a, b) => b.createdAt - a.createdAt)
  }
  return list.sort((a, b) => b.createdAt - a.createdAt)
}
export async function readReplay(id: string): Promise<MatchReplay | undefined> {
  return requested((await db()).transaction('matches').objectStore('matches').get(id)) as Promise<MatchReplay | undefined>
}
export async function deleteReplay(id: string): Promise<void> {
  const tx = (await db()).transaction(['matches', 'index'], 'readwrite')
  const done = committed(tx)
  tx.objectStore('matches').delete(id)
  tx.objectStore('index').delete(id)
  await done
  store.replaySavedIds.delete(id)
  store.replayRevision++
  redraw()
}
export function downloadReplay(replay: MatchReplay): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(replay)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `duel-${new Date(replay.createdAt).toISOString().slice(0,10)}-${replay.id.slice(0,8)}.duel-replay.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function requestReplay(): void {
  const id = duel.matchId
  if (!id || store.replaySavingId || store.replaySavedIds.has(id)) return
  store.replaySavingId = id
  send({ t: 'replay', id })
  redraw()
}
export async function receiveReplay(data: MatchReplay): Promise<void> {
  try {
    const replay = parseReplay(JSON.stringify(data))
    if (!replay) throw new Error('Invalid replay')
    await saveReplay(replay)
    toast(t('replay.saved'))
  } catch { toast(t('replay.saveFailed')) }
  finally { store.replaySavingId = null; redraw() }
}
