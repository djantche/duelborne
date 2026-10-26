// Petits outils communs aux routes HTTP de l'API.
import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { msg } from '../../shared/msg.ts'
import type { AccountService, Authenticated } from '../accounts/service.ts'
import type { UserRecord } from '../store/types.ts'

/** Corps JSON d'une requête ; null si ce n'est pas du JSON valide ou trop gros. */
export async function jsonBody(req: IncomingMessage, max = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > max) return null
    chunks.push(chunk as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

/** Écrit une réponse JSON et ferme. */
export function respond(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

export const fail = (res: ServerResponse, status: number, key: string, params?: Record<string, string | number>): void => respond(res, status, { error: msg(key, params) })

/** Identifiant sûr dans une adresse. */
export const slugSafe = (s: string): string => s.replace(/[^A-Za-z0-9-]/g, '').slice(0, 80)

/** Adresse IP de la connexion (sans le préfixe IPv4-mappé). */
export const addressOf = (req: IncomingMessage): string => (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '')

export interface ApiContext {
  accounts: AccountService
  /** La requête vient de l'ordinateur qui héberge le serveur. */
  isHost(req: IncomingMessage): boolean
}

/** Le compte derrière la requête ; sinon répond 401 et renvoie null. */
export function requireAuth(ctx: ApiContext, req: IncomingMessage, res: ServerResponse): Authenticated | null {
  const auth = ctx.accounts.authenticateHeader(req.headers.authorization)
  if (!auth) fail(res, 401, 'auth.required')
  return auth
}

/** Identité de jeu : compte authentifié ou invité possédant le secret de sa propre bibliothèque. */
export function playerOf(ctx: ApiContext, req: IncomingMessage): UserRecord | null {
  const auth = ctx.accounts.authenticateHeader(req.headers.authorization)
  if (auth) return auth.user
  let name = 'Joueur'
  try { if (typeof req.headers['x-duel-guest-name'] === 'string') name = decodeURIComponent(req.headers['x-duel-guest-name'].slice(0, 300)) } catch { /* garde le nom par défaut */ }
  return ctx.accounts.guests.resolve(req.headers['x-duel-guest'], name)
}

export function requirePlayer(ctx: ApiContext, req: IncomingMessage, res: ServerResponse): UserRecord | null {
  const user = playerOf(ctx, req)
  if (!user) fail(res, 401, 'guest.unavailable')
  return user
}

/** Handler d'une famille de routes : renvoie true quand la route lui appartient. */
export type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => boolean
