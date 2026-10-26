// Une carte soulevée peut survivre aux reconstructions du terrain sans refaire son entrée.
import { cardDom } from '../../ui/Card.tsx'
import type { ClientCard } from '../../ui/cardview.ts'
import { cardAngle, centerOf, node, play, reducedMotion, settle, uprightRect } from './anim.ts'
import { CHAIN_MOTION } from './chainMotion.ts'

interface Source {
  card: HTMLElement
  placeholder: HTMLElement
  style: string | null
  angle: number
  area: string
  side: string
  back: { children: Node[]; cardId: string | null; addedFrame: string | null; restore: boolean } | null
}

export interface EffectPose {
  x: number
  y: number
  scale: number
  scaleY?: number
  angle?: number
  opacity?: number
}

const WIDTH = 206
const HEIGHT = 300
const app = document.getElementById('app') as HTMLElement

export class FloatingEffectCard {
  readonly el: HTMLElement
  readonly uid: number | null
  private face: HTMLElement
  private source: Source | null = null
  private masked: { card: HTMLElement; visibility: string } | null = null
  private disposed = false
  private referenceOnly = false
  private anchor: ReturnType<FloatingEffectCard["snapshot"]> = null

  constructor(data: ClientCard, uid: number | null, side: string, onClick: (ev: MouseEvent) => void) {
    this.uid = uid
    this.el = node(`ghost chain-effect ${side}`, `left:0;top:0;width:${WIDTH}px;height:${HEIGHT}px;opacity:0;z-index:24;`)
    this.face = cardDom(data, { size: 'md', ...(uid === null ? {} : { uid, side }) })
    this.el.append(this.face)
    this.el.addEventListener('click', (ev) => {
      if ((ev.target as Element).closest('.card')) onClick(ev)
      else this.face.click()
    })
    this.el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return
      ev.preventDefault()
      this.face.click()
    })
    this.el.tabIndex = 0
    this.el.setAttribute('role', 'button')
    this.face.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transform:none;'
  }

  /** Le Cimetière garde sa carte ; seules les identités annoncées par le moteur sont montrées. */
  boardCard(): HTMLElement | null {
    return this.uid === null ? null : app.querySelector<HTMLElement>(`.card[data-uid="${this.uid}"]`)
  }

  takeSource(revealOnReturn = false): boolean {
    if (this.disposed || this.source || this.referenceOnly) return false
    const card = this.boardCard()
    if (!card || card.dataset.area === 'gy' || getComputedStyle(card).visibility === 'hidden') return false
    const angle = cardAngle(card)
    const placeholder = document.createElement('div')
    placeholder.style.cssText = `width:${card.offsetWidth}px;height:${card.offsetHeight}px;transform:${getComputedStyle(card).transform};flex:none;pointer-events:none;`
    placeholder.setAttribute('aria-hidden', 'true')
    this.source = { card, placeholder, style: card.getAttribute('style'), angle, area: card.dataset.area ?? '', side: card.dataset.side ?? '', back: null }
    card.replaceWith(placeholder)
    this.anchor = this.snapshot()
    this.el.classList.add("local-effect")
    // Un dos de l'ancien état devient public à l'activation. Le même élément reçoit son recto.
    if (card.classList.contains('back')) {
      const frame = [...this.face.classList].find((cls) => cls.startsWith('frame-'))
      this.source.back = { children: [...card.childNodes], cardId: card.getAttribute('data-card'), addedFrame: frame && !card.classList.contains(frame) ? frame : null, restore: !revealOnReturn || card.dataset.area === 'hand' }
      card.replaceChildren(...[...this.face.childNodes].map((child) => child.cloneNode(true)))
      card.classList.remove('back')
      if (frame) card.classList.add(frame)
      card.dataset.card = this.face.dataset.card
    }
    this.face.replaceWith(card)
    this.face = card
    this.face.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;transform:none;visibility:visible;'
    return true
  }

  /** Rendre l'élément à Preact avant un redessin ; le calque conserve sa pose, sans image intermédiaire peinte. */
  releaseSource(): void {
    const source = this.source
    if (!source) return
    this.source = null
    const copy = this.face.cloneNode(true) as HTMLElement
    settle(source.card)
    this.face.replaceWith(copy)
    this.face = copy
    if (source.back?.restore) {
      source.card.replaceChildren(...source.back.children)
      source.card.classList.add('back')
      if (source.back.addedFrame) source.card.classList.remove(source.back.addedFrame)
      if (source.back.cardId === null) source.card.removeAttribute('data-card')
      else source.card.setAttribute('data-card', source.back.cardId)
    }
    if (source.style === null) source.card.removeAttribute('style')
    else source.card.setAttribute('style', source.style)
    source.placeholder.replaceWith(source.card)
    this.unmask()
    this.masked = { card: source.card, visibility: source.card.style.visibility }
    source.card.style.visibility = 'hidden'
  }

  useImage(): void {
    this.releaseSource()
    this.unmask()
    this.referenceOnly = true
    this.anchor = null
    this.el.classList.remove('local-effect')
  }

  rebind(takeReference = false): void {
    if (takeReference) this.referenceOnly = false
    this.unmask()
    this.takeSource()
  }

  private unmask(): void {
    if (this.masked) this.masked.card.style.visibility = this.masked.visibility
    this.masked = null
  }

  setNegated(negated: boolean): void {
    if (!negated && this.el.classList.contains('negated')) {
      settle(this.face)
      this.face.style.filter = ''
      this.el.querySelector('.negate-sigil')?.remove()
      this.el.classList.remove('negated', 'negation')
    }
  }

  snapshot(): { el: HTMLElement; rect: DOMRect; area: string; side: string; angle: number } | null {
    const source = this.source
    return source ? { el: this.face.cloneNode(true) as HTMLElement, rect: source.placeholder.getBoundingClientRect(), area: source.area, side: source.side, angle: source.angle } : null
  }

  /** Ancrage stable : main ou zone réelle, conservé pendant les reconstructions. */
  restingPlace(): ReturnType<FloatingEffectCard['snapshot']> {
    const snap = this.snapshot()
    if (snap) this.anchor = snap
    return this.anchor
  }

  private transform(pose: EffectPose): string {
    return `translate(${pose.x - WIDTH / 2}px,${pose.y - HEIGHT / 2}px) rotate(${pose.angle ?? 0}deg) scale(${pose.scale},${pose.scaleY ?? pose.scale})`
  }

  async move(pose: EffectPose, duration = 260): Promise<void> {
    if (this.disposed) return
    const from = { transform: getComputedStyle(this.el).transform, opacity: getComputedStyle(this.el).opacity }
    const to = { transform: this.transform(pose), opacity: pose.opacity ?? 1 }
    // Fixer la destination avant WAAPI : aucune ancienne animation ne reprend après une interruption.
    settle(this.el)
    Object.assign(this.el.style, to)
    if (duration > 0) await play(this.el, reducedMotion() ? [{ ...to, opacity: from.opacity }, to] : [from, to], { duration: reducedMotion() ? 100 : duration, easing: 'cubic-bezier(.4,0,.2,1)' })
  }

  async enter(pose: EffectPose): Promise<void> {
    const snap = this.snapshot()
    if (snap) {
      const rect = uprightRect(snap.rect, snap.angle)
      const origin = centerOf(rect)
      this.el.style.transform = `translate(${origin.x - WIDTH / 2}px,${origin.y - HEIGHT / 2}px) rotate(${snap.angle > 180 ? snap.angle - 360 : snap.angle}deg) scale(${rect.width / WIDTH},${rect.height / HEIGHT})`
      this.el.style.opacity = '1'
    } else {
      this.el.style.transform = this.transform(pose)
    }
    await this.move(pose, CHAIN_MOTION.enter)
  }

  async leave(keepReference = false): Promise<void> {
    if (this.disposed) return
    const snap = this.snapshot()
    if (snap && !reducedMotion()) {
      const rect = uprightRect(snap.rect, snap.angle)
      const end = centerOf(rect)
      const from = { transform: getComputedStyle(this.el).transform, opacity: getComputedStyle(this.el).opacity }
      const to = { transform: `translate(${end.x - WIDTH / 2}px,${end.y - HEIGHT / 2}px) rotate(${snap.angle > 180 ? snap.angle - 360 : snap.angle}deg) scale(${rect.width / WIDTH},${rect.height / HEIGHT})`, opacity: 1 }
      settle(this.el)
      Object.assign(this.el.style, to)
      await play(this.el, [from, to], { duration: CHAIN_MOTION.leave, easing: 'cubic-bezier(.4,0,.2,1)' })
    } else {
      await play(this.el, [{ opacity: getComputedStyle(this.el).opacity }, { opacity: 0 }], { duration: 180 })
    }
    if (keepReference && !this.disposed) {
      this.releaseSource()
      this.unmask()
      this.referenceOnly = true
    } else this.dispose()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const animation of this.el.getAnimations({ subtree: true })) animation.cancel()
    this.releaseSource()
    this.unmask()
    this.el.remove()
  }
}
