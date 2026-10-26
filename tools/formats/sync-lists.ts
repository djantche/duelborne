// Synchronise les listes : TCG et OCG depuis la liste officielle de Konami (EDOPro en secours), GOAT depuis EDOPro (ProjectIgnis/LFLists).
//
//   node tools/formats/sync-lists.ts           # écrit dans data/formats/ (hors dépôt), prioritaire sur les instantanés livrés
//   node tools/formats/sync-lists.ts --ja      # télécharge d'abord la base japonaise (liste OCG officielle de Konami)
//   node tools/formats/sync-lists.ts --ship    # écrit dans src/server/formats/lists/ (instantanés livrés avec le jeu, à versionner)
//
// Une liste importée à la main et vérifiée (import-list.ts --verified) n'est jamais remplacée. Le serveur fait la même synchronisation
// à son démarrage quand les listes ont plus de 7 jours (DUEL_NO_SYNC=1 l'en empêche).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadData } from '../../src/server/ocg/data.ts'
import { JA_CDB, JA_CDB_URL } from '../../src/server/formats/official.ts'
import { syncLists } from '../../src/server/formats/sync.ts'

// La liste OCG officielle est en japonais : sa base de noms (≈ 12 Mo, hors dépôt) est téléchargée une fois (--ja ou à la première synchronisation demandée ainsi).
if (process.argv.includes('--ja') && !existsSync(JA_CDB)) {
  console.log('Téléchargement de la base japonaise des cartes (≈ 12 Mo)…')
  const res = await fetch(JA_CDB_URL, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  mkdirSync(path.dirname(JA_CDB), { recursive: true })
  writeFileSync(JA_CDB, Buffer.from(await res.arrayBuffer()))
}
// Les cartes sont lues pour rapprocher les codes des listes de ceux du jeu (aliases, noms).
loadData()
const dir = process.argv.includes('--ship') ? path.resolve(import.meta.dirname, '../../src/server/formats/lists') : undefined
const results = await syncLists(dir ? { dir } : {})
for (const r of results) console.log(`${r.status === 'updated' ? '✓' : r.status === 'kept' ? '=' : '✗'} ${r.id.padEnd(5)} ${r.detail}`)
if (results.some((r) => r.status === 'failed')) process.exitCode = 1
