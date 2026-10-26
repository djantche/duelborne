// Service worker : le client et les illustrations restent en cache (chargement plus rapide, appli installée qui
// s'ouvre même si la page n'a pas pu être rechargée). Les parties passent par le WebSocket, que le service worker
// ne voit pas : sans serveur de jeu, on peut ouvrir l'appli mais pas jouer.
//
// Il ne s'active qu'en HTTPS ou sur localhost (règle des navigateurs). Pour changer de stratégie de cache,
// incrémente VERSION : les anciens caches sont supprimés à l'activation.
const VERSION = 'v1'
const SHELL = `duel-shell-${VERSION}` // page d'accueil, /assets (noms hachés), icônes
const MEDIA = `duel-media-${VERSION}` // illustrations de cartes et bruitages
const DATA = `duel-data-${VERSION}` // catalogue de cartes
const KEEP = new Set([SHELL, MEDIA, DATA])
const MAX_MEDIA = 3000 // plafond du cache d'illustrations (les plus anciennes partent d'abord)
const NAV_TIMEOUT = 5000 // au-delà, la page vient du cache

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest'])).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.has(key)) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

const cacheable = (res) => res.ok && res.status === 200 && (res.type === 'basic' || res.type === 'default')

async function networkFirst(request, cacheName, key = request, timeout = 0) {
  const cache = await caches.open(cacheName)
  try {
    const fetched = fetch(request)
    const res = await (timeout ? Promise.race([fetched, new Promise((_, no) => setTimeout(no, timeout))]) : fetched)
    if (cacheable(res)) cache.put(key, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(key)
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(request, cacheName, limit = 0) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (cacheable(res)) {
    await cache.put(request, res.clone())
    if (limit && ++puts % 50 === 0) trim(cache, limit)
  }
  return res
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  const update = fetch(request)
    .then((res) => (cacheable(res) && cache.put(request, res.clone()), res))
    .catch(() => undefined)
  return hit ?? (await update) ?? Response.error()
}

let puts = 0
async function trim(cache, limit) {
  const keys = await cache.keys()
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  // Hors du champ du service worker : autres sites, API des decks, requêtes par plages d'octets (musiques en flux).
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || request.headers.has('range')) return

  if (request.mode === 'navigate') event.respondWith(networkFirst(request, SHELL, '/', NAV_TIMEOUT))
  else if (url.pathname.startsWith('/assets/')) event.respondWith(cacheFirst(request, SHELL))
  else if (url.pathname.startsWith('/data/images/')) event.respondWith(cacheFirst(request, MEDIA, MAX_MEDIA))
  else if (url.pathname.startsWith('/data/sounds/')) event.respondWith(cacheFirst(request, MEDIA))
  else if (url.pathname === '/data/cards.json') event.respondWith(networkFirst(request, DATA))
  else if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') event.respondWith(staleWhileRevalidate(request, SHELL))
})
