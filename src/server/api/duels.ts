// Route /api/duels : l'historique du compte connecté.
//   GET /api/duels?limit=20 → mes derniers duels (format, défi, résultat, adversaires). Jamais les Decks ni la graine.
import { requireAuth, respond } from './util.ts'
import type { ApiContext, Route } from './util.ts'
import type { Storage } from '../store/types.ts'

export function duelRoutes(ctx: ApiContext, store: Storage): Route {
  return (req, res, url) => {
    if (url.pathname !== '/api/duels' || req.method !== 'GET') return false
    const auth = requireAuth(ctx, req, res)
    if (auth) respond(res, 200, store.duels.ofUser(auth.user.id, Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20))))
    return true
  }
}
