// Point d'accès à la base des joueurs : une seule ouverture par processus.
import { DB_FILE } from '../paths.ts'
import { SqliteStorage } from './sqlite.ts'
import type { Storage } from './types.ts'

export type { Storage } from './types.ts'

let current: SqliteStorage | null = null

/** Ouvre la base (la crée et la met à jour au besoin). Appelé une fois au démarrage du serveur. */
export function openStorage(file = DB_FILE): SqliteStorage {
  current ??= new SqliteStorage(file)
  return current
}

export function storage(): Storage {
  if (!current) throw new Error('La base des joueurs n’est pas ouverte.')
  return current
}

/** Pour les tests et les outils : une base à part (le plus souvent en mémoire ou dans un dossier temporaire). */
export const openStorageAt = (file: string): SqliteStorage => new SqliteStorage(file)
