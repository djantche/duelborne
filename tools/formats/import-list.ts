// Importe une liste de format (interdictions ou points) dans data/formats/, où elle remplace l'instantané livré avec le jeu.
//
//   Liste d'interdictions d'un fichier lflist.conf (EDOPro / YGOPro) :
//     node tools/formats/import-list.ts lflist <lflist.conf> --list "2025.04 TCG" --format tcg --region TCG --version 2025-04-01 --source "ProjectIgnis/LFLists" [--verified]
//   Barème de points (Genesys) : un fichier « code;points » ou « code,points » par ligne :
//     node tools/formats/import-list.ts points <points.csv> --format genesys --cap 100 --version 2025-09-01 --source "Konami, barème officiel" [--verified]
//   Voir les en-têtes d'un lflist.conf :
//     node tools/formats/import-list.ts headers <lflist.conf>
//
// --verified est à ajouter SEULEMENT si tu as vérifié la liste (et sa date) contre la source officielle : le jeu affiche alors le format
// comme fiable. Sans lui, il reste « non vérifié ».
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { FORMAT_IDS } from '../../src/shared/formats.ts'
import type { FormatId } from '../../src/shared/formats.ts'
import { FORMATS_DIR } from '../../src/server/paths.ts'
import type { ListFile } from '../../src/server/formats/catalog.ts'

const args = process.argv.slice(2)
const [command, file] = args
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const has = (name: string): boolean => args.includes(`--${name}`)
const fail = (message: string): never => {
  console.error(`Erreur : ${message}`)
  process.exit(1)
}

if (!command || !file) fail('Usage : node tools/formats/import-list.ts lflist|points|headers <fichier> [options] (voir l’en-tête du script).')
const text = readFileSync(path.resolve(file as string), 'utf8')

/** Les listes d'un lflist.conf : « !nom », puis des lignes « code limite --commentaire ». */
function lflist(): Map<string, Record<string, number>> {
  const lists = new Map<string, Record<string, number>>()
  let current: Record<string, number> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('!')) lists.set(line.slice(1).trim(), (current = {}))
    else if (current && /^\d+\s+\d+/.test(line)) {
      const [code, limit] = line.split(/\s+/) as [string, string]
      current[code] = Number(limit)
    }
  }
  return lists
}

function write(list: ListFile): void {
  mkdirSync(FORMATS_DIR, { recursive: true })
  const out = path.join(FORMATS_DIR, `${list.id}.json`)
  writeFileSync(out, JSON.stringify(list, null, 1) + '\n')
  console.log(`Liste écrite : ${out} (${list.verified ? 'vérifiée' : 'NON vérifiée'}). Relance le serveur pour la charger.`)
}

function formatId(): FormatId {
  const id = flag('format') as FormatId | undefined
  if (!id || !FORMAT_IDS.includes(id) || id === 'casual') return fail(`--format doit être l'un de : ${FORMAT_IDS.filter((f) => f !== 'casual').join(', ')}`)
  return id
}

if (command === 'headers') {
  for (const [name, entries] of lflist()) console.log(`${name}  (${Object.keys(entries).length} cartes)`)
} else if (command === 'lflist') {
  const id = formatId()
  const wanted = flag('list') ?? fail('--list "<en-tête>" manque (node tools/formats/import-list.ts headers <fichier> pour les voir).')
  const limits = lflist().get(wanted as string) ?? fail(`aucune liste « ${wanted} » dans ce fichier.`)
  // Dans un lflist.conf, 0 = interdite, 1 = limitée, 2 = semi-limitée ; 3 (illimitée) n'a pas besoin d'être écrite.
  const kept = Object.fromEntries(Object.entries(limits).filter(([, n]) => n >= 0 && n <= 2))
  const region = flag('region')
  write({ id, kind: 'limits', region: region === 'TCG' || region === 'OCG' ? region : null, version: flag('version') ?? null, source: flag('source') ?? `lflist.conf, liste « ${wanted} »`, verified: has('verified'), limits: kept })
} else if (command === 'points') {
  const id = formatId()
  const points: Record<string, number> = {}
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*[;,\t ]\s*(\d+(?:\.\d+)?)\s*$/.exec(raw)
    if (m) points[m[1] as string] = Number(m[2])
  }
  if (!Object.keys(points).length) fail('aucune ligne « code;points » reconnue.')
  write({ id, kind: 'points', region: null, version: flag('version') ?? null, source: flag('source') ?? 'fichier importé', verified: has('verified'), cap: Number(flag('cap') ?? 100), points })
} else fail(`commande inconnue : ${command}`)
