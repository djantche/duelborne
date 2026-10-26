#!/usr/bin/env node
// Liste les libellés d'effets des cartes de decks/ qui n'ont pas encore de traduction dans
// src/server/ocg/labels.fr.json (gabarit anglais → gabarit français, noms entre guillemets remplacés par {0}, {1}...).
// À relancer après avoir ajouté un deck : chaque ligne affichée est une entrée à ajouter au fichier.
//
// Usage : node scripts/check-labels.mjs
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CDB = path.join(ROOT, 'data/ocg/BabelCDB')
const known = JSON.parse(readFileSync(path.join(ROOT, 'src/server/ocg/labels.fr.json'), 'utf8'))

const ids = new Set()
for (const f of readdirSync(path.join(ROOT, 'decks'))) for (const line of readFileSync(path.join(ROOT, 'decks', f), 'utf8').split('\n')) if (Number(line.trim()) > 1000) ids.add(Number(line.trim()))

const missing = new Map()
for (const file of ['cards.cdb', ...readdirSync(CDB).filter((f) => /^release-.*\.cdb$/.test(f))]) {
  const db = new DatabaseSync(path.join(CDB, file), { readOnly: true })
  for (const row of db.prepare('select * from texts').all()) {
    if (!ids.has(Number(row.id))) continue
    for (let i = 1; i <= 16; i++) {
      const text = String(row[`str${i}`] ?? '').trim()
      if (!text) continue
      let n = 0
      const template = text.replace(/"([^"]{1,80})"/g, () => `{${n++}}`)
      // Les codes de produit (« SD36 ») ne sont pas des libellés.
      if (!(template in known) && !/^[A-Z0-9]{3,5}(-JP)?$/.test(template)) missing.set(template, `${row.name} (${row.id})`)
    }
  }
  db.close()
}
for (const [template, card] of missing) console.log(`${JSON.stringify(template)}: "",   // ${card}`)
console.log(missing.size ? `\n${missing.size} libellé(s) à traduire.` : 'Tous les libellés des decks sont traduits.')
