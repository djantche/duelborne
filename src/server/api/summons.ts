import { summonAssets } from '../assets/summons.ts'
import { respond } from './util.ts'
import type { Route } from './util.ts'

export const summonRoutes: Route = (req, res, url) => {
  if (url.pathname !== '/api/summon-assets') return false
  if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }).end(); return true }
  respond(res, 200, summonAssets())
  return true
}
