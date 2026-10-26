// Identité technique d’un invité : le navigateur garde un secret aléatoire, le serveur seulement son empreinte.
// Ces participants n’ont ni mot de passe valide ni session de compte ; les routes de compte restent inaccessibles.
import { createHash, randomUUID } from 'node:crypto'
import { cleanDisplayName } from '../../shared/accounts.ts'
import type { Storage, UserRecord } from '../store/types.ts'

export class GuestService {
  private readonly store: Storage
  constructor(store: Storage) { this.store = store }

  resolve(token: unknown, name: string): UserRecord | null {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null
    const hash = createHash('sha256').update(token).digest('hex')
    // « : » n’est pas autorisé dans les identifiants d’inscription.
    const username = `guest:${hash}`
    const previous = this.store.users.byUsername(username)
    const base = cleanDisplayName(name).slice(0, 12) || 'Joueur'
    let displayName = `${base} #${hash.slice(0, 8)}`
    for (let n = 2; ; n++) {
      const other = this.store.users.byDisplayName(displayName)
      if (!other || other.id === previous?.id) break
      displayName = `${base.slice(0, 9)} #${hash.slice(0, 8)}-${n}`.slice(0, 24)
    }
    if (previous) {
      if (previous.displayName !== displayName) this.store.users.setDisplayName(previous.id, displayName, Date.now())
      return this.store.users.byId(previous.id) ?? previous
    }
    const now = Date.now()
    const user: UserRecord = { id: randomUUID(), username, displayName, passwordHash: 'guest-disabled', prefs: {}, createdAt: now, updatedAt: now }
    this.store.users.create(user)
    return user
  }
}
