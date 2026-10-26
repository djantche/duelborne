#!/usr/bin/env node
// Complète les noms et textes français qui manquent dans data/cards.json.
// YGOPRODeck n'a pas la traduction des cartes récentes ; Yugipedia a le texte officiel imprimé en français.
// Source : API de Yugipedia (https://yugipedia.com/api.php), quelques Ko par carte.
//
// Usage :
//   node scripts/fetch-fr.mjs         # les cartes des decks de decks/ (défaut)
//   node scripts/fetch-fr.mjs --all   # toutes les cartes sans français
//
// Les traductions trouvées sont gardées dans data/fr-extra.json, que fetch-cards.mjs réapplique à chaque
// passage. Le script est relançable : ce qui est déjà traduit n'est pas redemandé.

import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CARDS = path.join(ROOT, 'data', 'cards.json')
const EXTRA = path.join(ROOT, 'data', 'fr-extra.json')
const DECKS = path.join(ROOT, 'decks')

const API = 'https://yugipedia.com/api.php'
// L'API accepte 50 titres par requête pour un visiteur anonyme, et on en demande deux par carte.
const BATCH = 25
const DELAY_MS = 1200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const all = process.argv.includes('--all')

async function fetchJson(url, retries = 3) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'duelborne/0.1 (jeu libre non commercial ; github.com/djantche/duelborne)' }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt >= retries) throw new Error(`${url.slice(0, 90)}… -> ${err.message}`)
      await sleep(2000 * 2 ** attempt)
    }
  }
}

/** Valeur d'un champ du modèle de carte (`| nom = valeur`, la valeur peut tenir sur plusieurs lignes). */
function field(wikitext, name) {
  const m = wikitext.match(new RegExp(`^\\|\\s*${name}\\s*=[ \\t]*([\\s\\S]*?)(?=^\\||^\\}\\})`, 'm'))
  return m ? m[1].trim() : ''
}

/** Texte wiki -> texte simple : liens, gras et italique, retours à la ligne. */
function plain(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\{Ruby\|([^|}]*)\|[^}]*\}\}/g, '$1')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

/** Nom et texte français d'une page de carte, au format des textes de YGOPRODeck. */
function french(wikitext) {
  const name = plain(field(wikitext, 'fr_name'))
  const text = plain(field(wikitext, 'fr_text'))
  const pendulum = plain(field(wikitext, 'fr_pendulum_effect'))
  const desc = pendulum && text ? `[ Effet Pendule ]\n${pendulum}\n----------------------------------------\n[ Effet de Monstre ]\n${text}` : text
  return { name: name || null, desc: desc || null }
}

async function deckIds() {
  const ids = new Set()
  for (const file of await readdir(DECKS)) {
    if (!file.endsWith('.ydk')) continue
    for (const line of (await readFile(path.join(DECKS, file), 'utf8')).split('\n')) if (/^\d+$/.test(line.trim())) ids.add(Number(line.trim()))
  }
  return ids
}

async function main() {
  if (!existsSync(CARDS)) {
    console.error('data/cards.json est introuvable : lance d’abord « npm run fetch-cards ».')
    process.exit(1)
  }
  const cards = JSON.parse(await readFile(CARDS, 'utf8'))
  const extra = existsSync(EXTRA) ? JSON.parse(await readFile(EXTRA, 'utf8')) : {}
  const wanted = all ? null : await deckIds()
  const todo = cards.filter((c) => (!c.name.fr || !c.desc.fr) && !extra[c.id] && (!wanted || wanted.has(c.id)))
  console.log(`${todo.length} cartes sans français à chercher${all ? '' : ' (cartes des decks)'}.`)

  let found = 0
  // Un nom de carte peut désigner autre chose sur le wiki (un tome, un personnage) : la page de la carte
  // s'appelle alors « Nom (card) ». On demande les deux titres.
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const titles = batch.flatMap((c) => [c.name.en, `${c.name.en} (card)`])
    const url = `${API}?action=query&format=json&redirects=1&prop=revisions&rvprop=content&titles=${encodeURIComponent(titles.join('|'))}`
    const body = await fetchJson(url)
    // On retrouve chaque carte par son numéro (« password »), plus sûr que le titre de la page.
    const byId = new Map()
    for (const page of Object.values(body.query?.pages ?? {})) {
      const wikitext = page.revisions?.[0]?.['*'] ?? ''
      const id = Number(field(wikitext, 'password'))
      if (id) byId.set(id, french(wikitext))
    }
    for (const c of batch) {
      const fr = byId.get(c.id)
      if (!fr?.name && !fr?.desc) continue
      extra[c.id] = fr
      found++
    }
    process.stdout.write(`\r${Math.min(i + BATCH, todo.length)}/${todo.length} (trouvées : ${found})   `)
    await writeFile(EXTRA, JSON.stringify(extra, null, 1))
    if (i + BATCH < todo.length) await sleep(DELAY_MS)
  }
  if (todo.length) process.stdout.write('\n')

  let applied = 0
  for (const c of cards) {
    const fr = extra[c.id]
    if (!fr) continue
    if (!c.name.fr && fr.name) c.name.fr = fr.name
    if (!c.desc.fr && fr.desc) c.desc.fr = fr.desc
    applied++
  }
  await writeFile(CARDS, JSON.stringify(cards))
  const left = todo.filter((c) => !extra[c.id])
  console.log(`-> data/cards.json : ${applied} cartes complétées en français.`)
  if (left.length) console.log(`Sans traduction trouvée (${left.length}) : ${left.map((c) => c.name.en).join(', ')}`)
  console.log('Relance le serveur pour qu’il relise les noms.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
