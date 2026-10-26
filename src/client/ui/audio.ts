// Sons du jeu : bruitages et musiques de data/sounds/ (téléchargés par `npm run fetch-sounds`).
// Tout est facultatif : un fichier absent ou un navigateur qui refuse de jouer le son ne gêne jamais la partie.
import { saved } from '../app/store.ts'

export type Sfx =
  | 'activate' | 'addcounter' | 'attack' | 'banished' | 'button' | 'carddrop' | 'cardpick' | 'chain' | 'coinflip' | 'damage' | 'destroyed'
  | 'diceroll' | 'directattack' | 'draw' | 'equip' | 'flip' | 'flip2' | 'gainlp' | 'info' | 'menu' | 'nextturn' | 'phase' | 'playerenter'
  | 'question' | 'removecounter' | 'reveal' | 'set' | 'shuffle' | 'specialsummon' | 'summon' | 'target' | 'token'

/** Ambiances : une musique pour les menus (accueil, salon, pile ou face), une pour le duel. */
export type Scene = 'menu' | 'duel' | 'none'

/** Musique en fond, discrète : elle accompagne, elle ne couvre ni les bruitages ni la réflexion. */
const MUSIC_VOLUME = 0.2
const SFX_VOLUME = 0.7
/** Pistes possibles par ambiance. Une seule est tirée à l'entrée dans l'ambiance, puis elle tourne en boucle. */
const TRACKS: Record<Scene, string[]> = {
  menu: ['menu'],
  duel: ['duel1', 'duel2', 'duel3'],
  none: [],
}

const prefs = { music: saved.get('music') !== 'off', sfx: saved.get('sfx') !== 'off' }

let ctx: AudioContext | null = null
let unlocked = false
const buffers = new Map<string, Promise<AudioBuffer | null>>()
const lastPlayed = new Map<string, number>()
const chants = new Set<HTMLAudioElement>()

export function stopSummonChants(): void {
  for (const audio of chants) { audio.pause(); audio.removeAttribute('src'); audio.load() }
  chants.clear()
}

/** Voix ou cri facultatif par carte ; respecte les mêmes réglages que les bruitages. */
export function summonChant(url: string, isCurrent?: () => boolean): () => void {
  if (!prefs.sfx || !unlocked || document.hidden || isCurrent?.() === false) return () => {}
  const audio = new Audio(url)
  const stop = (): void => { audio.pause(); audio.removeAttribute('src'); audio.load(); chants.delete(audio) }
  audio.volume = SFX_VOLUME
  chants.add(audio)
  audio.addEventListener('ended', stop, { once: true })
  audio.addEventListener('error', stop, { once: true })
  void audio.play().then(() => { if (!prefs.sfx || document.hidden || isCurrent?.() === false) stop() }, stop)
  return stop
}

/** Les navigateurs ne jouent aucun son avant un geste de l'utilisateur : on attend le premier. */
function unlock(): void {
  if (unlocked) return
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    unlocked = true
  } catch {
    return
  }
  syncMusic()
}
for (const type of ['pointerdown', 'keydown'] as const) addEventListener(type, unlock, { capture: true })

// ───────────────────────────── Bruitages ─────────────────────────────

function load(name: string): Promise<AudioBuffer | null> {
  let hit = buffers.get(name)
  if (!hit) {
    hit = (async () => {
      try {
        const res = await fetch(`/data/sounds/sfx/${name}.wav`)
        if (!res.ok || !ctx) return null
        return await ctx.decodeAudioData(await res.arrayBuffer())
      } catch {
        return null
      }
    })()
    buffers.set(name, hit)
  }
  return hit
}

/** Joue un bruitage. `gap` : délai minimal (ms) entre deux lectures du même son, pour ne pas les empiler. */
export function sfx(name: Sfx, opts: { volume?: number; gap?: number; rate?: number } = {}): void {
  if (!prefs.sfx || !unlocked || !ctx || document.hidden) return
  const now = performance.now()
  if (now - (lastPlayed.get(name) ?? -1e9) < (opts.gap ?? 70)) return
  lastPlayed.set(name, now)
  void load(name).then((buffer) => {
    if (!buffer || !ctx) return
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    source.buffer = buffer
    source.playbackRate.value = opts.rate ?? 1
    gain.gain.value = SFX_VOLUME * (opts.volume ?? 1)
    source.connect(gain).connect(ctx.destination)
    source.start()
  })
}

// ───────────────────────────── Musiques ─────────────────────────────

let scene: Scene = 'none'
/** Piste de l'ambiance en cours : choisie une fois, gardée jusqu'au changement d'ambiance (toute la partie, pour un duel). */
let sceneTrack = ''
let track: HTMLAudioElement | null = null
/** Jingle de fin de duel : tant qu'il est là, la musique ne reprend pas. */
let jingle = false

function fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void): void {
  const from = el.volume
  const start = performance.now()
  const tick = (): void => {
    const t = Math.min(1, (performance.now() - start) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * t))
    if (t < 1) setTimeout(tick, 40)
    else then?.()
  }
  tick()
}

function stopTrack(): void {
  const old = track
  track = null
  if (old) fade(old, 0, 700, () => old.pause())
}

/** Lance une piste (arrêt en fondu de la précédente). */
function playTrack(key: string, loop: boolean): void {
  const old = track
  const el = new Audio(`/data/sounds/bgm/${key}.mp3`)
  el.loop = loop
  el.volume = 0
  track = el
  if (old) fade(old, 0, 700, () => old.pause())
  el.addEventListener('error', () => {
    if (track === el) track = null
  })
  void el.play().then(
    () => fade(el, MUSIC_VOLUME, 1200),
    () => {
      /* lecture refusée : elle sera retentée au prochain geste */
      if (track === el) track = null
    },
  )
}

function syncMusic(): void {
  if (!unlocked) return
  if (!prefs.music || document.hidden) {
    if (track) stopTrack()
    return
  }
  if (!track && !jingle && sceneTrack) playTrack(sceneTrack, true)
}

document.addEventListener('visibilitychange', () => { if (document.hidden) stopSummonChants(); syncMusic() })

/**
 * Change d'ambiance. La piste est tirée au sort à ce moment-là et tourne ensuite en boucle :
 * une partie garde la même musique du début à la fin.
 */
export function setScene(next: Scene): void {
  if (next === scene) return
  stopSummonChants()
  scene = next
  const pool = TRACKS[next]
  sceneTrack = pool[Math.floor(Math.random() * pool.length)] ?? ''
  jingle = false
  if (track) stopTrack()
  syncMusic()
}

/** Jingle de victoire ou de défaite, une seule fois ; la musique du duel s'arrête là. */
export function endJingle(kind: 'win' | 'lose'): void {
  if (!unlocked || !prefs.music || jingle) return
  jingle = true
  playTrack(kind, false)
}

// ───────────────────────────── Réglages ─────────────────────────────

export const audioPrefs = (): { music: boolean; sfx: boolean } => ({ ...prefs })

export function setMusic(on: boolean): void {
  prefs.music = on
  saved.set('music', on ? 'on' : 'off')
  syncMusic()
}

export function setSfx(on: boolean): void {
  prefs.sfx = on
  if (!on) stopSummonChants()
  saved.set('sfx', on ? 'on' : 'off')
}
