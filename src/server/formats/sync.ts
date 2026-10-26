// Synchronisation des listes de format (TCG, OCG, GOAT) avec les listes d'EDOPro (dépôt ProjectIgnis/LFLists).
//
// Un fichier lflist.conf contient la liste des interdictions (limite 0), limitations (1) et semi-limitations (2) ; une liste « $whitelist »
// (GOAT) donne en plus la réserve de cartes : toute carte absente du fichier est interdite.
// La liste obtenue n'est jamais présentée comme vérifiée : elle n'est pas comparée à la publication officielle.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { FormatId } from '../../shared/formats.ts'
import { idByEnglishName, displayId, isKnownToClient } from '../ocg/data.ts'
import { KONAMI_URL, englishLookup, japaneseLookup, matchPage, officialList, parseKonamiPage } from './official.ts'
import { FORMATS_DIR } from '../paths.ts'
import type { ListFile } from './catalog.ts'

export const LFLIST_BASE = 'https://raw.githubusercontent.com/ProjectIgnis/LFLists/master/'
export const LFLIST_SOURCE = 'EDOPro (ProjectIgnis/LFLists)'

/** Âge au-delà duquel le serveur redemande les listes à son démarrage. */
export const STALE_DAYS = 7

export interface ListSource {
  id: Exclude<FormatId, 'casual' | 'genesys'>
  file: string
  region: 'TCG' | 'OCG' | null
  /** Nombre minimal de cartes à limiter : en dessous, le fichier reçu est jugé incomplet et ignoré. */
  min: number
}

export const SOURCES: readonly ListSource[] = [
  { id: 'tcg', file: '0TCG.lflist.conf', region: 'TCG', min: 100 },
  { id: 'ocg', file: 'OCG.lflist.conf', region: 'OCG', min: 100 },
  { id: 'goat', file: 'GOAT.lflist.conf', region: null, min: 30 },
]

export interface ParsedList {
  name: string
  whitelist: boolean
  /** code → limite (0, 1, 2 ou 3), telle que le fichier l'écrit. */
  entries: Map<number, number>
  /** code → nom anglais écrit en commentaire dans le fichier. */
  names: Map<number, string>
}

/** Les listes d'un lflist.conf : « !nom », éventuellement « $whitelist », puis des lignes « code limite --commentaire ». */
export function parseLflist(text: string): ParsedList[] {
  const lists: ParsedList[] = []
  let current: ParsedList | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('!')) lists.push((current = { name: line.slice(1).trim(), whitelist: false, entries: new Map(), names: new Map() }))
    else if (current && line.startsWith('$whitelist')) current.whitelist = true
    else if (current) {
      const m = /^(\d+)\s+([0-3])\b(?:\s*--([^\t]*))?/.exec(line)
      if (m) {
        current.entries.set(Number(m[1]), Number(m[2]))
        if (m[3]?.trim()) current.names.set(Number(m[1]), m[3].trim())
      }
    }
  }
  return lists
}

/** « 2026.10 TCG » → « 2026-10 » ; null si le nom ne commence pas par une date. */
export function versionOf(name: string): string | null {
  const m = /^(\d{4})\.(\d{1,2})/.exec(name.trim())
  return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}` : null
}

/** La liste la plus récente d'un fichier (les noms commencent par « année.mois »), ou la première à défaut de date. */
export function latest(lists: ParsedList[]): ParsedList | undefined {
  return [...lists].sort((a, b) => (versionOf(b.name) ?? '').localeCompare(versionOf(a.name) ?? ''))[0]
}

/**
 * Le code de la carte dans notre base. Les listes d'EDOPro citent parfois un autre code de la même carte (autre illustration, version « Goat ») :
 * on passe d'abord par les alias connus, puis par le nom anglais écrit en commentaire. Sans correspondance, le code d'origine est gardé.
 */
export function resolveCode(code: number, name?: string): number {
  const id = displayId(code)
  if (isKnownToClient(id) || !name) return id
  return idByEnglishName(name) ?? id
}

export function buildList(source: ListSource, parsed: ParsedList, retrievedAt: string): ListFile {
  const limits: Record<string, number> = {}
  const pool = new Set<number>()
  // Deux codes d'une même carte avec des limites différentes : la plus stricte l'emporte.
  const resolved = new Map<number, number>()
  for (const [code, limit] of parsed.entries) {
    const id = resolveCode(code, parsed.names.get(code))
    resolved.set(id, Math.min(resolved.get(id) ?? 3, limit))
  }
  for (const [id, limit] of [...resolved].sort((a, b) => a[0] - b[0])) {
    if (limit <= 2) limits[id] = limit
    if (parsed.whitelist && limit > 0) pool.add(id)
  }
  return {
    id: source.id,
    kind: 'limits',
    region: source.region,
    version: versionOf(parsed.name),
    retrievedAt,
    source: `${LFLIST_SOURCE}, liste « ${parsed.name} », reçue le ${retrievedAt}`,
    verified: false,
    synced: true,
    limits,
    ...(parsed.whitelist ? { pool: [...pool] } : {}),
  }
}

export interface SyncResult {
  id: FormatId
  status: 'updated' | 'kept' | 'failed'
  detail: string
}

export interface SyncOptions {
  /** Où écrire (par défaut data/formats, hors dépôt). */
  dir?: string
  /** Récupère un fichier ; remplaçable pour les essais. */
  fetchText?: (url: string) => Promise<string>
  now?: Date
}

async function download(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'duelborne/0.1 (jeu libre non commercial)' }, signal: AbortSignal.timeout(45_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** Lit un fichier de liste déjà installé, ou null. */
function installed(file: string): Partial<ListFile> | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Partial<ListFile>) : null
  } catch {
    return null
  }
}

/**
 * Télécharge les listes TCG, OCG et GOAT et les installe. Une liste vérifiée à la main (import-list --verified) n'est jamais remplacée ;
 * un fichier incomplet ou illisible laisse la liste précédente en place.
 */
export async function syncLists(options: SyncOptions = {}): Promise<SyncResult[]> {
  const dir = options.dir ?? FORMATS_DIR
  const fetchText = options.fetchText ?? download
  const day = (options.now ?? new Date()).toISOString().slice(0, 10)
  mkdirSync(dir, { recursive: true })
  const out: SyncResult[] = []
  for (const source of SOURCES) {
    const target = path.join(dir, `${source.id}.json`)
    const present = installed(target)
    if (present?.verified && !present.synced) {
      out.push({ id: source.id, status: 'kept', detail: 'liste vérifiée à la main, conservée' })
      continue
    }
    // TCG et OCG : la liste officielle de Konami d'abord ; EDOPro seulement si elle est indisponible ou incomplète.
    if (source.id === 'tcg' || source.id === 'ocg') {
      try {
        const official = await officialFromKonami(source.id, fetchText, day)
        if (official) {
          const tmp = `${target}.tmp`
          writeFileSync(tmp, JSON.stringify(official.list, null, 1) + '\n')
          renameSync(tmp, target)
          out.push({ id: source.id, status: 'updated', detail: `Konami, liste du ${official.list.version} : ${Object.keys(official.list.limits ?? {}).length} cartes limitées${official.list.verified ? ' (vérifiée)' : ` (${official.unmatched} noms non retrouvés, non vérifiée)`}` })
          continue
        }
      } catch (e) {
        console.warn(`[formats] liste officielle ${source.id} indisponible : ${e instanceof Error ? e.message : e}`)
      }
    }
    try {
      const parsed = latest(parseLflist(await fetchText(LFLIST_BASE + source.file)))
      if (!parsed) throw new Error('aucune liste dans le fichier')
      const list = buildList(source, parsed, day)
      const limited = Object.keys(list.limits ?? {}).length
      if (limited < source.min) throw new Error(`fichier incomplet (${limited} cartes limitées)`)
      const tmp = `${target}.tmp`
      writeFileSync(tmp, JSON.stringify(list, null, 1) + '\n')
      renameSync(tmp, target)
      out.push({ id: source.id, status: 'updated', detail: `${parsed.name} : ${limited} cartes limitées${list.pool ? `, réserve de ${list.pool.length} cartes` : ''}` })
    } catch (e) {
      out.push({ id: source.id, status: 'failed', detail: e instanceof Error ? e.message : String(e) })
    }
  }
  return out
}

/** La liste officielle d'un format de Konami, ou null si elle ne peut pas être lue (page changée, base japonaise absente pour l'OCG). */
async function officialFromKonami(id: 'tcg' | 'ocg', fetchText: (url: string) => Promise<string>, day: string): Promise<{ list: ListFile; unmatched: number } | null> {
  const lookup = id === 'tcg' ? englishLookup : japaneseLookup()
  if (!lookup) return null
  const page = parseKonamiPage(await fetchText(`${KONAMI_URL}?request_locale=${id === 'tcg' ? 'en' : 'ja'}`))
  const total = page.forbidden.length + page.limited.length + page.semi.length
  // Une page vide ou tronquée ne remplace jamais une liste.
  if (!page.updated || total < 100) throw new Error(`page inattendue (${total} cartes)`)
  const matched = matchPage(page, lookup)
  return { list: officialList(id, page, matched, day), unmatched: matched.unmatched.length }
}

/** Les listes installées sont-elles absentes, anciennes ou d'une autre origine que la synchronisation ? */
export function listsAreStale(dir: string = FORMATS_DIR, now: Date = new Date()): boolean {
  return SOURCES.some((s) => {
    const file = installed(path.join(dir, `${s.id}.json`))
    if (!file) return true
    if (file.verified && !file.synced) return false
    const age = file.retrievedAt ? (now.getTime() - Date.parse(file.retrievedAt)) / 86_400_000 : Infinity
    return !file.synced || !(age < STALE_DAYS)
  })
}
