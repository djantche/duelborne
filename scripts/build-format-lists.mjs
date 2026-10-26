#!/usr/bin/env node
// Extrait des listes d'interdiction (TCG, OCG, GOAT) de la copie locale des données YGOPRODeck (data/raw/cards.en.json,
// téléchargée par `npm run fetch-cards`). Aucun téléchargement : tout vient du fichier déjà présent.
//
//   node scripts/build-format-lists.mjs
//
// Écrit src/server/formats/lists/{tcg,ocg,goat}.json. Ces listes sont un instantané : YGOPRODeck ne donne ni la date officielle de la
// liste ni la réserve de cartes. Elles sont donc marquées « non vérifiées » (verified: false) et le jeu l'affiche. Pour une liste
// datée et vérifiée (tools/formats/import-list.ts).
import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data/raw/cards.en.json')
const OUT = path.join(ROOT, 'src/server/formats/lists')

if (!existsSync(RAW)) {
  console.error('data/raw/cards.en.json est absent : lance d’abord `npm run fetch-cards`.')
  process.exit(1)
}
const cards = JSON.parse(readFileSync(RAW, 'utf8')).data
const retrieved = statSync(RAW).mtime.toISOString().slice(0, 10)
const LIMIT = { Forbidden: 0, Limited: 1, 'Semi-Limited': 2 }
const LISTS = [
  { id: 'tcg', field: 'ban_tcg', region: 'TCG', label: 'liste TCG' },
  { id: 'ocg', field: 'ban_ocg', region: 'OCG', label: 'liste OCG' },
  { id: 'goat', field: 'ban_goat', region: null, label: 'liste GOAT (avril 2005)' },
]

mkdirSync(OUT, { recursive: true })
for (const list of LISTS) {
  const limits = {}
  for (const c of cards) {
    const status = c.banlist_info?.[list.field]
    if (status in LIMIT) limits[c.id] = LIMIT[status]
  }
  const sorted = Object.fromEntries(Object.entries(limits).sort(([a], [b]) => Number(a) - Number(b)))
  const file = {
    id: list.id,
    kind: 'limits',
    region: list.region,
    // La source ne donne pas la date de la liste : on garde la date à laquelle l'instantané a été pris, sans la présenter comme celle de la liste.
    version: null,
    retrievedAt: retrieved,
    source: `YGOPRODeck (champ banlist_info.${list.field}), instantané du ${retrieved}`,
    verified: false,
    limits: sorted,
  }
  writeFileSync(path.join(OUT, `${list.id}.json`), JSON.stringify(file, null, 1) + '\n')
  const n = Object.values(sorted)
  console.log(`${list.label} : ${n.length} cartes (${n.filter((v) => v === 0).length} interdites, ${n.filter((v) => v === 1).length} limitées, ${n.filter((v) => v === 2).length} semi-limitées)`)
}
