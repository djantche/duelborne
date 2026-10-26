// Compte du joueur : connexion, inscription, déconnexion, préférences gardées sur le profil.
//
// Le jeu reste jouable en invité. Le mot de passe n'est envoyé qu'à la connexion ou à l'inscription ; ensuite seul le jeton de
// session (révocable depuis le serveur) est gardé dans le navigateur.
import type { PublicUser, UserPrefs, UserStats } from '../../shared/accounts.ts'
import { audioPrefs, setMusic, setSfx } from '../ui/audio.ts'
import { LOCALES, lang, setLang, t } from '../i18n.ts'
import { setSortLocale } from '../screens/deck/model.ts'
import { api } from './api.ts'
import { send } from './net.ts'
import { redraw, toast } from './render.ts'
import { saved, savedAvatar, store } from './store.ts'
import { tx } from '../i18n.ts'

/** Les préférences de cet appareil, telles qu'on les range sur un profil. */
export function currentPrefs(): UserPrefs {
  const a = audioPrefs()
  const avatar = savedAvatar()
  return { lang: lang(), music: a.music, sfx: a.sfx, ...(avatar ? { avatar } : {}) }
}

/** Avatar affiché pour ce joueur : celui du compte s'il en a choisi un, sinon celui de l'appareil. */
export function currentAvatar(): number | null {
  const kept = store.user?.prefs.avatar
  return kept !== undefined ? kept : savedAvatar()
}

/** Change d'avatar : gardé sur l'appareil, et sur le profil quand un compte est connecté (le serveur s'en charge). */
export function setAvatar(avatar: number | null): void {
  if (avatar === null) saved.remove('avatar')
  else saved.set('avatar', String(avatar))
  if (store.user) store.user = { ...store.user, prefs: { ...store.user.prefs, avatar } }
  send({ t: 'avatar', avatar })
  // Hors ligne, l'appareil garde le choix et le renvoie à la reconnexion ; le profil, lui, n'est pas encore à jour.
  if (store.connection !== 'online') toast(t('ui.offline'))
  redraw()
}

/** Applique les préférences d'un profil sur cet appareil. */
export function applyPrefs(p: UserPrefs): void {
  if (p.lang && LOCALES[p.lang] && p.lang !== lang()) {
    setLang(p.lang)
    setSortLocale(LOCALES[p.lang]?._code ?? p.lang)
  }
  if (p.music !== undefined) setMusic(p.music)
  if (p.sfx !== undefined) setSfx(p.sfx)
}

/** Le serveur nous dit quel compte est connecté (ou aucun). Les préférences du profil s'appliquent à l'arrivée d'un compte. */
export function setUser(user: PublicUser | null): void {
  const arrived = user !== null && user.id !== store.user?.id
  store.user = user
  if (user) store.name = user.displayName
  if (!user) store.stats = null
  if (arrived && user) applyPrefs(user.prefs)
}

/** Range une préférence sur le profil (sans attendre) ; sans compte, elle reste sur l'appareil. */
export function savePrefs(patch: UserPrefs): void {
  if (!store.user) return
  void api<{ user: PublicUser }>('/api/auth/me', { method: 'PATCH', json: { prefs: patch } }).then((r) => {
    if (r.ok && r.body && store.user?.id === r.body.user.id) store.user = r.body.user
  })
}

export interface Credentials {
  username: string
  password: string
  displayName?: string
}

/** Connecte ou inscrit. Renvoie l'erreur à montrer (déjà traduite), ou null si tout s'est bien passé. */
export async function authenticate(kind: 'login' | 'register', c: Credentials): Promise<string | null> {
  try {
    const r = await api<{ token?: string; user?: PublicUser; error?: string }>(`/api/auth/${kind}`, { method: 'POST', json: kind === 'register' ? { ...c, prefs: currentPrefs() } : c })
    if (!r.ok || !r.body?.token || !r.body.user) return r.body?.error ? tx(r.body.error) : t('auth.failed')
    saved.set('auth', r.body.token)
    setUser(r.body.user)
    send({ t: 'auth', token: r.body.token })
    redraw()
    return null
  } catch {
    return t('auth.unreachable')
  }
}

export async function signOut(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' })
  } catch {
    /* hors ligne : le jeton est oublié ici, il expirera de lui-même côté serveur */
  }
  saved.remove('auth')
  setUser(null)
  send({ t: 'auth', token: null })
  // Invité de nouveau : le nom choisi sur cet appareil revient.
  const name = saved.get('name') ?? t('home.defaultName')
  store.name = name
  send({ t: 'rename', name })
  send({ t: 'avatar', avatar: savedAvatar() })
  redraw()
}

/** Le jeton a été refusé par le serveur (expiré, révoqué) : on l'oublie. */
export function authLost(): void {
  saved.remove('auth')
  setUser(null)
  toast(t('auth.expired'))
}

export async function loadStats(): Promise<void> {
  if (!store.user) return
  const r = await api<{ user: PublicUser; stats: UserStats }>('/api/auth/me').catch(() => null)
  if (r?.ok && r.body) {
    store.stats = r.body.stats
    store.user = r.body.user
    redraw()
  }
}
