// Base des joueurs (comptes, decks, historique, tournois) : sauvegarde, liste des sauvegardes, restauration.
//
//   npm run db:backup                     copie de sécurité de la base (dans save/sauvegardes/)
//   npm run db:list                       sauvegardes disponibles
//   npm run db:restore -- <fichier>       remplace la base par une sauvegarde (le serveur doit être ARRÊTÉ)
//
// DUEL_SAVE_DIR déplace le dossier de la base.
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { backupDir, restoreFrom } from '../../src/server/store/database.ts'
import { DB_FILE } from '../../src/server/paths.ts'
import { SqliteStorage } from '../../src/server/store/sqlite.ts'

const [command, arg] = process.argv.slice(2)

function list(): string[] {
  const dir = backupDir(DB_FILE)
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort().map((f) => path.join(dir, f)) : []
}

if (command === 'backup') {
  if (!existsSync(DB_FILE)) throw new Error(`Aucune base à sauvegarder (${DB_FILE}).`)
  const store = new SqliteStorage(DB_FILE)
  console.log(`Sauvegarde créée : ${store.backup('manuelle')}`)
  store.close()
} else if (command === 'list') {
  const files = list()
  if (!files.length) console.log('Aucune sauvegarde.')
  for (const f of files) console.log(`${(statSync(f).size / 1024).toFixed(0).padStart(7)} Ko  ${f}`)
} else if (command === 'restore') {
  if (!arg) throw new Error('Indique la sauvegarde à restaurer : npm run db:restore -- <fichier> (npm run db:list pour les voir).')
  const file = path.resolve(arg)
  const kept = restoreFrom(DB_FILE, file)
  console.log(`Base restaurée depuis ${file}.${kept ? ` L’ancienne base est gardée : ${kept}` : ''}`)
} else {
  console.log('Usage : node tools/db/db.ts backup | list | restore <fichier>')
  process.exitCode = 1
}
