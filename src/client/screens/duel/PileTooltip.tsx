import { useEffect } from 'preact/hooks'

/** Dans body, hors du tapis incliné : les cartes ne peuvent pas recouvrir l’infobulle. */
export function PileTooltip(): null {
  useEffect(() => {
    const tooltip = document.createElement('div')
    tooltip.className = 'duel-pile-tooltip'
    tooltip.id = 'duel-pile-tooltip'
    tooltip.setAttribute('role', 'tooltip')
    tooltip.hidden = true
    document.body.append(tooltip)
    let anchor: HTMLElement | null = null
    let previousDescription: string | null = null
    const hide = (): void => {
      if (anchor) {
        if (previousDescription === null) anchor.removeAttribute('aria-describedby')
        else anchor.setAttribute('aria-describedby', previousDescription)
      }
      anchor = null
      tooltip.hidden = true
    }
    const target = (event: Event): HTMLElement | null => event.target instanceof Element ? event.target.closest('[data-pile-tip]') : null
    const position = (): void => {
      if (!anchor?.isConnected) return hide()
      tooltip.textContent = anchor.dataset.pileTip ?? ''
      const rect = anchor.getBoundingClientRect()
      const box = tooltip.getBoundingClientRect()
      tooltip.style.left = `${Math.max(10, Math.min(innerWidth - box.width - 10, rect.left + rect.width / 2 - box.width / 2))}px`
      tooltip.style.top = `${Math.max(10, Math.min(innerHeight - box.height - 10, rect.top - box.height - 10 >= 10 ? rect.top - box.height - 10 : rect.bottom + 10))}px`
    }
    const show = (next: HTMLElement): void => {
      if (document.querySelector('.summon-stage')) return hide()
      if (anchor !== next) {
        hide()
        anchor = next
        previousDescription = next.getAttribute('aria-describedby')
        next.setAttribute('aria-describedby', [previousDescription, tooltip.id].filter(Boolean).join(' '))
      }
      tooltip.hidden = false
      position()
    }
    const over = (event: PointerEvent): void => { const next = target(event); if (next && event.pointerType !== 'touch') show(next) }
    // Sur le tapis incliné en 3D, le navigateur attribue le pointeur tantôt à la zone, tantôt au tapis derrière elle :
    // on ne ferme que lorsque le pointeur quitte vraiment le rectangle de la zone, sinon l'infobulle clignote à chaque mouvement.
    const inside = (event: PointerEvent): boolean => {
      if (!anchor) return false
      const r = anchor.getBoundingClientRect()
      return event.clientX >= r.left - 2 && event.clientX <= r.right + 2 && event.clientY >= r.top - 2 && event.clientY <= r.bottom + 2
    }
    const out = (event: PointerEvent): void => { if (anchor && !(event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) && !inside(event)) hide() }
    const move = (event: PointerEvent): void => { if (anchor && event.pointerType !== 'touch' && !inside(event) && !target(event)) hide() }
    // Seul le focus venu du clavier affiche l'infobulle : un clic donne aussi le focus, et la fenêtre qu'il ouvre le rend en se fermant.
    const focus = (event: FocusEvent): void => { const next = target(event); if (next?.matches(':focus-visible')) show(next) }
    const blur = (): void => hide()
    // Toucher ou cliquer une zone ouvre sa fenêtre ou son menu : l'infobulle s'efface au lieu de rester par-dessus.
    const click = (): void => hide()
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') hide() }
    const observer = new MutationObserver(() => { if (anchor) position() })
    const app = document.getElementById('app')
    if (app) observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pile-tip'] })
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('pointermove', move)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', blur)
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', key)
    document.addEventListener('scroll', hide, true)
    document.addEventListener('visibilitychange', hide)
    document.addEventListener('duel-summon-presentation', hide)
    window.addEventListener('resize', hide)
    return () => {
      hide()
      observer.disconnect()
      tooltip.remove()
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', blur)
      document.removeEventListener('click', click, true)
      document.removeEventListener('keydown', key)
      document.removeEventListener('scroll', hide, true)
      document.removeEventListener('visibilitychange', hide)
      document.removeEventListener('duel-summon-presentation', hide)
      window.removeEventListener('resize', hide)
    }
  }, [])
  return null
}
