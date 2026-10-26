import type { MatchReplay } from '../../../shared/replay.ts'
import { navigate, onNavigate } from '../../app/navigation.ts'
import { redraw } from '../../app/render.ts'
import { saved, store } from '../../app/store.ts'
import { fromMini } from '../../ui/cardview.ts'
import { setPlaybackRate } from '../duel/anim.ts'
import { interruptPresentation, presentReplayFrame, resetDuel } from '../duel/controller.ts'
import { duel } from '../duel/state.ts'
import { setScene } from '../../ui/audio.ts'
import { ReplayProgress } from './progress.ts'
import { replayTimeline, STEP_GAP_MS } from './timing.ts'

/** `starts[i]` : instant (ms à ×1) où l'action i est atteinte ; la dernière valeur est la durée totale. */
export const playback = { match: null as MatchReplay | null, index: 0, playing: false, speed: 1, starts: [0] as number[], /** Les deux mains sont montrées face recto (choix gardé sur cet appareil). */ showHands: saved.get('replay-hands') === '1' }

/** Ce replay contient-il les mains ? Les archives plus anciennes ne les ont pas. */
export const hasHands = (match: MatchReplay | null = playback.match): boolean => !!match?.frames.some((f) => f.hands)
export const replayProgress = new ReplayProgress()
let run = 0
/** Durées réellement observées, réutilisées à la prochaine ouverture pour une chronologie plus juste. */
let measured: (number | null)[] = []
const SPEEDS = [.5, 1, 2, 4]
/** Retard du terrain sur la barre au-delà duquel les animations accélèrent pour la rattraper. */
const CATCH_UP_MS = 300
// Les anciennes mesures précédaient le soulèvement doux et la pose avant activation.
const timingKey = (id: string): string => `replay-timing-v6-${id}`
const remember = (): void => {
  if (!playback.match) return
  saved.set(`replay-progress-${playback.match.id}`, JSON.stringify({ index: playback.index, speed: playback.speed }))
}
const total = (): number => playback.starts.at(-1) ?? 0
/** Action affichée à l'instant `time` : la dernière déjà atteinte. */
export function frameAt(time: number): number {
  const starts = playback.starts
  let low = 0, high = starts.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (starts[mid]! <= time) low = mid
    else high = mid - 1
  }
  return low
}

function present(index: number, animated: boolean): Promise<void> {
  const match = playback.match
  const frame = match?.frames[index]
  if (!frame || !match) return Promise.resolve()
  playback.index = index
  // Mains dévoilées : on remplace les cartes cachées de chaque main par celles qui ont été enregistrées.
  const players = playback.showHands && frame.hands ? frame.view.players.map((p, s) => ({ ...p, hand: p.hand.map((c, i) => ({ ...c, cardId: frame.hands?.[s]?.[i] ?? c.cardId })) })) : frame.view.players
  return presentReplayFrame({ t: 'state', view: { ...frame.view, players: players as typeof frame.view.players, log: match.log.slice(0, frame.logLength), logOffset: 0, prompt: null, waitingFor: null, watching: true, spectating: true, unknownCards: match.cards }, events: frame.events, names: match.names, ...(match.players ? { players: match.players } : {}), connected: [true, true], timer: null }, animated)
}

/** Montre ou cache les mains des deux joueurs ; l'action affichée est redessinée sur place, sans rejouer son animation. */
export function setShowHands(on: boolean): void {
  playback.showHands = on
  if (on) saved.set('replay-hands', '1')
  else saved.remove('replay-hands')
  if (playback.match) void present(playback.index, false)
}

export function openReplay(match: MatchReplay): void {
  run++
  resetDuel()
  playback.match = match
  playback.playing = false
  playback.index = 0
  playback.speed = 1
  for (const [id, card] of Object.entries(match.cards)) if (!store.cards.has(Number(id))) store.cards.set(Number(id), fromMini(Number(id), card))
  try {
    const list = JSON.parse(saved.get(timingKey(match.id)) ?? '[]') as unknown
    measured = Array.isArray(list) && list.length === match.frames.length ? list.map((n) => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null) : []
  } catch { measured = [] }
  playback.starts = replayTimeline(match, measured)
  replayProgress.setEnd(total())
  try {
    const progress = JSON.parse(saved.get(`replay-progress-${match.id}`) ?? '{}') as { index?: number; speed?: number }
    if (Number.isInteger(progress.index) && progress.index! >= 0 && progress.index! < match.frames.length - 1) playback.index = progress.index!
    if (SPEEDS.includes(progress.speed ?? 0)) playback.speed = progress.speed!
  } catch { /* archive nouvelle ou réglage local ancien */ }
  setPlaybackRate(playback.speed)
  replayProgress.speed(playback.speed)
  replayProgress.set(playback.starts[playback.index]!)
  setScene('duel')
  navigate('replay')
  void present(playback.index, false)
}

export function pauseReplay(): void {
  run++
  playback.playing = false
  replayProgress.pause()
  setPlaybackRate(playback.speed)
  remember()
  redraw()
}

/** Boutons, flèches et choix d'un tour : le terrain change aussitôt, la barre glisse jusqu'à l'action visée. */
export function seekReplay(index: number): void {
  if (!playback.match) return
  const target = Math.max(0, Math.min(playback.match.frames.length - 1, Math.round(index)))
  pauseReplay()
  interruptPresentation()
  void present(target, false)
  replayProgress.glide(playback.starts[target]!)
  remember()
  redraw()
}

/** Curseur tenu sous le pointeur : la position suit la main, le terrain montre l'action atteinte à cet instant. */
export function scrubReplay(time: number): void {
  if (!playback.match) return
  const position = Math.max(0, Math.min(total(), time))
  const target = frameAt(position)
  pauseReplay()
  if (target !== playback.index || duel.busy) {
    interruptPresentation()
    void present(target, false)
  }
  replayProgress.set(position)
  remember()
  redraw()
}

/** Attend que l'horloge atteigne `time` ; faux si la lecture a été interrompue. */
async function until(time: number, token: number): Promise<boolean> {
  while (token === run && replayProgress.value() < time && replayProgress.moving()) {
    const wait = (time - replayProgress.value()) / playback.speed
    await new Promise<void>((resolve) => setTimeout(resolve, Math.max(4, Math.min(wait, 100))))
  }
  return token === run
}

/**
 * Lecture façon lecteur vidéo : l'horloge (et la barre) avance seule à vitesse constante, le terrain la suit.
 * L'action i est jouée dès que l'horloge atteint la fin de l'action précédente ; si le terrain a pris du retard,
 * ses animations accélèrent jusqu'à ×2 pour rattraper, sans jamais arrêter ni faire sauter la barre.
 */
export async function playReplay(): Promise<void> {
  const match = playback.match
  if (!match || playback.playing || duel.busy) return
  const last = match.frames.length - 1
  if (replayProgress.value() >= total() - .5) {
    // Relancer depuis la fin : retour au début, la lecture repart aussitôt.
    pauseReplay()
    interruptPresentation()
    void present(0, false)
    replayProgress.set(0)
  }
  const token = ++run
  playback.playing = true
  redraw()
  // Un glissement demandé juste avant se termine d'abord.
  while (token === run && replayProgress.moving()) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (token !== run) return
  replayProgress.play()
  while (token === run && playback.index < last) {
    const next = playback.index + 1
    const due = playback.starts[playback.index]!
    if (!await until(due, token)) return
    const lag = replayProgress.value() - due
    const boost = lag > CATCH_UP_MS ? Math.min(2, 1 + lag / 2000) : 1
    setPlaybackRate(playback.speed * boost)
    const started = performance.now()
    await present(next, true)
    if (token !== run) return
    // Une action jouée à l'heure, sans accélération, onglet visible, donne une durée réelle pour les prochaines lectures.
    if (boost === 1 && lag < 60 && !document.hidden) measured[next] = Math.round((performance.now() - started) * playback.speed) + STEP_GAP_MS
    remember()
  }
  setPlaybackRate(playback.speed)
  if (!await until(total(), token)) return
  playback.playing = false
  replayProgress.pause()
  saveTimings()
  remember()
  redraw()
}

function saveTimings(): void {
  const match = playback.match
  if (!match || !measured.some((n) => n !== null && n !== undefined)) return
  saved.set(timingKey(match.id), JSON.stringify(Array.from({ length: match.frames.length }, (_, i) => measured[i] ?? null)))
}

export function speedReplay(speed: number): void {
  if (!SPEEDS.includes(speed)) return
  playback.speed = speed
  replayProgress.speed(speed)
  setPlaybackRate(speed)
  remember()
  redraw()
}

export function stopPlayback(returnToLibrary = true): void {
  pauseReplay()
  saveTimings()
  resetDuel()
  playback.match = null
  setPlaybackRate(1)
  if (returnToLibrary) { setScene('menu'); navigate('replays', true) }
}

onNavigate((from, to) => { if (from === 'replay' && to !== 'replay' && playback.match) { stopPlayback(false); if (to !== 'duel') setScene('menu') } })

// Onglet caché : la lecture se met en pause plutôt que de laisser la barre filer sans le terrain.
document.addEventListener('visibilitychange', () => { if (document.hidden && playback.playing) pauseReplay() })

addEventListener('keydown', (event) => {
  if (store.screen !== 'replay' || event.defaultPrevented || duel.viewer || duel.sheet || store.ask || store.menu || (event.target as HTMLElement).closest('input, textarea, select, button, [role="dialog"]')) return
  if (event.code === 'Space') { event.preventDefault(); if (playback.playing) pauseReplay(); else void playReplay() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); seekReplay(playback.index - 1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); seekReplay(playback.index + 1) }
})
