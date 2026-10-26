// Application installable (PWA) : service worker et bouton « Installer » des Options.
// Les navigateurs n'activent le service worker qu'en HTTPS ou sur localhost : sur http://192.168.x.x, il est simplement ignoré.
import { redraw } from './render.ts'

/** Événement non standard de Chrome / Edge / Android : l'invite d'installation, gardée pour la montrer quand le joueur le demande. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let prompt: InstallPrompt | null = null

/** Vrai quand le navigateur propose l'installation (donc pas déjà installée, et HTTPS / localhost). */
export const canInstall = (): boolean => prompt !== null

export async function installApp(): Promise<void> {
  if (!prompt) return
  const asked = prompt
  prompt = null // l'invite ne sert qu'une fois
  await asked.prompt()
  redraw()
}

export function initPwa(): void {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    prompt = e as InstallPrompt
    redraw()
  })
  addEventListener('appinstalled', () => {
    prompt = null
    redraw()
  })
  // En développement, Vite sert déjà les fichiers à neuf : pas de cache à gérer.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = (): void => void navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (document.readyState === 'complete') register()
    else addEventListener('load', register)
  }
}
