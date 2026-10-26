// Actions disponibles sur tous les écrans : sons, plein écran, quitter la salle.
import { send } from './net.ts'
import { store } from './store.ts'
import { ask, openMenu, toast } from './render.ts'
import { audioPrefs, setMusic, setSfx } from '../ui/audio.ts'
import { savePrefs } from './account.ts'
import { t } from '../i18n.ts'

/** Petit menu pour couper la musique ou les bruitages. */
export function soundMenu(anchor: Element): void {
  const p = audioPrefs()
  openMenu(anchor, [
    { label: t('c.music', { state: p.music ? t('c.on') : t('c.off') }), icon: p.music ? 'sound' : 'mute', run: () => (setMusic(!p.music), savePrefs({ music: !p.music })) },
    { label: t('c.sfx', { state: p.sfx ? t('c.onPl') : t('c.offPl') }), icon: p.sfx ? 'sound' : 'mute', run: () => (setSfx(!p.sfx), savePrefs({ sfx: !p.sfx })) },
  ])
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) return void document.exitFullscreen()
  // Safari sur iPhone n'a pas de plein écran pour les pages : seul l'ajout à l'écran d'accueil le permet.
  const root = document.documentElement
  if (!root.requestFullscreen) return toast(t('c.iphone'))
  void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => toast(t('c.noFullscreen')))
}

export const leaveRoom = (): void => send({ t: 'leave' })

export function kickOthers(): void {
  ask({ title: t('c.kickTitle'), text: t('c.kickText'), ok: t('c.kick'), run: () => send({ t: 'kick' }) })
}
