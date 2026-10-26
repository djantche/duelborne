// Routes /api/decks : la bibliothèque du compte connecté, les decks fournis (en lecture), l'import.
//   GET    /api/decks               → mes decks (brouillons compris)                  [connecté]
//   GET    /api/decks/:id           → un de mes decks, ou un deck fourni (own: false)
//   POST   /api/decks               → enregistre un deck dans ma bibliothèque         [connecté]
//   DELETE /api/decks/:id           → supprime un de mes decks                        [connecté]
//   POST   /api/decks/import        → lit un .ydk collé, une YDKE ou un lien YGOProDeck (sans rien enregistrer)
//   GET    /api/decks/legacy        → nombre de decks d'avant les comptes à récupérer [ordinateur hôte]
//   POST   /api/decks/legacy/claim  → les récupère dans ma bibliothèque              [connecté, ordinateur hôte]
import { msg } from '../../shared/msg.ts'
import { readUserDeck } from '../accounts/decks.ts'
import type { DeckService } from '../accounts/decks.ts'
import { deckInfo, findProvided, isPlayable } from '../ocg/decks.ts'
import { importDeck } from '../ocg/import.ts'
import { fail, jsonBody, playerOf, requireAuth, requirePlayer, respond, slugSafe } from './util.ts'
import type { ApiContext, Route } from './util.ts'

export function deckRoutes(ctx: ApiContext, decks: DeckService, changed: (userId: string) => void): Route {
  return (req, res, url) => {
    const rest = url.pathname.replace(/^\/api\/decks/, '')
    if (rest === url.pathname) return false

    if (req.method === 'GET' && (rest === '' || rest === '/')) {
      const user = requirePlayer(ctx, req, res)
      if (user) respond(res, 200, decks.list(user.id).map((d) => ({ ...deckInfo(d), playable: isPlayable(d) })))
      return true
    }

    if (rest === '/legacy' && req.method === 'GET') {
      respond(res, 200, { count: ctx.isHost(req) ? decks.legacyCount() : 0 })
      return true
    }

    if (rest === '/legacy/claim' && req.method === 'POST') {
      const auth = requireAuth(ctx, req, res)
      if (!auth) return true
      if (!ctx.isHost(req)) fail(res, 403, 'api.hostOnly')
      else {
        const out = decks.claimLegacy(auth.user.id)
        changed(auth.user.id)
        respond(res, 200, out)
      }
      return true
    }

    if (rest === '/import' && req.method === 'POST') {
      void (async () => {
        const body = (await jsonBody(req)) as { text?: unknown } | null
        if (typeof body?.text !== 'string') return fail(res, 400, 'api.badJson')
        const input = body.text
        try {
          if (input.trim().length < 10) return fail(res, 422, 'api.paste')
          const { result } = await importDeck(input)
          return respond(res, 200, { result })
        } catch (e) {
          return fail(res, 502, 'api.importFail', { why: e instanceof Error ? e.message : String(e) })
        }
      })()
      return true
    }

    // Un deck avec ses cartes : un des miens (à modifier), ou un deck fourni (à copier).
    if (req.method === 'GET' && rest.startsWith('/')) {
      const id = slugSafe(rest.slice(1))
      const user = playerOf(ctx, req)
      const own = user ? decks.get(user.id, id) : undefined
      const deck = own ?? findProvided(id)
      if (!deck) fail(res, 404, 'api.noDeck')
      else respond(res, 200, { ...deck, playable: isPlayable(deck), own: !!own })
      return true
    }

    if (req.method === 'POST' && (rest === '' || rest === '/')) {
      const user = requirePlayer(ctx, req, res)
      if (!user) return true
      void (async () => {
        const deck = readUserDeck(await jsonBody(req))
        if (!deck) return fail(res, 400, 'api.badDeck')
        const result = decks.save(user.id, deck)
        if ('error' in result) return respond(res, result.status, { error: result.error, unplayable: result.unplayable ?? [] })
        changed(user.id)
        return respond(res, 200, { deck: { ...deckInfo(result.deck), playable: isPlayable(result.deck) } })
      })()
      return true
    }

    if (req.method === 'DELETE' && rest.startsWith('/')) {
      const user = requirePlayer(ctx, req, res)
      if (!user) return true
      const deleted = decks.remove(user.id, slugSafe(rest.slice(1)))
      if (deleted) changed(user.id)
      respond(res, deleted ? 200 : 404, deleted ? { ok: true } : { error: msg('api.noDelete') })
      return true
    }
    return false
  }
}
