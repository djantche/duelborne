#!/usr/bin/env node
// Originaux de la catégorie Yugipedia, sans conversion ni redimensionnement.
// Usage : npm run fetch-master-duel-monsters -- [--dry-run] [--limit=5]
// Relançable : les fichiers dont la taille et le SHA-1 correspondent sont conservés.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { associateCards } from './master-duel-monster-cards.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'data/images/master-duel-monsters')
const API = 'https://yugipedia.com/api.php'
const CATEGORY = 'Category:Yu-Gi-Oh! Master Duel monster images'
const SOURCE = `https://yugipedia.com/wiki/${encodeURIComponent(CATEGORY.replaceAll(' ', '_'))}`
const USER_AGENT = 'duelborne/0.1 (jeu libre non commercial ; github.com/djantche/duelborne)'
const DELAY_MS = 1000
const RETRIES = 3
const CONCURRENCY = 3
let nextRequest = 0

function options() {
  let limit = Infinity
  let dryRun = false
  let associateOnly = false
  let resume = false
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage : npm run fetch-master-duel-monsters -- [--dry-run] [--limit=N] [--associate-only] [--resume]
  --dry-run   Inventorie la catégorie et son poids, sans écrire ni télécharger les images.
  --limit=N   Télécharge au plus N entrées de l’inventaire (entier positif).
  --associate-only   Recrée les associations du manifeste local, sans réseau ni téléchargement.
  --resume    Reprend le manifeste local sans consulter à nouveau la catégorie.
Destination : data/images/master-duel-monsters/
Relancer la même commande reprend les fichiers manquants ou corrompus.`)
      return null
    }
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--associate-only') associateOnly = true
    else if (arg === '--resume') resume = true
    else if (/^--limit=[1-9]\d*$/.test(arg) && Number.isSafeInteger(Number(arg.slice(8)))) limit = Number(arg.slice(8))
    else throw new Error(`Option inconnue ou invalide : ${arg}. Voir --help.`)
  }
  return { limit, dryRun, associateOnly, resume }
}

async function request(url, consume) {
  for (let attempt = 0; ; attempt++) {
    let retryAfter = 0
    let permanent = false
    try {
      const now = Date.now()
      const start = Math.max(now, nextRequest)
      nextRequest = start + DELAY_MS
      await sleep(start - now)
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        const header = res.headers.get('retry-after')
        if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now())
        permanent = res.status < 500 && res.status !== 429 && res.status !== 408
        await res.body?.cancel()
        throw new Error(`HTTP ${res.status}${res.status === 403 ? ' : accès refusé par Yugipedia' : ''}`)
      }
      return await consume(res)
    } catch (err) {
      if (permanent || attempt >= RETRIES) throw new Error(`${url} : ${err.message}`, { cause: err })
      const delay = Math.max(retryAfter || 0, 2000 * 2 ** attempt)
      console.warn(`Nouvelle tentative ${attempt + 1}/${RETRIES} dans ${Math.ceil(delay / 1000)} s : ${err.message}`)
      await sleep(delay)
    }
  }
}

async function inventory() {
  const files = new Map()
  const seenContinuations = new Set()
  let continuation = {}
  do {
    const url = new URL(API)
    url.search = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', maxlag: '5',
      generator: 'categorymembers', gcmtitle: CATEGORY, gcmtype: 'file', gcmlimit: '50',
      prop: 'imageinfo', iiprop: 'url|size|sha1|mime', ...continuation,
    }).toString()
    const body = await request(url, async (res) => {
      const json = await res.json()
      if (json.error) throw new Error(`API ${json.error.code} : ${json.error.info}`)
      if (!Array.isArray(json.query?.pages)) throw new Error('Réponse API sans liste de fichiers.')
      return json
    })
    for (const page of body.query.pages) {
      const info = page.imageinfo?.[0]
      if (page.ns !== 6 || !page.title?.startsWith('File:') || !info?.url || !info.mime?.startsWith('image/')
        || !Number.isSafeInteger(info.size) || info.size <= 0 || !/^[a-f0-9]{40}$/i.test(info.sha1)) {
        throw new Error(`Métadonnées d’image invalides : ${page.title ?? page.pageid}`)
      }
      const filename = page.title.slice(5).replaceAll(' ', '_')
      if (/[\\/\x00-\x1f]/.test(filename) || filename === '.' || filename === '..') throw new Error(`Nom de fichier invalide : ${filename}`)
      if (new URL(info.url).protocol !== 'https:') throw new Error(`URL d’image non HTTPS : ${info.url}`)
      files.set(page.pageid, {
        pageId: page.pageid, title: page.title, filename,
        url: info.url, descriptionUrl: info.descriptionurl,
        size: info.size, width: info.width, height: info.height, sha1: info.sha1.toLowerCase(), mime: info.mime,
      })
    }
    console.log(`[catégorie] ${files.size} images recensées…`)
    continuation = body.continue
    if (continuation) {
      const key = JSON.stringify(continuation)
      if (seenContinuations.has(key)) throw new Error('Pagination API bloquée : continuation répétée.')
      seenContinuations.add(key)
    }
  } while (continuation)
  if (!files.size) throw new Error('La catégorie ne contient aucune image ; aucun manifeste remplacé.')
  const sorted = [...files.values()].sort((a, b) => a.filename.localeCompare(b.filename, 'en'))
  if (new Set(sorted.map((file) => file.filename.toLowerCase())).size !== sorted.length) throw new Error('Plusieurs images ont le même nom local.')
  return sorted
}

const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex')
const megabytes = (bytes) => (bytes / 1048576).toFixed(1)

async function atomicWrite(file, content) {
  await writeFile(`${file}.part`, content)
  await rename(`${file}.part`, file)
}

async function present(file, entry) {
  try {
    if ((await stat(file)).size !== entry.size) return false
    return sha1(await readFile(file)) === entry.sha1
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

async function main() {
  const opts = options()
  if (!opts) return
  let cards
  try {
    cards = JSON.parse(await readFile(path.join(ROOT, 'data/cards.json'), 'utf8'))
  } catch (err) {
    throw new Error(`Impossible de lire data/cards.json : ${err.message}. Lance « npm run fetch-cards » pour récupérer les cartes.`)
  }
  console.log(`Source : ${SOURCE}`)
  const previous = opts.associateOnly || opts.resume ? JSON.parse(await readFile(path.join(OUT, 'manifest.json'), 'utf8')) : null
  if (previous && (previous.source !== SOURCE || !Array.isArray(previous.files)
    || previous.files.some((file) => typeof file.filename !== 'string'))) throw new Error('Manifeste local invalide.')
  const { files, byCard, unmatched } = associateCards(previous ? previous.files : await inventory(), cards)
  const selected = files.slice(0, opts.limit)
  console.log(`${files.length} images (${megabytes(files.reduce((sum, f) => sum + f.size, 0))} Mo au total).`)
  console.log(`Sélection : ${selected.length} images (${megabytes(selected.reduce((sum, f) => sum + f.size, 0))} Mo).`)
  console.log(`Associations : ${files.length - unmatched.length}/${files.length} images, ${Object.keys(byCard).length} cartes distinctes.`)
  if (unmatched.length) {
    console.warn(`${unmatched.length} images sans correspondance unique ; voir unmatched dans by-card.json.`)
    process.exitCode = 1
  }
  if (opts.dryRun) return

  await mkdir(OUT, { recursive: true })
  await atomicWrite(path.join(OUT, 'manifest.json'), JSON.stringify({
    version: 2, source: SOURCE, category: CATEGORY, fetchedAt: previous?.fetchedAt ?? new Date().toISOString(),
    rights: 'Illustrations de Yu-Gi-Oh! Master Duel ; droits d’origine conservés. Voir les pages descriptionUrl.',
    files,
  }, null, 2) + '\n')
  await atomicWrite(path.join(OUT, 'by-card.json'), JSON.stringify({
    version: 1, source: SOURCE, generatedAt: new Date().toISOString(),
    pathsRelativeTo: 'data/', cards: byCard, unmatched,
  }, null, 2) + '\n')
  if (opts.associateOnly) return

  const failures = []
  let downloaded = 0
  let skipped = 0
  let bytes = 0
  let done = 0
  const queue = selected.values()
  async function worker() {
    for (const entry of queue) {
      const dest = path.join(OUT, entry.filename)
      try {
        if (await present(dest, entry)) {
          skipped++
        } else {
          const content = await request(entry.url, async (res) => {
            const buffer = Buffer.from(await res.arrayBuffer())
            if (buffer.length !== entry.size || sha1(buffer) !== entry.sha1) throw new Error('Taille ou SHA-1 différent de l’original annoncé par Yugipedia.')
            return buffer
          })
          await atomicWrite(dest, content)
          downloaded++
          bytes += content.length
        }
      } catch (err) {
        failures.push({ filename: entry.filename, url: entry.url, error: err.message })
        console.error(`${entry.filename} : ${err.message}`)
      }
      done++
      console.log(`[${done}/${selected.length}] ${entry.filename} (${downloaded} téléchargées, ${skipped} déjà présentes, ${failures.length} échecs)`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  // Ce rapport décrit la sélection de cette exécution ; un --limit ne valide pas le reste.
  await atomicWrite(path.join(OUT, 'failed.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), selected: selected.length, total: files.length, failures,
  }, null, 2) + '\n')
  console.log(`${downloaded} images téléchargées (${megabytes(bytes)} Mo), ${skipped} déjà présentes, ${failures.length} échecs. Destination : ${path.relative(ROOT, OUT)}`)
  if (failures.length) {
    console.error('Détails : data/images/master-duel-monsters/failed.json. Relancer la commande pour reprendre.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
