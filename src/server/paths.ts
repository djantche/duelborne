import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '../..')
export const DATA_DIR = path.join(ROOT, 'data')
export const OCG_DIR = path.join(DATA_DIR, 'ocg')
export const DECKS_DIR = path.join(ROOT, 'decks')
/** Decks créés par les joueurs (survivent aux redémarrages, ignorés par git). */
export const USER_DECKS_DIR = path.join(DECKS_DIR, 'user')
/** Données des joueurs (comptes, decks, historique) : base SQLite et sauvegardes. Ignoré par git. DUEL_SAVE_DIR le déplace. */
export const SAVE_DIR = process.env.DUEL_SAVE_DIR ? path.resolve(process.env.DUEL_SAVE_DIR) : path.join(ROOT, 'save')
// Nom d'avant Duelborne, gardé : les bases et sauvegardes existantes restent trouvées.
export const DB_FILE = path.join(SAVE_DIR, 'duel-lan.sqlite')
/** Listes de formats importées (hors dépôt) : npm run sync-lists ou tools/formats/import-list.ts. */
export const FORMATS_DIR = path.join(DATA_DIR, 'formats')
