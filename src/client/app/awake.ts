// Écran allumé pendant le salon, un duel ou un replay : le téléphone ne se met pas en veille au milieu d'une partie.
// Le verrou natif (Screen Wake Lock) n'existe qu'en HTTPS ou sur localhost ; le jeu est servi en HTTP sur le réseau
// local, d'où le repli principal : une vidéo noire et muette de 4 s (2,5 Ko) lue en boucle, que le système
// considère comme une lecture en cours.

const VIDEO_URL = new URL('../assets/keep-awake.mp4', import.meta.url).href

let wanted = false
let lock: WakeLockSentinel | null = null
let video: HTMLVideoElement | null = null
let listening = false

function player(): HTMLVideoElement {
  if (video) return video
  const v = document.createElement('video')
  v.src = VIDEO_URL
  v.muted = true
  v.defaultMuted = true
  v.loop = true
  v.playsInline = true
  v.preload = 'auto'
  v.disablePictureInPicture = true
  v.disableRemotePlayback = true
  // iOS exige les attributs eux-mêmes pour une lecture muette dans la page.
  for (const name of ['muted', 'playsinline', 'webkit-playsinline']) v.setAttribute(name, '')
  v.setAttribute('aria-hidden', 'true')
  v.tabIndex = -1
  // Dans la fenêtre (une vidéo hors écran peut être suspendue), mais invisible et sans gêner les gestes.
  v.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:-1'
  document.body.append(v)
  video = v
  return v
}

async function acquire(): Promise<void> {
  if (!wanted || document.hidden) return
  if ('wakeLock' in navigator && window.isSecureContext) {
    try {
      if (!lock || lock.released) lock = await navigator.wakeLock.request('screen')
      if (!wanted) void release()
      return
    } catch { /* refusé (batterie faible, réglage) : la vidéo prend le relais */ }
  }
  const v = player()
  // La lecture muette démarre en général seule ; sinon le prochain toucher la relance (voir retry).
  if (v.paused) await v.play().catch(() => undefined)
}

async function release(): Promise<void> {
  const held = lock
  lock = null
  if (held && !held.released) await held.release().catch(() => undefined)
  video?.pause()
}

/** Un navigateur qui refuse la lecture sans geste l'accepte au premier toucher ou à la première touche. */
const retry = (): void => { if (wanted && !document.hidden && (lock?.released ?? true) && video?.paused !== false) void acquire() }

function listen(): void {
  if (listening) return
  listening = true
  // Le verrou et la vidéo tombent quand l'onglet est caché : les reprendre au retour.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void acquire() })
  addEventListener('pointerdown', retry, { capture: true, passive: true })
  addEventListener('keydown', retry, { capture: true, passive: true })
}

/** Demande (ou relâche) l'écran allumé. Sans effet si l'état ne change pas. */
export function keepAwake(on: boolean): void {
  if (on === wanted) return
  wanted = on
  if (on) { listen(); void acquire() }
  else void release()
}
