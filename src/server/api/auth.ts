// Routes /api/auth : inscription, connexion, profil.
//   POST /api/auth/register   { username, displayName?, password, prefs? } → { token, user }
//   POST /api/auth/login      { username, password }                       → { token, user }
//   POST /api/auth/logout                                                 → révoque la session courante
//   POST /api/auth/logout-all                                             → révoque les autres sessions
//   GET  /api/auth/me                                                     → { user, stats }
//   PATCH /api/auth/me        { displayName?, prefs? }                    → { user }
//   POST /api/auth/password   { current, next }                           → change le mot de passe, coupe les autres sessions
//   POST /api/auth/delete     { password }                                → supprime le compte et ses decks
import type { UserStats } from '../../shared/accounts.ts'
import { publicUser } from '../accounts/service.ts'
import { addressOf, fail, jsonBody, requireAuth, respond } from './util.ts'
import type { ApiContext, Route } from './util.ts'

export interface AuthHooks {
  /** Le profil d'un compte a changé (nom public, préférences) : les connexions en cours doivent le savoir. */
  userChanged(userId: string): void
  /** Les sessions de connexion de ce compte ont été coupées (hors celle gardée). */
  signedOut(userId: string, keepHash?: string): void
  /** Le compte n'existe plus. */
  deleted(userId: string): void
  stats(userId: string): UserStats
}

export function authRoutes(ctx: ApiContext, hooks: AuthHooks): Route {
  return (req, res, url) => {
    const rest = url.pathname.replace(/^\/api\/auth/, '')
    if (rest === url.pathname) return false
    const agent = String(req.headers['user-agent'] ?? '')

    if (req.method === 'POST' && (rest === '/register' || rest === '/login')) {
      void (async () => {
        const body = (await jsonBody(req, 4096)) as { username: unknown; password: unknown; displayName?: unknown; prefs?: unknown } | null
        if (!body) return fail(res, 400, 'api.badJson')
        const out = rest === '/register' ? await ctx.accounts.register(body, agent) : await ctx.accounts.login(body, agent, addressOf(req))
        if (!out.ok) return respond(res, out.status, { error: out.error })
        return respond(res, 200, { token: out.token, user: out.user })
      })()
      return true
    }

    if (req.method === 'POST' && rest === '/logout') {
      const auth = ctx.accounts.authenticateHeader(req.headers.authorization)
      if (auth) {
        ctx.accounts.logout(auth.tokenHash)
        hooks.signedOut(auth.user.id)
      }
      respond(res, 200, { ok: true })
      return true
    }

    if (req.method === 'POST' && rest === '/logout-all') {
      const auth = requireAuth(ctx, req, res)
      if (!auth) return true
      const closed = ctx.accounts.logoutEverywhere(auth.user.id, auth.tokenHash)
      hooks.signedOut(auth.user.id, auth.tokenHash)
      respond(res, 200, { closed })
      return true
    }

    if (rest === '/me' && req.method === 'GET') {
      const auth = requireAuth(ctx, req, res)
      if (auth) respond(res, 200, { user: publicUser(auth.user), stats: hooks.stats(auth.user.id) })
      return true
    }

    if (rest === '/me' && req.method === 'PATCH') {
      const auth = requireAuth(ctx, req, res)
      if (!auth) return true
      void (async () => {
        const body = (await jsonBody(req, 8192)) as Record<string, unknown> | null
        if (!body) return fail(res, 400, 'api.badJson')
        const out = ctx.accounts.updateProfile(auth.user.id, { displayName: body.displayName, prefs: body.prefs })
        if (!out.ok) return respond(res, out.status, { error: out.error })
        hooks.userChanged(auth.user.id)
        return respond(res, 200, { user: out.user })
      })()
      return true
    }

    if (rest === '/password' && req.method === 'POST') {
      const auth = requireAuth(ctx, req, res)
      if (!auth) return true
      void (async () => {
        const body = (await jsonBody(req, 4096)) as Record<string, unknown> | null
        if (!body) return fail(res, 400, 'api.badJson')
        const out = await ctx.accounts.changePassword(auth.user.id, body.current, body.next, auth.tokenHash)
        if (!out.ok) return respond(res, out.status, { error: out.error })
        hooks.signedOut(auth.user.id, auth.tokenHash)
        return respond(res, 200, { closed: out.closed })
      })()
      return true
    }

    if (rest === '/delete' && req.method === 'POST') {
      const auth = requireAuth(ctx, req, res)
      if (!auth) return true
      void (async () => {
        const body = (await jsonBody(req, 4096)) as Record<string, unknown> | null
        if (!body) return fail(res, 400, 'api.badJson')
        const out = await ctx.accounts.deleteAccount(auth.user.id, body.password)
        if (!out.ok) return respond(res, out.status, { error: out.error })
        hooks.deleted(auth.user.id)
        return respond(res, 200, { ok: true })
      })()
      return true
    }
    return false
  }
}
