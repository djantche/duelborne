// Serveur HTTP : fichiers du client (via Vite en développement, dist/ en production), data/ et l'API (voir api/).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import path from 'node:path'
import { DATA_DIR, ROOT } from './paths.ts'
import type { Route } from './api/util.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
}

/** Sert un fichier d'un dossier, en refusant toute sortie du dossier (../). */
function serveFile(baseDir: string, urlPath: string, res: ServerResponse, immutable = false, range?: string): boolean {
  const file = path.resolve(baseDir, '.' + path.posix.normalize('/' + decodeURIComponent(urlPath)))
  if (!file.startsWith(baseDir + path.sep) || !existsSync(file) || !statSync(file).isFile()) return false
  const size = statSync(file).size
  const headers: Record<string, string | number> = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Accept-Ranges': 'bytes',
  }
  // Les musiques se lisent par morceaux : le navigateur demande une plage d'octets pour commencer vite et se déplacer dans la piste.
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
      return true
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
    return true
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  createReadStream(file).pipe(res)
  return true
}

export async function createHttpServer(prod: boolean, api: Route): Promise<Server> {
  const distDir = path.join(ROOT, 'dist/client')
  let vite: import('vite').ViteDevServer | null = null

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (api(req, res, url)) return
    if (url.pathname.startsWith('/data/')) {
      // Seuls le catalogue, les images et les sons sont exposés : pas les scripts ni la base du moteur.
      const allowed = url.pathname === '/data/cards.json' || url.pathname.startsWith('/data/images/') || url.pathname.startsWith('/data/sounds/')
      const stable = (url.pathname.startsWith('/data/images/') || url.pathname.startsWith('/data/sounds/')) && !url.pathname.endsWith('.json')
      if (allowed && serveFile(DATA_DIR, url.pathname.slice('/data/'.length), res, stable, req.headers.range)) return
      res.writeHead(404).end('Not found')
      return
    }
    if (vite) return void vite.middlewares(req, res)
    if (serveFile(distDir, url.pathname === '/' ? 'index.html' : url.pathname, res)) return
    res.writeHead(404).end('Not found (as-tu lancé `npm run build` ?)')
  })

  if (!prod) {
    const { createServer: createVite } = await import('vite')
    vite = await createVite({
      configFile: path.join(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    })
  }
  return server
}
