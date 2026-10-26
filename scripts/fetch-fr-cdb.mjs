#!/usr/bin/env node
// Télécharge les textes français dont le moteur a besoin, dans data/ocg/ (ignoré par git) :
//   - cards.fr.cdb    : la base de cartes en français (mycard/ygopro-database), dont les libellés des effets
//                       (« Activer 1 de ces effets », « Ajouter à la main »...) que le moteur propose au joueur
//   - strings.fr.conf : les textes système d'EDOPro en français (« Choisissez une carte à détruire »,
//                       noms des compteurs...)
// Relancer le script remplace les fichiers. Environ 10 Mo en tout.
//
// Usage : npm run fetch-fr-cdb
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OCG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/ocg')
const FILES = {
  'cards.fr.cdb': 'https://raw.githubusercontent.com/mycard/ygopro-database/master/locales/fr-FR/cards.cdb',
  'strings.fr.conf': 'https://raw.githubusercontent.com/ProjectIgnis/Distribution/master/config/languages/Fran%C3%A7ais/strings.conf',
}

await mkdir(OCG, { recursive: true })
for (const [name, url] of Object.entries(FILES)) {
  console.log(`[${name}] téléchargement...`)
  const res = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`${name} : HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  // Écriture puis renommage : un téléchargement interrompu ne laisse pas un fichier tronqué.
  const file = path.join(OCG, name)
  await writeFile(`${file}.part`, bytes)
  await rename(`${file}.part`, file)
  console.log(`  ${(bytes.length / 1048576).toFixed(1)} Mo`)
}
console.log('Terminé : textes français prêts dans data/ocg.')
