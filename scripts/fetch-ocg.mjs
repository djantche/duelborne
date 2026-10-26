#!/usr/bin/env node
// Télécharge ce dont le moteur de règles ocgcore a besoin, dans data/ocg/ (ignoré par git) :
//   - CardScripts : un script Lua par carte (les effets), licence AGPL-3.0
//   - BabelCDB    : la base de cartes d'EDOPro (SQLite)
//   - strings.conf : les textes système du moteur (« Choisissez une carte à détruire »...)
// Relancer le script met à jour les dépôts. Nécessite git.
//
// Usage : npm run fetch-ocg
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OCG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/ocg')
const REPOS = {
  CardScripts: 'https://github.com/ProjectIgnis/CardScripts.git',
  BabelCDB: 'https://github.com/ProjectIgnis/BabelCDB.git',
}
const STRINGS = 'https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/strings.conf'

// Délais de garde : une connexion qui se fige ne doit pas bloquer le script indéfiniment.
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit', timeout: 10 * 60_000 })

await mkdir(OCG, { recursive: true })
for (const [name, url] of Object.entries(REPOS)) {
  const dir = path.join(OCG, name)
  if (existsSync(path.join(dir, '.git'))) {
    console.log(`[${name}] mise à jour...`)
    git(['pull', '--depth', '1', '--ff-only', '-q'], dir)
  } else {
    console.log(`[${name}] téléchargement...`)
    git(['clone', '--depth', '1', '-q', url, dir])
  }
}

console.log('[strings.conf] téléchargement...')
const res = await fetch(STRINGS, { signal: AbortSignal.timeout(60_000) })
if (!res.ok) throw new Error(`strings.conf : HTTP ${res.status}`)
await writeFile(path.join(OCG, 'strings.conf'), await res.text())
console.log('Terminé : data/ocg est prêt.')
