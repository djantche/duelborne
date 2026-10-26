// Appels à l'API HTTP du serveur, avec le jeton de connexion du compte quand il y en a un.
import { saved, store } from './store.ts'
import { guestKey } from './guest.ts'

export interface ApiResult<T> {
  ok: boolean
  status: number
  body: T | null
}

/** Le jeton de connexion gardé dans le navigateur (jamais le mot de passe). */
export const authToken = (): string | null => saved.get('auth')

/** JSON en entrée et en sortie. Une réponse qui n'est pas du JSON donne `body: null` sans lever d'erreur. */
export async function api<T>(path: string, init: Omit<RequestInit, 'body'> & { json?: unknown } = {}): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init
  const token = authToken()
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Duel-Guest': guestKey(), 'X-Duel-Guest-Name': encodeURIComponent(store.name || saved.get('name') || 'Joueur'), ...headers },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  })
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as T | null }
}
