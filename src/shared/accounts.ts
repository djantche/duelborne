// Comptes : forme des profils échangés avec le client et règles de saisie (le serveur les applique, le client les affiche).

/** Préférences gardées sur le profil, retrouvées depuis n'importe quel appareil. */
export interface UserPrefs {
  lang?: string
  music?: boolean
  sfx?: boolean
  /** Deck actif par format (« casual » → identifiant du deck), retrouvé au salon. */
  activeDecks?: Record<string, string>
  /** Avatar : carte dont l'illustration représente le joueur (null : aucun). */
  avatar?: number | null
}

/** Ce que le client a le droit de savoir d'un compte. Jamais le secret ni l'empreinte. */
export interface PublicUser {
  id: string
  username: string
  displayName: string
  prefs: UserPrefs
  createdAt: number
}

/** Bilan des duels d'un compte (les parties contre l'ordinateur ou entre amis comptent toutes). */
export interface UserStats {
  duels: number
  wins: number
  losses: number
  draws: number
}

export const USERNAME_MIN = 3
export const USERNAME_MAX = 24
export const DISPLAY_MIN = 2
export const DISPLAY_MAX = 24
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

/** Identifiant de connexion : lettres, chiffres, point, tiret et souligné. */
export const validUsername = (s: string): boolean => s.length >= USERNAME_MIN && s.length <= USERNAME_MAX && /^[A-Za-z0-9._-]+$/.test(s)
/** Nom public : lisible, sans balisage ni caractère de contrôle. */
export const cleanDisplayName = (s: string): string => s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()
export const validDisplayName = (s: string): boolean => s.length >= DISPLAY_MIN && s.length <= DISPLAY_MAX
export const validPassword = (s: string): boolean => s.length >= PASSWORD_MIN && s.length <= PASSWORD_MAX

/** Avatar reçu d'un client : un numéro de carte plausible, sinon aucun. */
export const cleanAvatar = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < 1e10 ? v : null)

const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/

/** Garde seulement les préférences connues et bien formées (un client ne peut pas y ranger n'importe quoi). */
export function cleanPrefs(value: unknown): UserPrefs {
  const out: UserPrefs = {}
  if (!value || typeof value !== 'object') return out
  const p = value as Record<string, unknown>
  if (typeof p.lang === 'string' && LANG_RE.test(p.lang)) out.lang = p.lang
  if (typeof p.music === 'boolean') out.music = p.music
  if (typeof p.sfx === 'boolean') out.sfx = p.sfx
  if (p.avatar !== undefined) out.avatar = cleanAvatar(p.avatar)
  if (p.activeDecks && typeof p.activeDecks === 'object') {
    const decks: Record<string, string> = {}
    for (const [format, id] of Object.entries(p.activeDecks as Record<string, unknown>).slice(0, 20)) {
      if (/^[a-z0-9-]{1,30}$/.test(format) && typeof id === 'string' && /^[A-Za-z0-9-]{1,60}$/.test(id)) decks[format] = id
    }
    out.activeDecks = decks
  }
  return out
}
