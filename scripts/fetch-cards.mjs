#!/usr/bin/env node
// Télécharge toutes les cartes Yu-Gi-Oh! (EN + FR) et leurs images pour jouer 100% hors ligne.
// Source : API YGOPRODeck (https://ygoprodeck.com/api-guide/)
//
// Usage :
//   node scripts/fetch-cards.mjs                 # données + images small + cropped (défaut)
//   node scripts/fetch-cards.mjs --size=cropped  # seulement l'illustration recadrée
//   node scripts/fetch-cards.mjs --size=all      # small + cropped + full (~1,5 Go)
//   node scripts/fetch-cards.mjs --no-images     # JSON seulement
//   node scripts/fetch-cards.mjs --refresh       # re-télécharge les JSON même s'ils existent
//
// Le script est relançable : les images déjà présentes sont ignorées.

import { mkdir, writeFile, readFile, stat, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const RAW_DIR = path.join(DATA_DIR, 'raw')
const IMG_DIR = path.join(DATA_DIR, 'images')

const API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const IMG_BASE = 'https://images.ygoprodeck.com/images'

// Dossier d'images par taille -> sous-chemin côté serveur d'images
const SIZES = { small: 'cards_small', full: 'cards', cropped: 'cards_cropped' }

const args = new Set(process.argv.slice(2))
const sizeArg = [...args].find((a) => a.startsWith('--size='))?.split('=')[1] ?? 'small,cropped'
const sizes = sizeArg === 'all' ? Object.keys(SIZES) : sizeArg.split(',')
const withImages = !args.has('--no-images')
const refresh = args.has('--refresh')

if (!sizes.every((s) => s in SIZES)) {
  console.error(`--size invalide : ${sizeArg} (small | full | cropped, séparés par des virgules, ou all)`)
  process.exit(1)
}

// Reste poli avec l'API : peu de requêtes en parallèle, petite pause entre chacune.
const CONCURRENCY = 4
const DELAY_MS = 120
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchRetry(url, { retries = 4, json = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'duelborne-local/1.0 (usage perso, non commercial)' } })
      if (res.status === 429) throw new Error('429 rate limit')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return json ? await res.json() : Buffer.from(await res.arrayBuffer())
    } catch (err) {
      // 404 : l'image n'existe pas côté serveur (cartes Skill, cartes très récentes), inutile d'insister.
      if (attempt >= retries || err.message === 'HTTP 404') throw new Error(`${url} -> ${err.message}`)
      await sleep(1000 * 2 ** attempt)
    }
  }
}

async function loadRaw(lang) {
  const file = path.join(RAW_DIR, `cards.${lang}.json`)
  if (!refresh && existsSync(file)) {
    console.log(`[${lang}] cache trouvé : ${path.relative(ROOT, file)}`)
    return JSON.parse(await readFile(file, 'utf8')).data
  }
  const url = lang === 'en' ? API : `${API}?language=${lang}`
  console.log(`[${lang}] téléchargement des données...`)
  const body = await fetchRetry(url, { json: true })
  await writeFile(file, JSON.stringify(body))
  console.log(`[${lang}] ${body.data.length} cartes`)
  return body.data
}

function merge(en, fr, extra) {
  const frById = new Map(fr.map((c) => [c.id, c]))
  return en.map((c) => {
    // Le français de YGOPRODeck d'abord ; à défaut (ou si son texte Pendule est resté à moitié en anglais), celui que
    // fetch-fr.mjs et fill-fr-cdb.mjs ont trouvé ailleurs.
    const f = frById.get(c.id)
    const x = extra[c.id]
    const complete = f?.desc && !/\[ Pendulum Effect \]/.test(f.desc)
    return {
      id: c.id,
      name: { en: c.name, fr: f?.name ?? x?.name ?? null },
      desc: { en: c.desc, fr: (complete ? f.desc : (x?.desc ?? f?.desc)) ?? null },
      type: c.type,
      humanReadableCardType: c.humanReadableCardType,
      frameType: c.frameType,
      race: c.race,
      attribute: c.attribute ?? null,
      atk: c.atk ?? null,
      def: c.def ?? null,
      level: c.level ?? null,
      linkval: c.linkval ?? null,
      linkmarkers: c.linkmarkers ?? null,
      scale: c.scale ?? null,
      archetype: c.archetype ?? null,
      // chemins relatifs à data/ : utilisables tels quels par le client
      images: Object.fromEntries(
        Object.keys(SIZES)
          .filter((s) => sizes.includes(s) || existsSync(path.join(IMG_DIR, s)))
          .map((s) => [s, `images/${s}/${c.id}.jpg`]),
      ),
    }
  })
}

async function downloadImages(cards) {
  const jobs = []
  for (const size of sizes) {
    await mkdir(path.join(IMG_DIR, size), { recursive: true })
    for (const c of cards) jobs.push({ size, id: c.id })
  }

  let done = 0
  let skipped = 0
  const failed = []
  const total = jobs.length
  const queue = [...jobs]

  async function worker() {
    while (queue.length) {
      const { size, id } = queue.shift()
      const dest = path.join(IMG_DIR, size, `${id}.jpg`)
      try {
        if (existsSync(dest) && (await stat(dest)).size > 0) {
          skipped++
        } else {
          const buf = await fetchRetry(`${IMG_BASE}/${SIZES[size]}/${id}.jpg`)
          // écriture atomique pour éviter les fichiers tronqués si on coupe le script
          await writeFile(`${dest}.part`, buf)
          await rename(`${dest}.part`, dest)
          await sleep(DELAY_MS)
        }
      } catch (err) {
        failed.push({ size, id, error: err.message })
      }
      done++
      if (done % 250 === 0 || done === total) {
        process.stdout.write(`\r[images] ${done}/${total} (déjà présentes : ${skipped}, échecs : ${failed.length})   `)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stdout.write('\n')
  return failed
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })

  const en = await loadRaw('en')
  const fr = await loadRaw('fr')
  const extraFile = path.join(DATA_DIR, 'fr-extra.json')
  const extra = existsSync(extraFile) ? JSON.parse(await readFile(extraFile, 'utf8')) : {}
  const cards = merge(en, fr, extra)

  const out = path.join(DATA_DIR, 'cards.json')
  await writeFile(out, JSON.stringify(cards))
  const missingFr = cards.filter((c) => !c.name.fr).length
  console.log(`-> ${path.relative(ROOT, out)} : ${cards.length} cartes (${missingFr} sans nom FR, fallback EN)`)
  if (missingFr) console.log('   « npm run fetch-fr » va chercher le français des cartes des decks qui en manquent.')

  if (withImages) {
    const failed = await downloadImages(cards)
    if (failed.length) {
      const f = path.join(DATA_DIR, 'failed-images.json')
      await writeFile(f, JSON.stringify(failed, null, 2))
      console.warn(`${failed.length} images en échec, détail dans ${path.relative(ROOT, f)}. Relance le script pour réessayer.`)
    } else {
      console.log('Toutes les images sont en local.')
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
