#!/usr/bin/env node
// Complète les noms et textes français de data/cards.json avec la base française d'EDOPro (data/ocg/cards.fr.cdb, téléchargée par
// `npm run fetch-fr-cdb`). Aucun téléchargement : tout vient de fichiers déjà présents.
//
// Deux cas sont traités :
//   - une carte sans nom ou sans texte français (cartes récentes, Jetons, cartes que YGOPRODeck n'a pas traduites) ;
//   - un monstre Pendule dont le texte est mi-anglais, mi-français : YGOPRODeck traduit l'effet de monstre mais laisse
//     « [ Pendulum Effect ] » en anglais.
// Les traductions sont aussi gardées dans data/fr-extra.json, que fetch-cards.mjs réapplique à chaque passage (le français de YGOPRODeck
// ne l'emporte que s'il est complet).
//
// Usage : node scripts/fill-fr-cdb.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CARDS = path.join(ROOT, 'data/cards.json')
const EXTRA = path.join(ROOT, 'data/fr-extra.json')
const MANUAL = path.join(ROOT, 'data/fr-manual.json')
const CDB = path.join(ROOT, 'data/ocg/cards.fr.cdb')

for (const f of [CARDS, CDB]) {
  if (!existsSync(f)) {
    console.error(`${path.relative(ROOT, f)} est introuvable : lance « npm run fetch-cards » puis « npm run fetch-fr-cdb ».`)
    process.exit(1)
  }
}

/** Texte à moitié anglais : la section Pendule est restée en anglais. */
export const isMixed = (desc) => /\[ Pendulum Effect \]/.test(desc ?? '')

/** Texte de la base EDOPro → format de data/cards.json : retours à la ligne simples, sans la ligne « Échelle Pendule = N » (l'échelle est un champ à part). */
export function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^Échelle Pendule\s*=\s*\d+\s*\n/, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

const db = new DatabaseSync(CDB, { readOnly: true })
const texts = new Map(db.prepare('SELECT id, name, desc FROM texts').all().map((r) => [Number(r.id), r]))
db.close()

const cards = JSON.parse(readFileSync(CARDS, 'utf8'))
const extra = existsSync(EXTRA) ? JSON.parse(readFileSync(EXTRA, 'utf8')) : {}
let names = 0
let descs = 0
let fixed = 0
for (const c of cards) {
  const fr = texts.get(c.id)
  if (!fr) continue
  const entry = {}
  if (!c.name.fr && fr.name && fr.name !== c.name.en) entry.name = fr.name.trim()
  const text = fr.desc ? normalize(fr.desc) : ''
  const usable = text && text !== c.desc.en && !isMixed(text)
  if (usable && (!c.desc.fr || isMixed(c.desc.fr))) entry.desc = text
  if (!entry.name && !entry.desc) continue
  if (entry.name) { c.name.fr = entry.name; names++ }
  if (entry.desc) {
    if (c.desc.fr) fixed++
    else descs++
    c.desc.fr = entry.desc
  }
  extra[c.id] = { ...extra[c.id], ...entry }
}
// Traductions écrites à la main, pour les cartes que personne n'a traduites (data/fr-manual.json : { "id": { "name", "desc" } }).
let manualCount = 0
if (existsSync(MANUAL)) {
  const manual = JSON.parse(readFileSync(MANUAL, 'utf8'))
  for (const c of cards) {
    const m = manual[c.id]
    if (!m) continue
    const entry = {}
    if (!c.name.fr && m.name) entry.name = m.name
    if (!c.desc.fr && m.desc) entry.desc = m.desc
    if (!entry.name && !entry.desc) continue
    if (entry.name) c.name.fr = entry.name
    if (entry.desc) c.desc.fr = entry.desc
    extra[c.id] = { ...extra[c.id], ...entry }
    manualCount++
  }
}
writeFileSync(CARDS, JSON.stringify(cards))
writeFileSync(EXTRA, JSON.stringify(extra, null, 1))

const missing = cards.filter((c) => !c.name.fr || !c.desc.fr)
const mixed = cards.filter((c) => isMixed(c.desc.fr))
console.log(`${names} noms et ${descs} textes ajoutés, ${fixed} textes Pendule mi-anglais corrigés, ${manualCount} cartes complétées à la main.`)
console.log(`Reste sans français : ${missing.length} cartes (${missing.filter((c) => c.name.fr).length} avec nom seulement) ; textes encore mi-anglais : ${mixed.length}.`)
