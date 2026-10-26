// Comptes et sessions de connexion. Aucune règle de duel ici : ce service dit qui est la personne derrière une requête.
//
// - Le mot de passe n'est jamais gardé : seule son empreinte scrypt l'est (passwords.ts).
// - La session est un jeton aléatoire remis une fois au client ; la base n'en garde que l'empreinte SHA-256, donc une
//   copie de la base ne permet pas de se connecter. Une session expire, se révoque, et peut être coupée partout.
// - Un client ne dit jamais « je suis tel utilisateur » : il présente un jeton, le serveur retrouve le compte.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { msg } from '../../shared/msg.ts'
import { cleanDisplayName, cleanPrefs, validDisplayName, validPassword, validUsername } from '../../shared/accounts.ts'
import type { PublicUser, UserPrefs } from '../../shared/accounts.ts'
import type { Storage, UserRecord } from '../store/types.ts'
import { decoyHash, hashPassword, verifyPassword } from './passwords.ts'
import { GuestService } from './guests.ts'

/** Une connexion reste valable 30 jours après sa dernière utilisation. */
const SESSION_TTL = 30 * 24 * 3600_000
/** La dernière utilisation n'est réécrite qu'à ce rythme : pas une écriture par requête. */
const TOUCH_EVERY = 10 * 60_000
/** Essais de connexion ratés autorisés avant blocage, et durée de la fenêtre. */
const MAX_FAILS = 6
const FAIL_WINDOW = 10 * 60_000

export type Failure = { ok: false; status: number; error: string }
export type Outcome<T> = ({ ok: true } & T) | Failure
const fail = (status: number, key: string, params?: Record<string, string | number>): Failure => ({ ok: false, status, error: msg(key, params) })

export const publicUser = (u: UserRecord): PublicUser => ({ id: u.id, username: u.username, displayName: u.displayName, prefs: u.prefs, createdAt: u.createdAt })
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

export interface Authenticated {
  user: UserRecord
  /** Empreinte de la session utilisée (pour la déconnecter, ou garder celle-ci en changeant de mot de passe). */
  tokenHash: string
}

export class AccountService {
  readonly guests: GuestService
  private fails = new Map<string, { n: number; since: number }>()
  private readonly store: Storage
  private readonly now: () => number

  constructor(store: Storage, now: () => number = Date.now) {
    this.guests = new GuestService(store)
    this.store = store
    this.now = now
  }

  // ───────────────────────── Anti force brute ─────────────────────────

  private blocked(key: string): boolean {
    const f = this.fails.get(key)
    if (!f) return false
    if (this.now() - f.since > FAIL_WINDOW) {
      this.fails.delete(key)
      return false
    }
    return f.n >= MAX_FAILS
  }

  private failed(key: string): void {
    const f = this.fails.get(key)
    if (!f || this.now() - f.since > FAIL_WINDOW) this.fails.set(key, { n: 1, since: this.now() })
    else f.n++
  }

  // ───────────────────────── Inscription et connexion ─────────────────────────

  private open(user: UserRecord, agent: string): string {
    const token = randomBytes(32).toString('base64url')
    const now = this.now()
    this.store.sessions.create({ tokenHash: hashToken(token), userId: user.id, createdAt: now, lastSeen: now, expiresAt: now + SESSION_TTL, revokedAt: null, agent: agent.slice(0, 200) })
    return token
  }

  async register(input: { username: unknown; displayName?: unknown; password: unknown; prefs?: unknown }, agent: string): Promise<Outcome<{ token: string; user: PublicUser }>> {
    const username = typeof input.username === 'string' ? input.username.trim() : ''
    const password = typeof input.password === 'string' ? input.password : ''
    const display = cleanDisplayName(typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName : username)
    if (!validUsername(username)) return fail(422, 'auth.badUsername')
    if (!validDisplayName(display)) return fail(422, 'auth.badDisplayName')
    if (!validPassword(password)) return fail(422, 'auth.badPassword')
    if (this.store.users.byUsername(username)) return fail(409, 'auth.usernameTaken')
    if (this.store.users.byDisplayName(display)) return fail(409, 'auth.nameTaken')
    const passwordHash = await hashPassword(password)
    const now = this.now()
    const user: UserRecord = { id: randomUUID(), username, displayName: display, passwordHash, prefs: cleanPrefs(input.prefs), createdAt: now, updatedAt: now }
    try {
      // Deux inscriptions simultanées du même nom : la base tranche, la seconde est refusée.
      this.store.users.create(user)
    } catch {
      return fail(409, 'auth.usernameTaken')
    }
    return { ok: true, token: this.open(user, agent), user: publicUser(user) }
  }

  async login(input: { username: unknown; password: unknown }, agent: string, ip: string): Promise<Outcome<{ token: string; user: PublicUser }>> {
    const username = typeof input.username === 'string' ? input.username.trim() : ''
    const password = typeof input.password === 'string' ? input.password : ''
    const keys = [`ip:${ip}`, `user:${username.toLowerCase()}`]
    if (keys.some((k) => this.blocked(k))) return fail(429, 'auth.tooMany')
    const user = this.store.users.byUsername(username)
    // Même travail que le compte existe ou non : la durée de la réponse ne dit pas quels comptes existent.
    const ok = await verifyPassword(password.slice(0, 1024), user?.passwordHash ?? (await decoyHash()))
    if (!user || !ok) {
      for (const k of keys) this.failed(k)
      return fail(401, 'auth.badLogin')
    }
    for (const k of keys) this.fails.delete(k)
    return { ok: true, token: this.open(user, agent), user: publicUser(user) }
  }

  // ───────────────────────── Sessions ─────────────────────────

  /** Le compte derrière un jeton, ou null (jeton inconnu, expiré ou révoqué). Prolonge la session. */
  authenticate(token: string | null | undefined): Authenticated | null {
    if (!token || token.length > 100) return null
    const tokenHash = hashToken(token)
    const session = this.store.sessions.byHash(tokenHash)
    const now = this.now()
    if (!session || session.revokedAt !== null || session.expiresAt < now) return null
    const user = this.store.users.byId(session.userId)
    if (!user) return null
    if (now - session.lastSeen > TOUCH_EVERY) this.store.sessions.touch(tokenHash, now, now + SESSION_TTL)
    return { user, tokenHash }
  }

  /** Le jeton d'un en-tête « Authorization: Bearer … ». */
  authenticateHeader(header: string | undefined): Authenticated | null {
    const m = /^Bearer\s+([\w-]{20,100})$/.exec(header ?? '')
    return m ? this.authenticate(m[1]) : null
  }

  logout(tokenHash: string): void {
    this.store.sessions.revoke(tokenHash, this.now())
  }

  logoutEverywhere(userId: string, keep?: string): number {
    return this.store.sessions.revokeAll(userId, this.now(), keep)
  }

  /** Nettoyage périodique des anciennes sessions. */
  purge(): void {
    this.store.sessions.purge(this.now() - 7 * 24 * 3600_000)
    for (const [k, f] of this.fails) if (this.now() - f.since > FAIL_WINDOW) this.fails.delete(k)
  }

  // ───────────────────────── Profil ─────────────────────────

  /** Un nom public est pris par un compte (pour qu'un invité ne se fasse pas passer pour lui). */
  isNameTaken(name: string): boolean {
    return !!this.store.users.byDisplayName(name)
  }

  updateProfile(userId: string, patch: { displayName?: unknown; prefs?: unknown }): Outcome<{ user: PublicUser }> {
    const user = this.store.users.byId(userId)
    if (!user) return fail(404, 'auth.noAccount')
    const now = this.now()
    if (patch.displayName !== undefined) {
      const display = cleanDisplayName(typeof patch.displayName === 'string' ? patch.displayName : '')
      if (!validDisplayName(display)) return fail(422, 'auth.badDisplayName')
      const other = this.store.users.byDisplayName(display)
      if (other && other.id !== userId) return fail(409, 'auth.nameTaken')
      if (display !== user.displayName) this.store.users.setDisplayName(userId, display, now)
    }
    if (patch.prefs !== undefined) {
      // Les préférences envoyées s'ajoutent aux anciennes : un client qui n'en connaît qu'une partie n'efface pas le reste.
      const merged: UserPrefs = { ...user.prefs, ...cleanPrefs(patch.prefs) }
      this.store.users.setPrefs(userId, merged, now)
    }
    const fresh = this.store.users.byId(userId) as UserRecord
    return { ok: true, user: publicUser(fresh) }
  }

  async changePassword(userId: string, current: unknown, next: unknown, keepToken: string): Promise<Outcome<{ closed: number }>> {
    const user = this.store.users.byId(userId)
    if (!user) return fail(404, 'auth.noAccount')
    if (typeof next !== 'string' || !validPassword(next)) return fail(422, 'auth.badPassword')
    if (typeof current !== 'string' || !(await verifyPassword(current.slice(0, 1024), user.passwordHash))) return fail(403, 'auth.wrongPassword')
    this.store.users.setPassword(userId, await hashPassword(next), this.now())
    // Les autres appareils doivent se reconnecter avec le nouveau mot de passe.
    return { ok: true, closed: this.logoutEverywhere(userId, keepToken) }
  }

  async deleteAccount(userId: string, password: unknown): Promise<Outcome<object>> {
    const user = this.store.users.byId(userId)
    if (!user) return fail(404, 'auth.noAccount')
    if (typeof password !== 'string' || !(await verifyPassword(password.slice(0, 1024), user.passwordHash))) return fail(403, 'auth.wrongPassword')
    this.store.users.delete(userId)
    return { ok: true }
  }
}
