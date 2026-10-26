// Vue d'ordre de la chaîne : références dédiées, sans déplacement des cartes physiques.
import { cardDom } from '../../ui/Card.tsx'
import type { ClientCard } from '../../ui/cardview.ts'
import { node, play, reducedMotion, settle } from './anim.ts'

export class ChainOverview {
  private root: HTMLElement | null = null
  private dim: HTMLElement | null = null
  private signature = ''
  private items = new Map<number, HTMLElement>()
  private revision = 0
  private shown = false

  async show(entries: { index: number; data: ClientCard }[], stage: DOMRect): Promise<void> {
    if (!entries.length) return this.hide()
    entries = entries.slice(0, 3)
    const signature = JSON.stringify([entries.map((entry) => entry.index), stage.x, stage.y, stage.width, stage.height])
    if (this.shown && signature === this.signature) return
    this.signature = signature
    const revision = ++this.revision
    this.dim ??= node('chain-overview-dim')
    this.root ??= node('chain-overview')
    const root = this.root
    root.setAttribute('aria-hidden', 'true')
    root.style.left = `${stage.left + stage.width * .15}px`
    root.style.top = `${stage.top + stage.height * .46}px`
    const units = 1 + 1 / 1.55 + 1 / 1.55 ** 2
    const height = Math.min(350, stage.height * .56, (stage.width * .84 - 128) / units / .686)
    root.style.setProperty('--chain-card-height', `${height}px`)
    const previous = new Map([...this.items].map(([index, el]) => [index, el.getBoundingClientRect()]))
    const indexes = new Set(entries.map((entry) => entry.index))
    const departing = [...this.items].filter(([index]) => !indexes.has(index))
    if (departing.length) {
      root.style.visibility = 'visible'
      root.style.opacity = '1'
      this.dim.style.visibility = 'visible'
      this.dim.style.opacity = '1'
      this.shown = true
      for (const [, el] of departing) el.style.transformOrigin = '50% 50%'
      await Promise.all(departing.map(([, el]) => play(el, [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.65)' },
      ], { duration: reducedMotion() ? 0 : 600, easing: 'cubic-bezier(.55,0,.8,.4)' })))
      if (revision !== this.revision) return
      for (const [index, el] of departing) { el.remove(); this.items.delete(index) }
    }
    const jobs: Promise<unknown>[] = []
    for (const [i, entry] of entries.entries()) {
      let el = this.items.get(entry.index)
      const added = !el
      if (!el) {
        el = document.createElement('div')
        el.className = 'chain-overview-card'
        el.append(cardDom(entry.data, { size: 'lg' }))
        const badge = document.createElement('b')
        badge.className = 'chain-number'
        badge.textContent = String(entry.index)
        el.append(badge)
        this.items.set(entry.index, el)
      }
      root.append(el)
      el.style.setProperty('--chain-card-height', `${height / 1.55 ** i}px`)
      el.style.zIndex = String(4 - i)
      if (added && !reducedMotion()) jobs.push(play(el, [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 720, easing: 'cubic-bezier(.4,0,.2,1)' }))
    }
    if (!this.shown) {
      this.shown = true
      root.style.visibility = 'visible'
      root.style.opacity = '1'
      this.dim.style.visibility = 'visible'
      this.dim.style.opacity = '1'
      jobs.push(play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 0 : 240 }), play(this.dim, [{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 0 : 240 }))
    }
    for (const [index, el] of this.items) {
      const before = previous.get(index)
      if (!before || reducedMotion()) continue
      const after = el.getBoundingClientRect()
      if (Math.abs(before.x - after.x) + Math.abs(before.y - after.y) + Math.abs(before.width - after.width) > 1) jobs.push(play(el, [{ transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width})` }, { transform: 'none' }], { duration: 720, easing: 'cubic-bezier(.4,0,.2,1)' }))
    }
    await Promise.all(jobs)
    if (revision !== this.revision) return
  }

  async hide(): Promise<void> {
    if (!this.root || !this.shown) return
    const revision = ++this.revision
    this.shown = false
    const root = this.root
    const dim = this.dim
    settle(root)
    if (dim) settle(dim)
    await Promise.all([root, ...(dim ? [dim] : [])].map((el) => play(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: reducedMotion() ? 0 : 200 })))
    if (revision === this.revision) for (const el of [root, ...(dim ? [dim] : [])]) { el.style.visibility = 'hidden'; el.style.opacity = '0' }
  }

  reset(): void {
    this.revision++
    this.shown = false
    if (this.root) { for (const animation of this.root.getAnimations({ subtree: true })) animation.cancel(); this.root.remove() }
    this.dim?.getAnimations().forEach((animation) => animation.cancel())
    this.dim?.remove()
    this.dim = null
    this.signature = ''
    this.root = null
    this.items.clear()
  }
}
