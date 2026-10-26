// Appui long tactile : progression attachée à la carte et annulation dès que le geste devient un déplacement.
// Un toucher bref ne montre rien : l'anneau n'apparaît qu'une fois le maintien installé, puis se remplit jusqu'à l'ouverture.
const RING_DELAY_MS = 220
const HOLD_MS = 600
let cancelHold = (): void => {}
export const resetCardHold = (): void => cancelHold()

export function installCardHold(enabled: () => boolean, inspect: (holder: HTMLElement) => void): void {
  let swallowClick = false
  document.addEventListener('pointerdown', (event) => {
    swallowClick = false
    resetCardHold()
    if (event.pointerType === 'mouse' || !event.isPrimary || !enabled() || !(event.target instanceof Element)) return
    const holder = event.target.closest<HTMLElement>('[data-card]')
    if (!holder || holder.closest('.card-inspector')) return
    // Les dos adverses sans identité connue ne deviennent jamais consultables.
    if (!holder.dataset.card) return
    const surface = holder.closest<HTMLElement>('button.card-notice') ?? holder
    const ring = document.createElement('div')
    ring.className = 'card-hold-progress'
    ring.setAttribute('aria-hidden', 'true')
    ring.innerHTML = '<svg viewBox="0 0 44 44"><circle class="hold-track" cx="22" cy="22" r="18"/><circle class="hold-fill" cx="22" cy="22" r="18" pathLength="1"/></svg>'
    const started = performance.now()
    let frame = 0
    let timer: ReturnType<typeof setTimeout>
    const pointerId = event.pointerId
    const stop = (): void => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      ring.remove()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('scroll', stop, true)
      cancelHold = () => {}
    }
    const move = (next: PointerEvent): void => {
      if (next.pointerId === pointerId && Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 10) stop()
    }
    const up = (next: PointerEvent): void => { if (next.pointerId === pointerId) stop() }
    const tick = (now: number): void => {
      if (!surface.isConnected || !enabled()) { stop(); return }
      const held = now - started
      if (held < RING_DELAY_MS) { frame = requestAnimationFrame(tick); return }
      if (!ring.isConnected) document.body.append(ring)
      const rect = surface.getBoundingClientRect()
      ring.style.left = `${rect.left + rect.width / 2}px`
      ring.style.top = `${rect.top + rect.height / 2}px`
      ring.style.setProperty('--hold', String(Math.min(1, (held - RING_DELAY_MS) / (HOLD_MS - RING_DELAY_MS))))
      frame = requestAnimationFrame(tick)
    }
    cancelHold = stop
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('scroll', stop, true)
    frame = requestAnimationFrame(tick)
    timer = setTimeout(() => {
      const valid = surface.isConnected && enabled()
      stop()
      if (!valid) return
      swallowClick = true
      inspect(surface)
      navigator.vibrate?.(12)
    }, HOLD_MS)
  })
  document.addEventListener('click', (event) => {
    if (!swallowClick) return
    swallowClick = false
    event.stopImmediatePropagation()
    event.preventDefault()
  }, true)
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetCardHold() })
  addEventListener('blur', resetCardHold)
}
