// Routes /api/tournaments : tournois privés entre amis, accessibles aux comptes et invités identifiés.
//   GET    /api/tournaments               → mes tournois (organisés ou inscrits)
//   POST   /api/tournaments               { name, kind, format, maxPlayers, settings } → crée
//   POST   /api/tournaments/join          { code, deck } → s'inscrit avec le code reçu d'un ami
//   GET    /api/tournaments/:id           → le tournoi (organisateur et inscrits seulement)
//   POST   /api/tournaments/:id/deck      { deck } → change son deck avant le début
//   POST   /api/tournaments/:id/leave     → se désinscrit avant le début
//   POST   /api/tournaments/:id/start     → commence (organisateur)
//   POST   /api/tournaments/:id/forfeit   { match, user } → forfait d'un joueur (organisateur)
//   DELETE /api/tournaments/:id           → supprime, ou annule s'il est en cours (organisateur)
import type { TournamentService } from '../tournaments/service.ts'
import { fail, jsonBody, requirePlayer, respond, slugSafe } from './util.ts'
import type { ApiContext, Route } from './util.ts'

export function tournamentRoutes(ctx: ApiContext, tournaments: TournamentService): Route {
  return (req, res, url) => {
    const rest = url.pathname.replace(/^\/api\/tournaments/, '')
    if (rest === url.pathname) return false
    const user = requirePlayer(ctx, req, res)
    if (!user) return true
    const [, id = '', action = ''] = rest.split('/')
    const done = (out: { ok: true } | { ok: false; status: number; error: string }, body: unknown = { ok: true }): void => (out.ok ? respond(res, 200, body) : respond(res, out.status, { error: out.error }))

    if (req.method === 'GET' && rest === '') {
      respond(res, 200, tournaments.list(user.id))
      return true
    }
    if (req.method === 'GET' && id && !action) {
      const view = tournaments.view(user.id, slugSafe(id))
      if (view) respond(res, 200, view)
      else fail(res, 404, 'tournament.noSuch')
      return true
    }
    if (req.method === 'DELETE' && id && !action) {
      done(tournaments.cancel(user.id, slugSafe(id)))
      return true
    }
    if (req.method !== 'POST') return false

    void (async () => {
      const body = ((await jsonBody(req, 16 * 1024)) ?? {}) as Record<string, unknown>
      if (rest === '') {
        const out = tournaments.create(user.id, { name: body.name, kind: body.kind, format: body.format, maxPlayers: body.maxPlayers, settings: body.settings, mode: body.mode, deck: body.deck, aiLevel: body.aiLevel, aiDeck: body.aiDeck, bestOf: body.bestOf })
        return done(out, out.ok ? { id: out.id } : undefined)
      }
      if (id === 'join' && !action) {
        const out = tournaments.join(user, typeof body.code === 'string' ? body.code.slice(0, 40) : '', body.deck)
        return done(out, out.ok ? { id: out.id } : undefined)
      }
      const tid = slugSafe(id)
      if (action === 'deck') return done(tournaments.changeDeck(user.id, tid, body.deck))
      if (action === 'leave') return done(tournaments.leave(user.id, tid))
      if (action === 'start') return done(tournaments.start(user.id, tid))
      if (action === 'resume') return done(tournaments.resumeBots(user.id, tid))
      if (action === 'forfeit') return done(tournaments.forfeit(user.id, tid, body.match, body.user))
      return fail(res, 404, 'tournament.noSuch')
    })()
    return true
  }
}
