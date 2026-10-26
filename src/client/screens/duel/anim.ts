// Primitives d'animation (Web Animations API) et effets visuels, dessinés dans le calque #fx.
// Tout est en coordonnées écran : on part des getBoundingClientRect() des éléments du plateau.
import { flightPath, MOTION } from './motion.ts'
import type { FlightPoint, MotionKind } from './motion.ts'
import type { SummonKind } from '../../../shared/protocol.ts'

export const fx = document.getElementById('fx') as HTMLElement

export interface Pt {
  x: number
  y: number
}

let playbackRate = 1
export const getPlaybackRate = (): number => playbackRate
export const setPlaybackRate = (rate: number): void => { playbackRate = Math.max(.5, Math.min(4, rate)) }
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms / playbackRate))
export const centerOf = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
const rand = (a: number, b: number): number => a + Math.random() * (b - a)

export const EASE_OUT = 'cubic-bezier(.16,.84,.3,1)'
export const EASE_IN = 'cubic-bezier(.6,0,.9,.35)'

/**
 * Joue une animation et attend sa fin. Un délai de garde évite de bloquer la partie si le
 * navigateur suspend les animations (onglet en arrière-plan).
 */
export function play(el: Element, frames: Keyframe[] | PropertyIndexedKeyframes, opts: KeyframeAnimationOptions): Promise<void> {
  // `backwards` applique la première image dès la création : WebKitGTK peut sinon peindre une image à l'état non animé avant le départ.
  opts = { fill: 'backwards', ...opts, duration: Number(opts.duration ?? 0) / playbackRate, delay: Number(opts.delay ?? 0) / playbackRate }
  const total = Number(opts.duration ?? 0) + Number(opts.delay ?? 0)
  const done = el.animate(frames, opts).finished.then(
    () => undefined,
    () => undefined,
  )
  return Promise.race([done, new Promise<void>((resolve) => setTimeout(resolve, total + 300))])
}

/** Annule les animations en cours (utile après un fill: 'forwards'). */
export const settle = (el: Element): void => el.getAnimations().forEach((a) => a.cancel())

/** Deux images laissent la carte réelle se repeindre avant de retirer sa copie animée.
 * Le délai de garde libère aussi la séquence si la WebView est masquée entre les deux images. */
async function painted(): Promise<void> {
  if (document.hidden) return
  await new Promise<void>((resolve) => {
    let first = 0, second = 0
    const done = (): void => { clearTimeout(timeout); cancelAnimationFrame(first); cancelAnimationFrame(second); resolve() }
    const timeout = setTimeout(done, 150)
    first = requestAnimationFrame(() => { second = requestAnimationFrame(done) })
  })
}

/** Le fantôme couvre le premier repeint de la vraie carte, y compris dans WebKitGTK. */
async function restoreCard(card: HTMLElement): Promise<void> {
  card.style.visibility = ''
  if (card.isConnected) await painted()
}

export function node(cls: string, css = '', html = ''): HTMLElement {
  const d = document.createElement('div')
  d.className = cls
  d.style.cssText = css
  d.innerHTML = html
  fx.appendChild(d)
  return d
}

const at = (p: Pt): string => `left:${p.x}px;top:${p.y}px;`

// ───────────────────────────── Clones de cartes ─────────────────────────────

/** Place dans `parent` une copie de `card` à la taille de `rect` (une carte tournée en défense garde son sens). */
function cloneInto(parent: HTMLElement, card: HTMLElement, rect: DOMRect, extra = ''): HTMLElement {
  const rot = card.classList.contains('rot')
  const c = card.cloneNode(true) as HTMLElement
  c.removeAttribute('data-uid')
  c.style.cssText = `position:absolute;left:50%;top:50%;translate:-50% -50%;visibility:visible;width:${rot ? rect.height : rect.width}px;height:${rot ? rect.width : rect.height}px;${extra}`
  parent.appendChild(c)
  return c
}

/**
 * Copie d'une carte placée dans #fx, exactement par-dessus `rect`. Sert aux vols de cartes
 * et aux éclats : l'original peut ainsi être masqué ou déjà remplacé.
 */
export function ghostOf(card: HTMLElement, rect: DOMRect = card.getBoundingClientRect()): HTMLElement {
  const g = node('ghost', `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`)
  cloneInto(g, card, rect)
  return g
}

/**
 * Carte à deux faces : `from` est visible au départ, `to` après un retournement (animer `inner` de 0 à 180° autour de Y).
 * Les deux faces ont la taille et la place de `rect`.
 */
export interface Flipper {
  g: HTMLElement
  inner: HTMLElement
}

export function flipperOf(from: HTMLElement, to: HTMLElement, rect: DOMRect): Flipper {
  const g = node('ghost flipper', `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`)
  const inner = document.createElement('div')
  inner.className = 'flip-inner'
  g.appendChild(inner)
  cloneInto(inner, from, rect, 'backface-visibility:hidden;')
  cloneInto(inner, to, rect, 'backface-visibility:hidden;transform:rotateY(180deg);')
  return { g, inner }
}

/**
 * Atterrissage d'une carte : une onde discrète, un peu de poussière sur le terrain, un léger tassement de la zone.
 * `power` 0 : une pile (Cimetière, Deck…), tout en douceur ; 1 : une zone du terrain, un peu plus ferme.
 */
export function landFx(rect: DOMRect, zone?: Element | null, power = 0): void {
  const c = centerOf(rect)
  const size = Math.max(rect.width, rect.height)
  ring(c, 'rgba(255,255,255,.65)', size * 1.3, 380)
  if (power >= 1) {
    // Deux petits nuages de poussière qui s'écartent au contact.
    for (const dir of [-1, 1]) {
      const d = node('fx-dust', `${at(c)}width:${size * 0.5}px;height:${size * 0.22}px;background:radial-gradient(ellipse, rgba(255,244,214,.7), transparent 70%);`)
      void play(d, [{ transform: `translate(calc(-50% + ${dir * size * 0.2}px),20%) scale(.5)`, opacity: 0.7 }, { transform: `translate(calc(-50% + ${dir * size * 0.55}px),30%) scale(1.15)`, opacity: 0 }], { duration: 460, easing: EASE_OUT }).then(() => d.remove())
    }
    sparks(c, '#fff3c4', 6, 0.45)
  } else sparks(c, '#fff3c4', 4, 0.35)
  if (zone) void play(zone, power >= 1 ? [{ transform: 'scale(1.05)' }, { transform: 'scale(.985)', offset: 0.4 }, { transform: 'none' }] : [{ transform: 'scale(1.035)' }, { transform: 'none' }], { duration: 300, easing: EASE_OUT })
}

/**
 * Vol d'une carte jusqu'à sa place : elle se soulève (son ombre s'éloigne), décrit un arc doux, se retourne en l'air si elle
 * doit changer de face, puis se pose. `g` est posé exactement sur `to` (c'est le point d'arrivée).
 */
export interface FlightOptions {
  duration?: number
  flip?: boolean
  zone?: Element | null
  lift?: number
  impact?: boolean
  motion?: MotionKind
  fromAngle?: number
  toAngle?: number
  trail?: boolean
}

/** Traînée courte derrière la carte : elle suit le même arc et disparaît avant le contact. */
function flightTrail(points: FlightPoint[], to: Pt, color: string, duration: number): void {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${to.x + p.x},${to.y + p.y}`).join(' ')
  const el = node('fx-flight-trail', '', `<svg width="100%" height="100%"><path d="${d}" pathLength="1" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>`)
  const path = el.querySelector('path')!
  void play(path, [
    { strokeDasharray: '0.16 1', strokeDashoffset: '0.16', opacity: 0 },
    { strokeDashoffset: '0', opacity: 0.65, offset: 0.14 },
    { strokeDashoffset: '-0.80', opacity: 0.4, offset: 0.78 },
    { strokeDashoffset: '-1', opacity: 0 },
  ], { duration, easing: 'linear' }).finally(() => el.remove())
}

export async function flyCard(target: HTMLElement | Flipper, from: DOMRect, to: DOMRect, opts: FlightOptions = {}): Promise<void> {
  const g = target instanceof HTMLElement ? target : target.g
  const a = centerOf(from)
  const b = centerOf(to)
  const kind = opts.motion ?? 'transfer'
  const style = MOTION[kind]
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const distance = dist(a, b)
  const lift = reduced ? 0 : Math.min(opts.lift ?? Math.max(26, Math.min(135, distance * style.lift)), Math.max(12, Math.min(a.y, b.y) - to.height * 0.3))
  const duration = reduced ? 120 : (opts.duration ?? style.duration)
  const impact = opts.impact ?? false
  const points = flightPath(a.x - b.x, a.y - b.y, Math.max(from.width, from.height) / Math.max(to.width, to.height, 1), kind, lift, opts.fromAngle, opts.toAngle, impact)
  g.style.perspective = '1100px'
  g.style.setProperty('--flight-color', style.color)
  g.classList.add('in-flight')
  // Un ancien redressement avec fill:forwards ne doit pas reprendre après le vol.
  settle(g)
  if (!reduced && opts.trail !== false && distance > 65) flightTrail(points, b, style.color, duration)
  const frames = points.map((p) => ({
    offset: p.offset,
    transform: `translate(${p.x}px,${p.y}px) scale(${p.scale}) rotate(${p.angle}deg)`,
    filter: `drop-shadow(0 ${Math.round(3 + p.height * 0.32)}px ${Math.round(3 + p.height * 0.22)}px rgba(0,0,0,.42))`,
  }))
  // Le fantôme est posé sur l'arrivée : sans cela, il y apparaît un instant avant de sauter au départ du vol.
  Object.assign(g.style, { transform: frames[0]!.transform, filter: frames[0]!.filter })
  const jobs = [play(g, frames, { duration, easing: 'linear', fill: 'both' })]
  if (opts.flip && !(target instanceof HTMLElement)) {
    jobs.push(play(target.inner, [
      { transform: 'rotateY(0deg)', offset: 0 },
      { transform: 'rotateY(0deg)', offset: 0.12 },
      { transform: 'rotateY(180deg)', offset: 0.72 },
      { transform: 'rotateY(180deg)', offset: 1 },
    ], { duration, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'both' }))
  }
  await Promise.all(jobs)
  if (!reduced) landFx(to, opts.zone, impact ? 1 : 0)
  // Laisser le contact effectivement peint avant de remplacer le fantôme par la vraie carte.
  await sleep(50)
}

/** Orientation visible, y compris l'éventail de la main. */
export function cardAngle(card: HTMLElement): number {
  const base = (card.classList.contains('reversed') ? 180 : 0) + (card.classList.contains('rot') ? 90 : 0)
  const holder = card.closest<HTMLElement>('.hcard')
  if (!holder) return base
  const angle = parseFloat(getComputedStyle(holder).getPropertyValue('--a')) || 0
  return base + (card.dataset.side === 'foe' ? -angle : angle)
}

/** Boîte d'une carte debout, au même centre que sa boîte tournée. */
export function uprightRect(rect: DOMRect, angle: number): DOMRect {
  const radians = angle * Math.PI / 180
  const c = Math.abs(Math.cos(radians))
  const s = Math.abs(Math.sin(radians))
  const det = c * c - s * s
  if (Math.abs(det) < 0.1) return rect
  const w = (rect.width * c - rect.height * s) / det
  const h = (rect.height * c - rect.width * s) / det
  if (w <= 0 || h <= 0) return rect
  return new DOMRect(rect.x + (rect.width - w) / 2, rect.y + (rect.height - h) / 2, w, h)
}

/** Vol entre deux places réelles ; la rotation en défense est intégrée au vol, sans saut à l'arrivée. */
export async function flyTo(card: HTMLElement, from: DOMRect, opts: FlightOptions & { delay?: number; fromEl?: HTMLElement | null; fromFace?: HTMLElement | null; fromBack?: boolean } = {}): Promise<void> {
  const toAngle = cardAngle(card)
  const fromAngle = opts.fromAngle ?? (opts.fromEl ? cardAngle(opts.fromEl) : 0)
  const to = uprightRect(card.getBoundingClientRect(), toAngle)
  const source = uprightRect(from, fromAngle)
  const zone = card.closest('.zone')
  card.style.visibility = 'hidden'
  zone?.classList.add('incoming')
  let target: HTMLElement | Flipper | undefined
  try {
    if (opts.delay) await sleep(opts.delay)
    const startsBack = opts.fromBack ?? opts.fromEl?.classList.contains('back') ?? false
    const endsBack = card.classList.contains('back')
    const flip = startsBack !== endsBack
    const start = startsBack ? backDom() : (opts.fromEl ?? opts.fromFace)
    const end = uprightOf(card)
    target = flip && start ? flipperOf(uprightOf(start), end, to) : ghostOf(end, to)
    await flyCard(target, source, to, { ...opts, fromAngle, toAngle, flip: flip && !(target instanceof HTMLElement), zone })
  } finally {
    zone?.classList.remove('incoming')
    await restoreCard(card)
    if (target) (target instanceof HTMLElement ? target : target.g).remove()
  }
}

/** Copie sans orientation : celle-ci est portée par le fantôme, pas par ses faces. */
export function uprightOf(card: HTMLElement): HTMLElement {
  const copy = card.cloneNode(true) as HTMLElement
  copy.classList.remove('rot', 'reversed')
  return copy
}

/** Retournement complet sur place, avec les deux vraies faces et une légère prise de hauteur. */
export async function turnCard(card: HTMLElement, from: HTMLElement, fromAngle = cardAngle(from)): Promise<void> {
  const toAngle = cardAngle(card)
  const rect = uprightRect(card.getBoundingClientRect(), toAngle)
  const f = flipperOf(uprightOf(from), uprightOf(card), rect)
  card.style.visibility = 'hidden'
  try {
    await Promise.all([
      play(f.g, [
        { transform: `rotate(${fromAngle}deg) scale(1)` },
        { transform: `translateY(-14px) rotate(${(fromAngle + toAngle) / 2}deg) scale(1.12)`, offset: 0.46 },
        { transform: `rotate(${toAngle}deg) scale(1)` },
      ], { duration: 480, easing: 'ease-in-out' }),
      play(f.inner, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 480, easing: 'ease-in-out', fill: 'forwards' }),
    ])
    ring(centerOf(rect), '#9bdcff', Math.max(rect.width, rect.height) * 1.35, 420)
  } finally {
    await restoreCard(card)
    f.g.remove()
  }
}

/** Un dos de carte (pour les retournements). */
export function backDom(): HTMLElement {
  const d = document.createElement('div')
  d.className = 'card sm back'
  d.innerHTML = '<div class="c-back"></div>'
  return d
}

/** Une carte qui quitte le jeu sans autre animation : elle file vers `to` en s'effaçant. */
export async function vanishTo(card: HTMLElement, from: DOMRect, to: Pt): Promise<void> {
  const angle = cardAngle(card)
  const src = uprightRect(from, angle)
  const dst = new DOMRect(to.x - src.width * 0.35, to.y - src.height * 0.35, src.width * 0.7, src.height * 0.7)
  const g = ghostOf(uprightOf(card), dst)
  try {
    await flyCard(g, src, dst, { motion: 'toGrave', fromAngle: angle, toAngle: card.classList.contains('reversed') ? 180 : 0, duration: 460 })
  } finally {
    g.remove()
  }
}

// ───────────────────────────── Effets ─────────────────────────────

/** Sceau dessiné sur le tapis : silhouette distincte pour chaque procédure d'invocation. */
export function summonSeal(p: Pt, size: number, color: string, kind?: SummonKind, duration = 760): void {
  const shapes: Record<SummonKind, string> = {
    fusion: '<ellipse cx="40" cy="50" rx="26" ry="35"/><ellipse cx="60" cy="50" rx="26" ry="35"/>',
    synchro: '<circle cx="50" cy="50" r="28"/><circle cx="50" cy="50" r="20"/><path d="M50 8V28M50 72V92M8 50H28M72 50H92"/>',
    xyz: '<ellipse cx="50" cy="50" rx="40" ry="17"/><ellipse cx="50" cy="50" rx="40" ry="17" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="40" ry="17" transform="rotate(120 50 50)"/>',
    link: '<path d="M50 8L86 29V71L50 92L14 71V29ZM50 8V92M14 29L86 71M14 71L86 29"/>',
    ritual: '<path d="M50 10L74 83L12 37H88L26 83Z"/><circle cx="50" cy="50" r="31"/>',
  }
  const shape = kind ? shapes[kind] : '<path d="M50 17L79 34V66L50 83L21 66V34Z"/>'
  const el = node('fx-summon-seal', `${at(p)}width:${size}px;height:${size}px;color:${color};`, `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.1"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="40" stroke-dasharray="2 4"/>${shape}</svg>`)
  void play(el, [
    { transform: 'translate(-50%,-50%) rotateX(48deg) rotate(-35deg) scale(.3)', opacity: 0 },
    { transform: 'translate(-50%,-50%) rotateX(48deg) rotate(0deg) scale(1)', opacity: 0.85, offset: 0.25 },
    { transform: 'translate(-50%,-50%) rotateX(48deg) rotate(35deg) scale(1.08)', opacity: 0.6, offset: 0.7 },
    { transform: 'translate(-50%,-50%) rotateX(48deg) rotate(50deg) scale(1.22)', opacity: 0 },
  ], { duration, easing: 'ease-out' }).finally(() => el.remove())
}

export function ring(p: Pt, color = '#ffd76a', size = 180, duration = 520): void {
  const r = node('fx-ring', `${at(p)}width:${size}px;height:${size}px;border-color:${color};box-shadow:0 0 24px ${color}, inset 0 0 24px ${color};`)
  void play(r, [{ transform: 'translate(-50%,-50%) scale(.15)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration, easing: EASE_OUT }).then(() => r.remove())
}

export function flash(p: Pt, color = '#fff', size = 260, duration = 380): void {
  const f = node('fx-flash', `${at(p)}width:${size}px;height:${size}px;background:radial-gradient(circle, ${color} 0%, transparent 65%);`)
  void play(f, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0 }], { duration, easing: EASE_OUT }).then(() => f.remove())
}

export function sparks(p: Pt, color = '#ffd76a', count = 16, power = 1): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360 + rand(-12, 12)
    const len = rand(14, 34) * power
    const far = rand(70, 190) * power
    const s = node('fx-spark', `${at(p)}width:${len}px;background:linear-gradient(90deg, transparent, ${color}, #fff);`)
    void play(
      s,
      [
        { transform: `rotate(${angle}deg) translateX(10px) scaleX(1)`, opacity: 1 },
        { transform: `rotate(${angle}deg) translateX(${far}px) scaleX(.2)`, opacity: 0 },
      ],
      { duration: rand(380, 640), easing: EASE_OUT },
    ).then(() => s.remove())
  }
}

/** Trait de coupe lumineux. */
export function slash(p: Pt, angle: number, length = 300, color = '#fff'): void {
  const s = node('fx-slash', `${at(p)}width:${length}px;background:linear-gradient(90deg, transparent, ${color} 35%, #fff 50%, ${color} 65%, transparent);box-shadow:0 0 18px ${color};`)
  void play(
    s,
    [
      { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(0)`, opacity: 1 },
      { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1.1) scaleY(.2)`, opacity: 0 },
    ],
    { duration: 420, easing: EASE_OUT },
  ).then(() => s.remove())
}

/** Onde de choc épaisse qui s'élargit en s'amincissant. */
export function shockwave(p: Pt, color = '#fff3c4', size = 320, duration = 620): void {
  const w = node('fx-wave', `${at(p)}width:${size}px;height:${size}px;border-color:${color};box-shadow:0 0 30px ${color}, inset 0 0 30px ${color};`)
  void play(w, [{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 0.95, borderWidth: '16px' }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0, borderWidth: '1px' }], { duration, easing: EASE_OUT }).then(() => w.remove())
}

/** Éclats solides projetés puis retombant sous l'effet de la pesanteur. */
export function debris(p: Pt, color = '#ffd76a', count = 14, power = 1): void {
  for (let i = 0; i < count; i++) {
    const angle = rand(-Math.PI, 0) + rand(-0.5, 0.5)
    const speed = rand(90, 240) * power
    const dx = Math.cos(angle) * speed
    const up = Math.sin(angle) * speed
    const size = rand(4, 11) * Math.min(power, 1.5)
    const d = node('fx-shard', `${at(p)}width:${size}px;height:${size * rand(0.6, 1.4)}px;background:${i % 3 === 0 ? '#fff' : color};`)
    const fall = rand(40, 120)
    void play(
      d,
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px,${up * 0.8}px) rotate(${rand(-240, 240)}deg)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${dx}px,${up * 0.4 + fall}px) rotate(${rand(-500, 500)}deg)`, opacity: 0 },
      ],
      { duration: rand(600, 980), easing: EASE_OUT },
    ).then(() => d.remove())
  }
}

/** Bouffées de fumée qui montent en se dissipant. */
export function smoke(p: Pt, count = 5, size = 90): void {
  for (let i = 0; i < count; i++) {
    const s = rand(0.7, 1.3) * size
    const m = node('fx-smoke', `${at(p)}width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;`)
    const dx = rand(-60, 60)
    void play(
      m,
      [
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: `translate(${dx * 0.4}px,-18px) scale(.9)`, opacity: 0.7, offset: 0.25 },
        { transform: `translate(${dx}px,${rand(-90, -45)}px) scale(1.6)`, opacity: 0 },
      ],
      { duration: rand(750, 1100), delay: rand(0, 120), easing: EASE_OUT },
    ).then(() => m.remove())
  }
}

/** Fissures qui rayonnent depuis le point d'impact puis s'estompent. */
export function cracks(p: Pt, size = 180, color = '#fff'): void {
  const lines = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + rand(-0.25, 0.25)
    const len = rand(0.45, 1) * 50
    const mx = 50 + Math.cos(a) * len * 0.5 + rand(-4, 4)
    const my = 50 + Math.sin(a) * len * 0.5 + rand(-4, 4)
    return `M50 50 L${mx.toFixed(1)} ${my.toFixed(1)} L${(50 + Math.cos(a) * len).toFixed(1)} ${(50 + Math.sin(a) * len).toFixed(1)}`
  }).join(' ')
  const c = node('fx-crack', `${at(p)}width:${size}px;height:${size}px;`, `<svg viewBox="0 0 100 100"><path d="${lines}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>`)
  void play(c, [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95, offset: 0.2 }, { transform: 'translate(-50%,-50%) scale(1.04)', opacity: 0 }], { duration: 760, easing: EASE_OUT }).then(() => c.remove())
}

/** Coup porté à tout l'écran : le plateau s'enfonce un court instant (zoom) puis revient. */
export function screenPunch(power = 1): void {
  if (reducedMotion()) return
  const app = document.getElementById('app')
  if (app) void play(app, [
    { scale: '1' },
    { scale: String(1 + 0.022 * power), offset: 0.12 },
    { scale: String(1 + 0.018 * power), offset: 0.32 },
    { scale: '1' },
  ], { duration: 360, easing: EASE_OUT })
}

/** Flash blanc sur tout l'écran, bref : le « temps d'arrêt » d'un très gros choc. */
export function hitFlash(power = 1): void {
  if (reducedMotion()) return
  const f = node('fx-hitflash', '')
  void play(f, [{ opacity: Math.min(0.42, 0.22 * power) }, { opacity: 0 }], { duration: 140, easing: 'ease-out' }).then(() => f.remove())
}

/** Silhouette dentelée du choc : les pointes s'étirent dans l'axe de la frappe. Un seul SVG pour tous les rayons. */
function impactBurst(p: Pt, color: string, size: number, angle = 0): void {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = i / 16 * Math.PI * 2
    const reach = (i % 4 === 0 ? 49 : rand(29, 43))
    const x = 50 + Math.cos(a) * reach
    const y = 50 + Math.sin(a) * reach
    const left = `${50 + Math.cos(a - 0.16) * 11},${50 + Math.sin(a - 0.16) * 11}`
    const right = `${50 + Math.cos(a + 0.16) * 11},${50 + Math.sin(a + 0.16) * 11}`
    return `<path d="M${left} L${x},${y} L${right} Z"/>`
  }).join('')
  const burst = node('fx-impact-burst', `${at(p)}width:${size}px;height:${size}px;color:${color};`, `<svg viewBox="0 0 100 100" fill="currentColor">${rays}</svg>`)
  void play(burst, [
    { transform: `translate(-50%,-50%) rotate(${angle}deg) scale(.18,.12)`, opacity: 1 },
    { transform: `translate(-50%,-50%) rotate(${angle}deg) scale(1.18,.78)`, opacity: 1, offset: 0.16 },
    { transform: `translate(-50%,-50%) rotate(${angle}deg) scale(1.35,.92)`, opacity: 0 },
  ], { duration: 330, easing: EASE_OUT }).finally(() => burst.remove())
  const pressure = node('fx-impact-pressure', `${at(p)}width:${size * 0.7}px;height:${size * 0.7}px;`)
  void play(pressure, [
    { transform: 'translate(-50%,-50%) scale(.25)', opacity: 0.8 },
    { transform: 'translate(-50%,-50%) scale(.8)', opacity: 0.65, offset: 0.22 },
    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 },
  ], { duration: 430, easing: EASE_OUT }).finally(() => pressure.remove())
}

/**
 * Impact d'une attaque : éclair, onde de choc, éclats, fissures, fumée, coupes croisées, coup d'écran.
 * `power` (1 = attaque ordinaire) grandit avec les points d'attaque.
 */
export function impact(p: Pt, opts: { color?: string; big?: boolean; power?: number; angle?: number } = {}): void {
  const color = opts.color ?? '#ffb347'
  if (reducedMotion()) { ring(p, color, 100, 180); return }
  const k = Math.min(2.5, (opts.big ? 1.35 : 1) * (opts.power ?? 1))
  const size = Math.min(340 * k, Math.min(innerWidth, innerHeight) * 0.95)
  const angle = opts.angle ?? -32
  impactBurst(p, '#fff3d6', size, angle)
  flash(p, '#fff', size * 0.85, 130)
  flash(p, color, size * 1.2, 460)
  shockwave(p, color, size * 1.35, 480)
  shockwave(p, '#fff3d6', size * 0.9, 300)
  ring(p, color, size, 660)
  sparks(p, color, Math.round(22 * Math.min(k, 1.6)), Math.min(k, 1.8))
  debris(p, color, Math.round(12 * Math.min(k, 1.5)), Math.min(k, 1.6))
  cracks(p, size * 0.58, '#fff')
  slash(p, angle - 35, size * 1.05, color)
  if (opts.big || k > 1.3) slash(p, angle + 42, size, color)
  if (k >= 1.2) smoke(p, 3, 70 * Math.min(k, 1.6))
  screenPunch(k)
  if (k >= 1.5) hitFlash(k)
}

/** Explosion d'une carte détruite : onde, éclats, braises et fumée à l'endroit où elle se tenait. */
export function blast(p: Pt, size = 140, color = '#ffb347', power = 1): void {
  if (reducedMotion()) { ring(p, color, size, 180); return }
  impactBurst(p, color, size * 2.1 * power, -18)
  flash(p, '#fff3c4', size * 1.8, 150)
  shockwave(p, color, size * 2.6 * power, 560)
  debris(p, color, Math.round(12 * power), power)
  smoke(p, 4, size * 0.7)
  sparks(p, '#fff3c4', 12, 0.8 * power)
  cracks(p, size * 1.3 * power, color)
}

/** Colonne de lumière à l'arrivée d'un monstre. */
export function pillar(p: Pt, color = '#ffd76a'): void {
  const el = node('fx-pillar', `${at(p)}background:linear-gradient(0deg, ${color}, transparent);`)
  void play(el, [{ transform: 'translate(-50%,-100%) scaleX(.2)', opacity: 0.9 }, { transform: 'translate(-50%,-100%) scaleX(1.3)', opacity: 0 }], { duration: 620, easing: EASE_OUT }).then(() => el.remove())
}

export function shake(el: Element, power = 8): void {
  if (reducedMotion()) return
  const p = power
  void play(
    el,
    { translate: ['0 0', `${p}px ${-p * 0.6}px`, `${-p}px ${p * 0.5}px`, `${p * 0.6}px ${p * 0.4}px`, `${-p * 0.4}px ${-p * 0.3}px`, '0 0'] },
    { duration: 340, easing: 'linear' },
  )
}

/** Tremblement de tout l'écran : quand le choc mérite d'être ressenti (invocation, atterrissage, grosse frappe). */
export function shakeArena(power = 8): void {
  const app = document.getElementById('app') as HTMLElement | null
  if (app) shake(app, power)
}

/** Voile rouge sur tout l'écran quand on encaisse des dégâts. */
export function vignette(color = 'rgba(255,40,40,.55)'): void {
  const v = node('fx-vignette', `background:radial-gradient(ellipse at center, transparent 45%, ${color} 100%);`)
  void play(v, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' }).then(() => v.remove())
}

/** Tout texte flottant parti vers les LP est enregistré ici : les suivants patientent au lieu de se chevaucher. */
const hpQueues = new Map<HTMLElement, Promise<void>>()

/** Texte flottant (valeurs de combat, dégâts). `to` : destination ; `toEl` : HUD cible (les textes vers un même HUD font la file). */
export async function floatText(p: Pt, html: string, cls: string, opts: { to?: Pt; toEl?: HTMLElement; duration?: number; rise?: number } = {}): Promise<void> {
  const t = node(`fx-text ${cls}`, at(p), html)
  const dx = opts.to ? opts.to.x - p.x : 0
  const dy = opts.to ? opts.to.y - p.y : -(opts.rise ?? 46)
  // Plusieurs textes partent vers le même HUD (LP) : chacun attend son tour, pour une lecture nette.
  const leader = opts.toEl ? (hpQueues.get(opts.toEl) ?? Promise.resolve()) : Promise.resolve()
  const toEl = opts.toEl
  const run = leader.then(() =>
    play(
      t,
      [
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.18)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.28 },
        { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% + ${dy * 0.15}px)) scale(1)`, opacity: 1, offset: 0.7 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${opts.to ? 0.5 : 1})`, opacity: 0 },
      ],
      { duration: opts.duration ?? 1100, easing: 'ease-out' },
    ),
  )
  if (toEl) hpQueues.set(toEl, run.finally(() => hpQueues.delete(toEl)))
  await run
  t.remove()
}

/** Durée de la destruction sur place, avant le trajet de la carte vers sa pile (comprise dans l'estimation des replays). */
export const DESTRUCTION_DURATION = 420

/**
 * Carte détruite : un éclair bref, puis elle se ternit et se rétracte légèrement ; elle reste visible pour son trajet vers sa pile (moveCard).
 * Le choc d'ensemble éventuel est déclenché au pic de l'éclair, une seule fois par groupe.
 */
export async function crush(card: HTMLElement, onBreak?: () => void): Promise<void> {
  if (reducedMotion()) {
    await play(card, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)', offset: 0.35 }, { filter: 'none' }], { duration: 160 })
    return
  }
  const peak = 0.3
  const flash = play(card, [
    { filter: 'brightness(1)', scale: '1' },
    { filter: 'brightness(2.2) saturate(.5) sepia(.35) hue-rotate(-20deg)', scale: '1.05', offset: peak },
    { filter: 'brightness(.55) saturate(.4)', scale: '.94', offset: 0.8 },
    { filter: 'none', scale: '1' },
  ], { duration: DESTRUCTION_DURATION, easing: EASE_OUT })
  await sleep(DESTRUCTION_DURATION * peak)
  if (card.isConnected) onBreak?.()
  await flash
}

/** Tampon : un texte qui s'abat sur la cible (« Annulé », « Défausse »...), un peu de travers, puis s'efface. */
export async function stamp(p: Pt, text: string, cls = 'lose', size = 1): Promise<void> {
  const t = node(`fx-text stamp ${cls}`, `${at(p)}font-size:${Math.round(46 * size)}px;`, text)
  const tilt = rand(-9, -4)
  await play(
    t,
    [
      { transform: `translate(-50%,-50%) rotate(${tilt}deg) scale(2.6)`, opacity: 0 },
      { transform: `translate(-50%,-50%) rotate(${tilt}deg) scale(1)`, opacity: 1, offset: 0.16 },
      { transform: `translate(-50%,-50%) rotate(${tilt}deg) scale(1.04)`, opacity: 1, offset: 0.78 },
      { transform: `translate(-50%,-50%) rotate(${tilt}deg) scale(1.1)`, opacity: 0 },
    ],
    { duration: 1000, easing: 'ease-out' },
  )
  t.remove()
}

/** Faisceau lumineux d'un point à un autre (Équipement, Matériel attaché). */
export async function beam(a: Pt, b: Pt, color = '#ffd76a', duration = 420): Promise<void> {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  const el = node('fx-beam', `${at(a)}width:${dist(a, b)}px;background:linear-gradient(90deg, transparent, ${color}, #fff);box-shadow:0 0 16px ${color};`)
  await play(
    el,
    [
      { transform: `translate(0,-50%) rotate(${angle}deg) scaleX(0)`, transformOrigin: '0 50%', opacity: 1 },
      { transform: `translate(0,-50%) rotate(${angle}deg) scaleX(1)`, transformOrigin: '0 50%', opacity: 1, offset: 0.55 },
      { transform: `translate(0,-50%) rotate(${angle}deg) scaleX(1)`, transformOrigin: '0 50%', opacity: 0 },
    ],
    { duration, easing: EASE_OUT },
  )
  el.remove()
}

/** Vortex qui tourne sur place : Fusion, bannissement. */
export function vortex(p: Pt, color = '#b9a6ff', size = 220, duration = 700): void {
  const el = node('fx-vortex', `${at(p)}width:${size}px;height:${size}px;--vc:${color};`)
  void play(
    el,
    [
      { transform: 'translate(-50%,-50%) rotate(0deg) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%,-50%) rotate(260deg) scale(1)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-50%) rotate(640deg) scale(.1)', opacity: 0 },
    ],
    { duration, easing: 'ease-in-out' },
  ).then(() => el.remove())
}

/**
 * Compteur de LP qui défile jusqu'à `to`. On écrit dans le nœud de texte existant (sans le remplacer) :
 * il appartient à l'interface, qui doit pouvoir continuer à le mettre à jour.
 */
export function countTo(el: HTMLElement, to: number, duration = 650): Promise<void> {
  const from = Number(el.textContent) || 0
  const dur = Math.max(230, duration)
  const start = performance.now()
  const write = (value: number): void => {
    if (el.firstChild) el.firstChild.nodeValue = String(value)
    else el.textContent = String(value)
  }
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      el.style.color = ''
      write(to)
      resolve()
    }
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 2.2 // attaque rapide au début, ralentit près de la cible
      const val = Math.round(from + (to - from) * eased)
      // Le chiffre prend la couleur du sens du changement jusqu'à la fin du décompte.
      el.style.color = val === to ? '' : to > from ? '#6dffb0' : '#ff8576'
      write(val)
      if (t < 1 && !done) requestAnimationFrame(tick)
      else finish()
    }
    requestAnimationFrame(tick)
    setTimeout(finish, dur + 300)
  })
}

// ───────────────────────────── Flèche de visée ─────────────────────────────

const SVG = 'http://www.w3.org/2000/svg'

export interface Arrow {
  aim(to: Pt, locked?: boolean, origin?: Pt): void
  remove(): void
}

/** Flèche courbe lumineuse entre deux points d'ancrage ; l'origine peut être recalée après un redimensionnement. */
export function arrow(from: Pt): Arrow {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'fx-arrow')
  svg.innerHTML = `<path class="glow"/><path class="core"/><polygon class="head"/>`
  fx.appendChild(svg)
  const [glow, core, head] = [...svg.children] as [SVGPathElement, SVGPathElement, SVGPolygonElement]
  return {
    aim(to, locked = false, origin = from) {
      from = origin
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2 - Math.min(90, dist(from, to) * 0.22)
      const d = `M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`
      glow.setAttribute('d', d)
      core.setAttribute('d', d)
      const ang = (Math.atan2(to.y - my, to.x - mx) * 180) / Math.PI
      head.setAttribute('points', '0,0 -26,-12 -20,0 -26,12')
      head.setAttribute('transform', `translate(${to.x},${to.y}) rotate(${ang})`)
      svg.classList.toggle('locked', locked)
    },
    remove: () => svg.remove(),
  }
}

// ───────────────────────────── Bannières ─────────────────────────────

const ui = document.getElementById('ui') as HTMLElement
let bannerChain: Promise<void> = Promise.resolve()
let bannerGeneration = 0
export function resetBanners(): void { bannerGeneration++; bannerChain = Promise.resolve() }

/** Se termine quand tous les bandeaux annoncés sont passés : le joueur n'a la main (effets proposés) qu'ensuite. */
export const bannersDone = (): Promise<void> => bannerChain

/**
 * Bandeau qui traverse l'écran (changement de tour, de phase…). Les bandeaux s'enchaînent sans bloquer le jeu.
 * @param duration durée à l'écran ; les bandeaux de phase, plus fins, passent plus vite
 */
export function banner(title: string, sub = '', cls = '', duration = 1150): void {
  const generation = bannerGeneration
  bannerChain = bannerChain.then(async () => {
    if (generation !== bannerGeneration) return
    const b = document.createElement('div')
    b.className = `banner ${cls}`
    const content = document.createElement('div')
    content.className = 'banner-in'
    const heading = document.createElement('b')
    heading.textContent = title
    content.append(heading)
    if (sub) { const subtitle = document.createElement('span'); subtitle.textContent = sub; content.append(subtitle) }
    b.append(content)
    ui.appendChild(b)
    await play(
      b,
      [
        { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
        { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.22 },
        { clipPath: 'inset(0 0 0 0)', opacity: 1, offset: 0.78 },
        { clipPath: 'inset(0 0 0 100%)', opacity: 1 },
      ],
      { duration, easing: 'ease-in-out' },
    )
    b.remove()
  })
}
