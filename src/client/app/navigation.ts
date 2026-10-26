// Navigation locale : historique du navigateur, lien vers chaque page et restauration après rechargement.
// La salle et le duel restent autoritaires côté serveur ; l'historique ne peut pas les quitter à sa place.
import { redraw } from './render.ts'
import { saved, store } from './store.ts'
import type { ScreenName } from './store.ts'
import { mountPageSnapshot } from './pageSnapshot.ts'

export type Page = 'home' | 'deck' | 'rooms' | 'options' | 'replays' | 'account' | 'tournaments'
export const isPage = (value: string): value is Page => ['home', 'deck', 'rooms', 'options', 'replays', 'account', 'tournaments'].includes(value)
const listeners = new Set<(from: ScreenName, to: ScreenName) => void>()
export const onNavigate = (listener: (from: ScreenName, to: ScreenName) => void): void => { listeners.add(listener) }

export function restoredPage(): Page {
  const requested = location.hash.slice(1)
  if (isPage(requested)) return requested
  const last = saved.get('last-page') ?? ''
  return isPage(last) ? last : 'home'
}

export function navigate(screen: ScreenName, replace = false): void {
  const changed = screen !== store.screen
  if (changed) for (const listener of listeners) listener(store.screen, screen)
  if (changed && isPage(store.screen) && isPage(screen) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelector('.route-snapshot')?.remove()
    const page = document.querySelector<HTMLElement>('.app-page:not([hidden])')
    if (page && !page.querySelector('[role="dialog"]')) {
      const snapshot = mountPageSnapshot(page)
      const animation = snapshot.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-16px)' }], { duration: 180, easing: 'ease-out' })
      void animation.finished.catch(() => {}).finally(() => snapshot.remove())
    }
  }
  store.screen = screen
  if (changed) {
    store.menu = null
    store.ask = null
  }
  if (isPage(screen)) saved.set('last-page', screen)
  const hash = `#${screen}`
  if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState']({ screen }, '', hash)
  redraw()
}

export function startNavigation(): void {
  addEventListener('popstate', () => {
    const requested = location.hash.slice(1)
    if (store.room || !isPage(requested)) {
      history.replaceState({ screen: store.screen }, '', `#${store.screen}`)
      return
    }
    navigate(requested, true)
  })
}
