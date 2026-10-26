// Migration unique des decks créés avant les comptes (decks/user/*.ydk) vers la base.
//
// - Une copie du dossier est faite avant toute chose (decks/user.avant-comptes-<date>/).
// - Rien n'est supprimé ni modifié dans decks/user/.
// - Les brouillons sont conservés tels quels, et aucune carte n'est écartée (un contenu n'est jamais perdu en silence).
// - Les noms en double (sans tenir compte des majuscules) reçoivent un numéro, au lieu d'en perdre un.
// - Les decks n'ont pas de propriétaire : le premier compte de l'hôte peut les récupérer (DeckService.claimLegacy).
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { slug } from '../ocg/decks.ts'
import { USER_DECKS_DIR } from '../paths.ts'
import type { DeckRecord, Storage } from '../store/types.ts'

const KEY = 'legacy_decks_imported'

/** Lit un .ydk sans rien écarter. */
function readYdk(text: string): { name: string | null; series: string | null; cover: number; main: number[]; extra: number[] } {
  const meta: Record<string, string> = {}
  const main: number[] = []
  const extra: number[] = []
  let section: number[] | null = main
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '#main') section = main
    else if (line === '#extra') section = extra
    else if (line.startsWith('!side')) section = null
    else if (/^\d+$/.test(line)) section?.push(Number(line))
    else {
      const m = /^#(\w+):\s*(.+)$/.exec(line)
      if (m) meta[m[1] as string] = m[2] as string
    }
  }
  return { name: meta.name ?? null, series: meta.series ?? null, cover: Number(meta.cover) || 0, main, extra }
}

export interface LegacyReport {
  found: number
  imported: number
  renamed: number
  backup: string | null
}

export function importLegacyDecks(store: Storage, dir = USER_DECKS_DIR, now = Date.now()): LegacyReport | null {
  if (store.meta.get(KEY)) return null
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.ydk')).sort() : []
  if (!files.length) {
    store.meta.set(KEY, JSON.stringify({ at: now, found: 0 }))
    return null
  }
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const backup = `${dir}.avant-comptes-${stamp}`
  if (!existsSync(backup)) cpSync(dir, backup, { recursive: true })
  const report: LegacyReport = { found: files.length, imported: 0, renamed: 0, backup }
  store.transaction(() => {
    for (const f of files) {
      const id = path.basename(f, '.ydk')
      const parsed = readYdk(readFileSync(path.join(dir, f), 'utf8'))
      let name = (parsed.name ?? id).trim().slice(0, 40) || id
      for (let n = 2; store.decks.nameTaken(null, name); n++) name = `${(parsed.name ?? id).trim().slice(0, 34)} (${n})`
      if (name !== (parsed.name ?? id).trim().slice(0, 40)) report.renamed++
      // L'identifiant d'origine est gardé : l'atelier du navigateur peut y faire référence.
      const key = store.decks.byId(id) ? `user-${slug(name)}-${Math.abs(now) % 100000}` : id
      const record: DeckRecord = { id: key, userId: null, name, series: parsed.series ?? 'Mes decks', cover: parsed.cover, main: parsed.main, extra: parsed.extra, createdAt: now, updatedAt: now }
      store.decks.save(record)
      report.imported++
    }
    store.meta.set(KEY, JSON.stringify({ at: now, ...report }))
  })
  return report
}
