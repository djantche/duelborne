// Redessin de l'interface. Les composants lisent l'état global (app/store.ts, screens/duel/state.ts) ;
// après l'avoir modifié, on appelle redraw() : Preact compare et ne touche qu'à ce qui a changé.
// Le rendu est synchrone : au retour de redraw(), le DOM est à jour (les animations en dépendent).
import { store } from './store.ts'
import type { MenuItem } from '../ui/Menu.tsx'

let renderer: () => void = () => {}

/** Branché une fois par main.tsx. */
export function setRenderer(fn: () => void): void {
  renderer = fn
}

export function redraw(): void {
  renderer()
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Message bref en haut de l'écran. */
export function toast(text: string): void {
  const id = Date.now()
  store.toast = { text, id }
  redraw()
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (store.toast?.id === id) store.toast = null
    redraw()
  }, 3200)
}

/** Ouvre un menu d'actions au-dessus de `anchor` (une carte, un bouton). */
export function openMenu(anchor: Element, items: MenuItem[], promptId?: number): void {
  store.menu = { anchor: anchor.getBoundingClientRect(), items, promptId }
  redraw()
}

export function closeMenu(): void {
  if (!store.menu) return
  store.menu = null
  redraw()
}

/** Demande confirmation dans une fenêtre du jeu ; `run` n'est appelé que si le joueur accepte. */
export function ask(opts: { title: string; text: string; ok?: string; danger?: boolean; run: () => void }): void {
  store.ask = { title: opts.title, text: opts.text, ok: opts.ok ?? 'Confirmer', danger: opts.danger ?? true, run: opts.run }
  redraw()
}

export function closeAsk(): void {
  store.ask = null
  redraw()
}
