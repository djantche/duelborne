// Routes /api/formats : les formats disponibles et la vérification d'un deck.
//   GET  /api/formats        → les formats, avec leur statut (prêt, liste non vérifiée, liste absente)
//   POST /api/formats/check  { format, main, extra } → { legal, issues, points }
import { FORMAT_IDS } from '../../shared/formats.ts'
import type { FormatId } from '../../shared/formats.ts'
import type { FormatCatalog } from '../formats/catalog.ts'
import { fail, jsonBody, respond } from './util.ts'
import type { Route } from './util.ts'

const ids = (v: unknown): number[] => (Array.isArray(v) ? (v.filter((n) => Number.isInteger(n) && n > 0 && n < 10_000_000_000) as number[]).slice(0, 90) : [])

export function formatRoutes(formats: FormatCatalog): Route {
  return (req, res, url) => {
    const rest = url.pathname.replace(/^\/api\/formats/, '')
    if (rest === url.pathname) return false
    if (req.method === 'GET' && (rest === '' || rest === '/')) {
      respond(res, 200, formats.infos())
      return true
    }
    if (req.method === 'POST' && rest === '/check') {
      void (async () => {
        const body = (await jsonBody(req)) as { format?: unknown; main?: unknown; extra?: unknown } | null
        if (!body || !FORMAT_IDS.includes(body.format as FormatId)) return fail(res, 400, 'api.badJson')
        return respond(res, 200, formats.check(body.format as FormatId, { main: ids(body.main), extra: ids(body.extra) }))
      })()
      return true
    }
    return false
  }
}
