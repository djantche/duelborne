// L'API HTTP du jeu : comptes, decks, formats, tournois, historique. Les fichiers du client sont servis par http.ts.
import type { IncomingMessage } from 'node:http'
import type { UserStats } from '../../shared/accounts.ts'
import { authRoutes } from './auth.ts'
import { deckRoutes } from './decks.ts'
import { duelRoutes } from './duels.ts'
import { formatRoutes } from './formats.ts'
import { tournamentRoutes } from './tournaments.ts'
import { summonRoutes } from './summons.ts'
import type { ApiContext, Route } from './util.ts'
import type { Services } from '../services.ts'

/** Ce que l'API demande au hub : prévenir les connexions ouvertes quand un compte change. */
export interface ApiHub {
  userChanged(userId: string): void
  signedOut(userId: string, keepHash?: string): void
  deleted(userId: string): void
  stats(userId: string): UserStats
}

export function createApi(services: Services, hub: ApiHub, isHost: (req: IncomingMessage) => boolean): Route {
  const ctx: ApiContext = { accounts: services.accounts, isHost }
  const routes: Route[] = [
    summonRoutes,
    authRoutes(ctx, hub),
    deckRoutes(ctx, services.decks, (userId) => hub.userChanged(userId)),
    formatRoutes(services.formats),
    tournamentRoutes(ctx, services.tournaments),
    duelRoutes(ctx, services.store),
  ]
  return (req, res, url) => {
    if (!url.pathname.startsWith('/api/')) return false
    for (const route of routes) if (route(req, res, url)) return true
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'not found' }))
    return true
  }
}
