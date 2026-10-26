// Le décor se rétracte avant la propagation du suivant ; aucune carte n'est copiée.
import { getPlaybackRate, reducedMotion, sleep } from './anim.ts'
import type { DuelView, GameEvent } from '../../../shared/protocol.ts'
import { duel } from './state.ts'

type Side = 'me' | 'foe'
type Rect = { left: number; top: number; width: number; height: number }
/** Un décor présenté : à qui il appartient, quelle carte, son image et sa place sur le tapis (tout le tapis ou une moitié). */
type Art = Rect & { side: Side; id: string; image: string; mask: string }
interface FieldFrame { key: string; width: number; height: number; arts: Art[]; zones: Record<Side, Rect | null> }
let generation = 0
const layers = new Set<HTMLElement>()

/** Le décor est une présentation : une carte Terrain face recto peut encore attendre sa résolution. */
export function prepareFieldPresentation(view: DuelView, events: GameEvent[], animated: boolean): void {
  const keyOf = (v: DuelView): string => [v.you, v.you === 0 ? 1 : 0].map((seat) => {
    const field = v.players[seat as 0 | 1].fieldZone
    return field?.faceUp ? field.card.cardId ?? 0 : 0
  }).join(':')
  const next = keyOf(view)
  if (!animated) { duel.fieldCard = next; return }
  duel.fieldCard ??= duel.view ? keyOf(duel.view) : '0:0'
  if (next === duel.fieldCard) return
  // Pendant l'activation et les réponses, le fond précédent reste réellement affiché, même si le plateau est redessiné.
  const resolved = events.some((event) => event.type === 'chainResolve')
  if (view.chain.length || !resolved && events.some((event) => event.type === 'chain')) return
  const idle = view.prompt?.kind === 'idle' || view.prompt?.kind === 'battle'
  const previous = duel.fieldCard.split(':')
  const appearing = next.split(':').some((id, index) => id !== '0' && id !== previous[index])
  if (appearing && !resolved && !idle) return
  duel.fieldCard = next
}

function offset(el: HTMLElement, mat: HTMLElement): [number, number] {
  let x = 0, y = 0
  for (let at: HTMLElement | null = el; at && at !== mat; at = at.offsetParent as HTMLElement | null) { x += at.offsetLeft; y += at.offsetTop }
  return [x, y]
}

export function fieldBeforeDraw(): FieldFrame | null {
  const mat = document.getElementById('mat')
  if (!mat) return null
  const key = mat.dataset.field ?? '0:0'
  const [mine = '0', theirs = '0'] = key.split(':')
  const arts: Art[] = []
  for (const el of [mat, ...mat.querySelectorAll<HTMLElement>('.half')]) {
    if (!el.classList.contains('has-field') && !el.classList.contains('has-art')) continue
    const style = getComputedStyle(el, '::before')
    const [x, y] = offset(el, mat)
    const left = parseFloat(style.left) || 0, top = parseFloat(style.top) || 0
    // Un décor qui couvre tout le tapis appartient au seul joueur qui a une Magie Terrain.
    const side: Side = el === mat ? (mine !== '0' ? 'me' : 'foe') : el.classList.contains('me') ? 'me' : 'foe'
    arts.push({ side, id: side === 'me' ? mine : theirs, image: style.background, mask: style.maskImage, left: x + left, top: y + top, width: el.offsetWidth - left - (parseFloat(style.right) || 0), height: el.offsetHeight - top - (parseFloat(style.bottom) || 0) })
  }
  const zone = (side: Side): Rect | null => {
    const el = mat.querySelector<HTMLElement>(`.half.${side} [data-zk$=":s:5"]`)
    if (!el) return null
    const [x, y] = offset(el, mat)
    return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight }
  }
  return { key, arts, width: mat.offsetWidth, height: mat.offsetHeight, zones: { me: zone('me'), foe: zone('foe') } }
}

/** Un décor dans son propre calque : on anime sa boîte (l'image recadrée suit) et sa découpe. */
function decorate(art: Art, mat: HTMLElement, z: number): { layer: HTMLElement; piece: HTMLElement } {
  const layer = document.createElement('div')
  layer.className = 'field-transition-layer'
  layer.setAttribute('aria-hidden', 'true')
  layer.style.zIndex = String(z)
  const piece = document.createElement('div')
  Object.assign(piece.style, { position: 'absolute', background: art.image, maskImage: art.mask, opacity: '.78', filter: 'saturate(1.25) contrast(1.05)', borderRadius: '16px' })
  place(piece, art)
  layer.append(piece)
  mat.prepend(layer)
  layers.add(layer)
  return { layer, piece }
}

function place(el: HTMLElement, r: Rect): void {
  Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
}

const mix = (a: Rect, b: Rect, p: number): Rect => ({ left: a.left + (b.left - a.left) * p, top: a.top + (b.top - a.top) * p, width: a.width + (b.width - a.width) * p, height: a.height + (b.height - a.height) * p })
const same = (a: Rect, b: Rect): boolean => Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) < 2
const ease = (p: number): number => 1 - (1 - p) ** 3
const centre = (r: Rect | null, frame: FieldFrame): [number, number] => r ? [r.left + r.width / 2, r.top + r.height / 2] : [frame.width / 2, frame.height / 2]

/**
 * Installe les calques immédiatement ; le vol de la carte peut se terminer avant de lancer les animations.
 * Chaque côté est traité à part : un décor qui reste se rétracte vers sa moitié (ou s'étend à tout le tapis), un décor
 * remplacé ou détruit se replie dans sa zone Terrain, un nouveau décor se déploie en cercle depuis la sienne.
 */
export function fieldAfterDraw(before: FieldFrame | null): () => Promise<void> {
  const after = fieldBeforeDraw(), mat = document.getElementById('mat')
  if (!before || !after || !mat || before.key === after.key || reducedMotion()) return async () => {}
  const run = ++generation
  for (const layer of layers) layer.remove()
  layers.clear()
  const steps: ((p: number) => void)[] = []
  const reveals: ((p: number) => void)[] = []
  const radius = Math.hypot(after.width, after.height)
  for (const side of ['foe', 'me'] as const) {
    const b = before.arts.find((art) => art.side === side)
    const a = after.arts.find((art) => art.side === side)
    if (b && a && b.id === a.id) {
      // Même carte : sa boîte glisse de l'ancienne place à la nouvelle (régression vers sa moitié ou extension).
      const { piece } = decorate(b, mat, 0)
      if (!same(b, a)) steps.push((p) => place(piece, mix(b, a, ease(p))))
      continue
    }
    if (b) {
      // Carte partie ou remplacée : le décor se replie dans sa zone Terrain en s'effaçant.
      const { piece } = decorate(b, mat, 0)
      const zone = before.zones[side] ?? { ...b, width: 0, height: 0 }
      steps.push((p) => { place(piece, mix(b, zone, ease(p))); piece.style.opacity = String(0.78 * (1 - p)) })
    }
    if (a) {
      const { layer } = decorate(a, mat, 1)
      const [x, y] = centre(after.zones[side], after)
      const clip = (size: number): void => { layer.style.clipPath = `circle(${size}px at ${x}px ${y}px)` }
      clip(0)
      reveals.push((p) => clip(radius * ease(p)))
    }
  }
  mat.classList.add('field-transitioning')
  const animate = (duration: number, list: ((p: number) => void)[]): Promise<void> => !list.length ? Promise.resolve() : new Promise((resolve) => {
    const start = performance.now()
    const tick = (time: number): void => {
      if (run !== generation || !mat.isConnected || document.hidden) { resolve(); return }
      const p = Math.min(1, (time - start) * getPlaybackRate() / duration)
      for (const step of list) step(p)
      if (p === 1) resolve(); else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return async () => {
    try {
      if (run !== generation || !mat.isConnected) return
      // L'ancien décor cède d'abord la place, puis le nouveau se déploie en chevauchant la fin du mouvement.
      const moving = animate(700, steps)
      if (steps.length && reveals.length) await sleep(260)
      await Promise.all([moving, animate(900, reveals)])
    } finally {
      for (const layer of [...layers]) { layer.remove(); layers.delete(layer) }
      if (run === generation) mat.classList.remove('field-transitioning')
    }
  }
}

export function resetFieldTransition(): void {
  generation++
  for (const layer of layers) { layer.parentElement?.classList.remove('field-transitioning'); layer.remove() }
  layers.clear()
}
