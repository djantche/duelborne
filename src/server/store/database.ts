// Ouverture de la base SQLite des joueurs, migrations versionnées et sauvegardes.
//
// SQLite (module intégré à Node : `node:sqlite`) tient dans un seul fichier, sans processus à installer. Le reste du
// serveur ne parle pas à ce fichier : il passe par l'interface Storage (store/types.ts), que PostgreSQL pourra implémenter.
import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from './migrations.ts'

export type Db = DatabaseSync

/** Version de schéma que ce programme sait lire. */
export const SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0

/** Dossier des sauvegardes automatiques, à côté de la base. */
export const backupDir = (file: string): string => path.join(path.dirname(file), 'sauvegardes')

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)

/** Copie cohérente de la base ouverte (même pendant que des écritures ont lieu). Renvoie le fichier créé. */
export function backupTo(db: Db, dest: string): string {
  mkdirSync(path.dirname(dest), { recursive: true })
  if (existsSync(dest)) throw new Error(`Le fichier existe déjà : ${dest}`)
  db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`)
  return dest
}

/** Garde les `keep` sauvegardes automatiques les plus récentes d'un dossier. */
function prune(dir: string, keep: number): void {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - keep))) unlinkSync(path.join(dir, f))
}

/** Sauvegarde nommée (avant une migration, avant une restauration, à la demande). */
export function backupNamed(db: Db, file: string, why: string): string {
  const dir = backupDir(file)
  const dest = backupTo(db, path.join(dir, `duel-lan_${stamp()}_${why}.sqlite`))
  prune(dir, 30)
  return dest
}

export function schemaVersion(db: Db): number {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get()
  if (!row) return 0
  return (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0
}

/** Exécute `fn` dans une transaction : tout ou rien. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

/** Ouvre (et crée au besoin) la base, puis applique les migrations en attente, après une sauvegarde si la base existait déjà. */
export function openDatabase(file: string): { db: Db; migrated: { from: number; to: number; backup: string | null } } {
  mkdirSync(path.dirname(file), { recursive: true })
  const existed = existsSync(file) && statSync(file).size > 0
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)')
  const from = schemaVersion(db)
  // Une base écrite par une version plus récente du jeu ne doit pas être modifiée par une version plus ancienne.
  if (from > SCHEMA_VERSION) {
    db.close()
    throw new Error(`La base ${file} est en version ${from}, ce programme ne connaît que la version ${SCHEMA_VERSION}. Mets le jeu à jour, ou restaure une sauvegarde plus ancienne.`)
  }
  const pending = MIGRATIONS.filter((m) => m.version > from)
  let backup: string | null = null
  if (pending.length && existed && from > 0) backup = backupNamed(db, file, `avant-v${pending.at(-1)?.version}`)
  for (const m of pending) {
    transaction(db, () => {
      m.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now())
    })
  }
  return { db, migrated: { from, to: SCHEMA_VERSION, backup } }
}

/**
 * Remplace la base par une sauvegarde (le serveur doit être arrêté). L'ancienne base est gardée à côté, jamais supprimée.
 * Renvoie le fichier où l'ancienne base a été rangée, ou null s'il n'y en avait pas.
 */
export function restoreFrom(file: string, backup: string): string | null {
  if (!existsSync(backup)) throw new Error(`Sauvegarde introuvable : ${backup}`)
  // On vérifie que la sauvegarde est lisible et pas plus récente que ce programme, avant d'y toucher.
  const probe = new DatabaseSync(backup, { readOnly: true })
  try {
    const check = probe.prepare('PRAGMA integrity_check').get() as { integrity_check: string }
    if (check.integrity_check !== 'ok') throw new Error(`La sauvegarde est abîmée : ${check.integrity_check}`)
    const version = schemaVersion(probe)
    if (version > SCHEMA_VERSION) throw new Error(`La sauvegarde est en version ${version}, plus récente que ce programme (${SCHEMA_VERSION}).`)
  } finally {
    probe.close()
  }
  let kept: string | null = null
  mkdirSync(path.dirname(file), { recursive: true })
  if (existsSync(file)) {
    kept = path.join(path.dirname(file), `${path.basename(file, '.sqlite')}.avant-restauration_${stamp()}.sqlite`)
    renameSync(file, kept)
    for (const suffix of ['-wal', '-shm']) if (existsSync(file + suffix)) unlinkSync(file + suffix)
  }
  copyFileSync(backup, file)
  return kept
}
