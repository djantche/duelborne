// L'entrechoc de deux cartes de pierre-feuille-ciseaux : elles se retournent, se jettent l'une sur l'autre, et à l'impact
// la carte perdante est détruite (éclats, onde de choc) pendant que la gagnante tient bon ; une égalité les fait
// rebondir dans une onde de choc. Sert à l'écran d'avant-duel comme aux cartes qui font jouer pierre-feuille-ciseaux.
import type { Hand } from '../../../shared/protocol.ts'
import { rpsWinner } from '../../../shared/rps.ts'
import { sfx } from '../../ui/audio.ts'
import { rpsCardEl } from '../../ui/rps.tsx'
import { EASE_IN, EASE_OUT, cracks, centerOf, crush, debris, flash, hitFlash, impact, node, pillar, play, ring, screenPunch, shake, shockwave, slash, sleep, smoke, sparks, stamp, vortex } from './anim.ts'
import type { Pt } from './anim.ts'

/** Retourne une carte face visible (la face est une classe : les copies de la carte, comme les éclats, la gardent). */
export async function flipUp(card: HTMLElement): Promise<void> {
  const inner = card.querySelector<HTMLElement>('.rps-flip')
  card.classList.add('up')
  if (inner) await play(inner, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 480, easing: 'cubic-bezier(.4,0,.2,1)' })
}

export interface ClashOptions {
  /** a gagne, b gagne, ou égalité. */
  outcome: 'a' | 'b' | 'draw'
  /** Les cartes qui sont encore face cachée se retournent. */
  flipA: boolean
  flipB: boolean
  /** Texte tamponné à l'impact d'une égalité. */
  drawText: string
  /** L'élément qui tremble au choc (le plateau, l'écran de tirage...). */
  shaker?: Element | null
}

const at = (c: Pt, dx: number, dy: number, rot: number, scale: number): string => `translate(${c.x + dx}px,${c.y + dy}px) rotate(${rot}deg) scale(${scale})`

/** Couleur du type de chaque main : orange pour la Pierre (monstre), vert pour la Feuille (Magie), violet pour les Ciseaux (Piège). */
const AURA: Record<string, string> = { '0': '#ff9a3c', '1': '#2fe0b0', '2': '#ff5ad0' }
const auraOf = (card: HTMLElement): string => AURA[card.dataset.hand ?? ''] ?? '#ffd76a'

/** Un éclair qui crépite entre deux points (égalité : les deux cartes se repoussent). */
function bolt(a: Pt, b: Pt, color: string, duration = 460): void {
  const n = 10
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n
    const off = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 34
    return `${a.x + dx * k + (-dy / len) * off},${a.y + dy * k + (dx / len) * off}`
  }).join(' ')
  const el = node('fx-bolt', `left:0;top:0;width:100vw;height:100vh;filter:drop-shadow(0 0 6px ${color}) drop-shadow(0 0 14px ${color});`, `<svg width="100%" height="100%"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pts}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`)
  void play(el, [{ opacity: 1 }, { opacity: 0.15, offset: 0.25 }, { opacity: 1, offset: 0.45 }, { opacity: 0.3, offset: 0.7 }, { opacity: 0 }], { duration, easing: 'linear' }).then(() => el.remove())
}

/** Des rayons de lumière qui tournent derrière la carte gagnante. */
function rays(c: Pt, color: string, size: number): void {
  const el = node('fx-rays', `left:${c.x - size / 2}px;top:${c.y - size / 2}px;width:${size}px;height:${size}px;--aura:${color};`)
  void play(el, [{ transform: 'rotate(0deg) scale(0.4)', opacity: 0 }, { transform: 'rotate(50deg) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'rotate(150deg) scale(1.08)', opacity: 0 }], { duration: 1800, easing: 'ease-out' }).then(() => el.remove())
}

/** Une carte se montre : elle se retourne (si besoin), un reflet la balaie, un éclair et des éclats de sa couleur. */
async function reveal(card: HTMLElement, delay: number, flip: boolean): Promise<void> {
  if (delay) await sleep(delay)
  if (flip) await flipUp(card)
  card.classList.add('glint')
  const r = card.getBoundingClientRect()
  const c = centerOf(r)
  const color = auraOf(card)
  flash(c, color, r.width * 2.4, 460)
  ring(c, color, r.width * 1.9, 560)
  sparks(c, color, 12, 0.8)
}

/** Joue tout l'entrechoc ; les cartes `a` (à gauche) et `b` (à droite) y restent, la perdante effacée. */
export async function clash(a: HTMLElement, b: HTMLElement, o: ClashOptions): Promise<void> {
  // L'écran de manche (avant le duel) est au-dessus du calque d'effets : le temps du choc, les effets passent devant.
  document.body.classList.add('fx-over-ui')
  try {
    await clashIn(a, b, o)
  } finally {
    document.body.classList.remove('fx-over-ui')
  }
}

async function clashIn(a: HTMLElement, b: HTMLElement, o: ClashOptions): Promise<void> {
  const colA = auraOf(a)
  const colB = auraOf(b)
  // 1. Les cartes se montrent l'une après l'autre, chacune dans la lumière de son type.
  sfx('flip')
  await Promise.all([reveal(a, 0, o.flipA), reveal(b, 190, o.flipB)])
  await sleep(420)

  // 2. Elles se chargent : une aura de leur couleur, des étincelles qui montent.
  sfx('activate', { volume: 0.6 })
  a.classList.add('charging')
  b.classList.add('charging')
  for (let k = 0; k < 4; k++) {
    setTimeout(() => {
      sparks(centerOf(a.getBoundingClientRect()), colA, 6, 0.55)
      sparks(centerOf(b.getBoundingClientRect()), colB, 6, 0.55)
    }, k * 130)
  }
  await sleep(560)

  const ra = a.getBoundingClientRect()
  const rb = b.getBoundingClientRect()
  const ca = centerOf(ra)
  const cb = centerOf(rb)
  const mid: Pt = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 }
  // Les cartes se touchent au milieu : chacune parcourt la moitié de l'écart, moins l'épaisseur du contact.
  const dir = ca.x <= cb.x ? 1 : -1
  const reach = Math.max(0, Math.abs(cb.x - ca.x) / 2 - ra.width * 0.44)
  const goA = { x: dir * reach, y: mid.y - ca.y }
  const goB = { x: -dir * reach, y: mid.y - cb.y }
  const origin: Pt = { x: 0, y: 0 }

  // 3. Elles reculent pour prendre leur élan, puis se jettent l'une sur l'autre.
  sfx('cardpick')
  const back = (c: HTMLElement, d: number): Animation => c.animate([{ transform: 'none' }, { transform: at(origin, -d * 30, -6, -d * 7, 1.06) }], { duration: 300, easing: EASE_OUT, fill: 'forwards' })
  await Promise.all([back(a, dir), back(b, -dir)].map((w) => w.finished.catch(() => undefined)))
  const charge = (c: HTMLElement, d: number, go: Pt): Promise<void> => play(c, [{ transform: at(origin, -d * 30, -6, -d * 7, 1.06) }, { transform: at(go, 0, 0, d * 4, 1.12) }], { duration: 200, easing: EASE_IN, fill: 'forwards' })
  await Promise.all([charge(a, dir, goA), charge(b, -dir, goB)])
  a.classList.remove('charging')
  b.classList.remove('charging')

  // 4. Le choc : les deux couleurs s'entrechoquent.
  const hit = mid
  sfx('attack')
  hitFlash(1.3)
  screenPunch(1.7)
  if (o.shaker) shake(o.shaker, 16)
  impact(hit, { color: o.outcome === 'draw' ? '#bfe6ff' : o.outcome === 'a' ? colA : colB, power: 1.5 })
  flash(hit, colA, ra.width * 3, 460)
  flash(hit, colB, ra.width * 3, 460)
  shockwave(hit, colA, 460, 640)
  shockwave(hit, colB, 580, 780)
  slash(hit, 38, ra.width * 2.8, colA)
  slash(hit, -38, ra.width * 2.8, colB)
  const stay = (go: Pt, d: number): string => at(go, 0, 0, d * 4, 1.12)

  if (o.outcome === 'draw') {
    // Égalité : aucune ne cède. Des éclairs crépitent entre elles, puis elles rebondissent dans une onde de choc.
    bolt({ x: ca.x + goA.x, y: hit.y - ra.height * 0.2 }, { x: cb.x + goB.x, y: hit.y + ra.height * 0.15 }, '#bfe6ff')
    setTimeout(() => bolt({ x: ca.x + goA.x, y: hit.y + ra.height * 0.25 }, { x: cb.x + goB.x, y: hit.y - ra.height * 0.1 }, '#e9ecff', 380), 160)
    shockwave(hit, '#bfe6ff', 620, 820)
    ring(hit, '#e9ecff', 440, 720)
    cracks(hit, 320, '#e9ecff')
    smoke(hit, 7, 120)
    void stamp(hit, o.drawText, 'tie', 1.15)
    const recoil = (c: HTMLElement, d: number, go: Pt): Promise<void> => play(c, [{ transform: stay(go, d) }, { transform: at(go, -d * 80, -10, -d * 16, 1.04), offset: 0.42 }, { transform: at(origin, 0, 0, 0, 1) }], { duration: 950, easing: EASE_OUT, fill: 'forwards' })
    await Promise.all([recoil(a, dir, goA), recoil(b, -dir, goB)])
    return
  }

  // Victoire : la gagnante transperce la perdante, qui éclate ; une colonne de lumière et des rayons couronnent la gagnante.
  const win = o.outcome === 'a' ? a : b
  const lose = o.outcome === 'a' ? b : a
  const wd = o.outcome === 'a' ? dir : -dir
  const wgo = o.outcome === 'a' ? goA : goB
  const lgo = o.outcome === 'a' ? goB : goA
  const colW = auraOf(win)
  const colL = auraOf(lose)
  sfx('destroyed')
  const loserAt = centerOf(lose.getBoundingClientRect())
  const push = play(win, [{ transform: stay(wgo, wd) }, { transform: at(wgo, wd * 26, -4, wd * 6, 1.2), offset: 0.25 }, { transform: at(wgo, -wd * 8, -2, 0, 1.18), offset: 0.6 }, { transform: at(wgo, -wd * 10, 0, 0, 1.15) }], { duration: 720, easing: EASE_OUT, fill: 'forwards' })
  win.classList.add('winner')
  const wc = centerOf(win.getBoundingClientRect())
  rays(wc, colW, ra.width * 3.4)
  pillar({ x: wc.x, y: win.getBoundingClientRect().bottom }, colW)
  ring(wc, '#ffd76a', ra.width * 2.2, 700)
  sparks(hit, '#ffe9a8', 22, 1.2)
  await crush(lose)
  debris(loserAt, colL, 22, 1.3)
  sparks(loserAt, colL, 18, 1.1)
  vortex(loserAt, colL, ra.width * 1.8, 700)
  lose.classList.add('lost')
  await Promise.all([push, play(lose, [{ transform: stay(lgo, -wd), opacity: 1, filter: 'brightness(1.8)' }, { transform: at(lgo, wd * 50, 34, wd * 34, 0.45), opacity: 0, filter: 'brightness(0.4) saturate(0)' }], { duration: 500, easing: 'ease-in', fill: 'forwards' })])
}

/** Verdict d'une manche vu de `you` (la carte de gauche est la sienne). */
export const verdictOf = (mine: Hand, theirs: Hand): ClashOptions['outcome'] => {
  const w = rpsWinner(mine, theirs)
  return w === null ? 'draw' : w
}

/**
 * Un pierre-feuille-ciseaux joué par une carte, en plein duel : un voile sombre, les deux cartes face cachée, puis
 * l'entrechoc. Rend la main quand tout est fini.
 */
export async function showdown(mine: Hand, theirs: Hand, names: { me: string; foe: string; draw: string }, arena: Element | null): Promise<void> {
  const veil = node('fx-clash', '', `<div class="fx-clash-row"><div class="fx-clash-side"><span>${names.me}</span></div><div class="fx-clash-side"><span>${names.foe}</span></div></div>`)
  const sides = [...veil.querySelectorAll<HTMLElement>('.fx-clash-side')]
  const a = rpsCardEl(mine, { side: 'me' })
  const b = rpsCardEl(theirs, { side: 'foe' })
  sides[0]?.prepend(a)
  sides[1]?.prepend(b)
  await play(veil, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: 'forwards' })
  await clash(a, b, { outcome: verdictOf(mine, theirs), flipA: true, flipB: true, drawText: names.draw, shaker: arena })
  await sleep(900)
  await play(veil, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })
  veil.remove()
}
