// Formats de jeu : chargement des listes (interdictions, points) et vérification d'un deck.
//
// Deux endroits fournissent des listes, le second l'emporte :
//   1. src/server/formats/lists/*.json : instantanés livrés avec le jeu (scripts/build-format-lists.mjs) ;
//   2. data/formats/*.json : listes importées par le propriétaire (tools/formats/import-list.ts), hors dépôt.
// Une liste n'est jamais présentée comme vérifiée si son fichier ne le dit pas (verified: true).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { msg } from '../../shared/msg.ts'
import { DEFAULT_FORMAT, FORMAT_IDS } from '../../shared/formats.ts'
import type { DeckIssue, FormatCheck, FormatId, FormatInfo, FormatStatus } from '../../shared/formats.ts'
import { FORMATS_DIR } from '../paths.ts'
import { cardData, cardName, cardNameEn, displayId } from '../ocg/data.ts'

/** Contenu d'un fichier de liste. */
export interface ListFile {
  id: FormatId
  kind: 'limits' | 'points'
  region: 'TCG' | 'OCG' | null
  /** Date ou version officielle de la liste, si la source la donne. */
  version: string | null
  retrievedAt?: string
  source: string
  /** Vrai seulement si la liste, sa date et (pour un format historique) la réserve de cartes ont été vérifiées. */
  verified: boolean
  /** Liste obtenue par synchronisation (sync.ts) : à jour de sa source, mais pas comparée à la publication officielle. */
  synced?: boolean
  /** limits : code de carte → exemplaires autorisés (0, 1 ou 2). */
  limits?: Record<string, number>
  /** limits : réserve de cartes (format historique). Une carte absente de la réserve est interdite. */
  pool?: number[]
  /** points : code de carte → points. */
  points?: Record<string, number>
  cap?: number
}

/** Limites connues de chaque format, par clé de traduction (affichées dans le salon et l'éditeur). */
const NOTES: Record<FormatId, string[]> = {
  casual: [],
  tcg: ['format.note.listDate', 'format.note.poolOpen', 'format.note.currentRules'],
  ocg: ['format.note.listDate', 'format.note.poolOpen', 'format.note.currentRules'],
  goat: ['format.note.listDate', 'format.note.poolGoat', 'format.note.rulesGoat'],
  genesys: ['format.note.pointsUnverified', 'format.note.currentRules'],
}

const DEFAULT_CAP = 100

function readList(file: string): ListFile | null {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<ListFile>
    if (!data.id || !FORMAT_IDS.includes(data.id) || (data.kind !== 'limits' && data.kind !== 'points')) return null
    if (data.kind === 'limits' && (!data.limits || typeof data.limits !== 'object')) return null
    if (data.kind === 'points' && (!data.points || typeof data.points !== 'object')) return null
    return { region: null, version: null, source: 'inconnue', verified: false, ...data } as ListFile
  } catch (e) {
    console.warn(`[formats] liste illisible (${file}) : ${e instanceof Error ? e.message : e}`)
    return null
  }
}

/** Liste d'un seul fichier, avec les codes ramenés à la carte de référence (les variantes d'illustration comptent pour une seule). */
interface Loaded {
  file: ListFile
  limits: Map<number, number>
  points: Map<number, number>
  pool: Set<number> | null
}

function normalize(file: ListFile): Loaded {
  const limits = new Map<number, number>()
  const points = new Map<number, number>()
  for (const [code, n] of Object.entries(file.limits ?? {})) if (Number.isInteger(n) && n >= 0 && n <= 2) limits.set(displayId(Number(code)), n)
  for (const [code, n] of Object.entries(file.points ?? {})) if (Number.isFinite(n) && n >= 0) points.set(displayId(Number(code)), n)
  const pool = Array.isArray(file.pool) && file.pool.length ? new Set(file.pool.filter(Number.isInteger).map(displayId)) : null
  return { file, limits, points, pool }
}

export class FormatCatalog {
  private readonly lists = new Map<FormatId, Loaded>()

  /** Lit les listes présentes. À appeler une fois les données de cartes chargées (les codes y sont ramenés à leur carte de référence). */
  load(dirs: string[] = [path.join(import.meta.dirname, 'lists'), FORMATS_DIR]): this {
    this.lists.clear()
    for (const dir of dirs) {
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
        const list = readList(path.join(dir, f))
        if (list) this.lists.set(list.id, normalize(list))
      }
    }
    return this
  }

  /** Les formats tels que le client les voit. */
  infos(): FormatInfo[] {
    return FORMAT_IDS.map((id) => this.info(id))
  }

  info(id: FormatId): FormatInfo {
    if (id === 'casual') return { id, status: 'ready', kind: 'none', region: null, version: null, source: null, cap: null, notes: [] }
    const list = this.lists.get(id)
    if (!list) return { id, status: 'missing', kind: id === 'genesys' ? 'points' : 'limits', region: null, version: null, source: null, cap: id === 'genesys' ? DEFAULT_CAP : null, notes: ['format.note.noList'] }
    const status: FormatStatus = list.file.verified ? 'ready' : 'unverified'
    return { id, status, kind: list.file.kind, region: list.file.region, version: list.file.version, source: list.file.source, cap: list.file.kind === 'points' ? (list.file.cap ?? DEFAULT_CAP) : null, notes: this.notesOf(id, list), ...(list.file.synced ? { synced: true } : {}) }
  }

  /** Ce que le format n'applique pas ou n'a pas vérifié : la date d'une liste synchronisée est celle de sa source, la réserve de cartes est appliquée si le fichier la donne. */
  private notesOf(id: FormatId, list: Loaded): string[] {
    if (list.file.verified) return NOTES[id].filter((n) => n === 'format.note.currentRules' || n === 'format.note.poolOpen')
    return NOTES[id]
      .map((n) => (n === 'format.note.listDate' && list.file.synced ? 'format.note.listSynced' : n))
      .filter((n) => !(n === 'format.note.poolGoat' && list.pool))
  }

  /** Ce format peut-il être choisi pour une salle ? Un format sans liste ne s'annonce pas. */
  available(id: FormatId): boolean {
    return this.info(id).status !== 'missing'
  }

  /**
   * Un deck face à un format : construction ordinaire (40 à 60 cartes, 15 Extra au plus, 3 exemplaires), puis la liste du format.
   * Jamais « légal » pour un format sans liste.
   */
  check(id: FormatId, deck: { main: number[]; extra: number[] }): FormatCheck {
    const issues: DeckIssue[] = []
    const block = (text: string, card?: number): void => void issues.push({ text, level: 'blocking', ...(card ? { card } : {}) })
    const info = this.info(id)
    const all = [...deck.main, ...deck.extra]

    const unknown = [...new Set(all.filter((c) => !cardData(c)))]
    if (unknown.length) block(msg('api.unknownCards', { n: unknown.length }))
    if (deck.main.length < 40) block(msg('format.issue.mainMin', { n: deck.main.length }))
    if (deck.main.length > 60) block(msg('format.issue.mainMax', { n: deck.main.length }))
    if (deck.extra.length > 15) block(msg('format.issue.extraMax', { n: deck.extra.length }))

    const copies = new Map<number, number>()
    for (const c of all) copies.set(displayId(c), (copies.get(displayId(c)) ?? 0) + 1)
    const list = id === 'casual' ? undefined : this.lists.get(id)
    let points: FormatCheck['points'] = null

    if (id !== 'casual' && !list) block(msg('format.issue.noList'))
    for (const [code, n] of copies) {
      const names = { name: cardName(code), 'name@en': cardNameEn(code) }
      const max = list?.file.kind === 'limits' ? (list.limits.get(code) ?? 3) : 3
      if (list?.pool && !list.pool.has(code)) block(msg('format.issue.outOfPool', names), code)
      else if (n > 3) block(msg('format.issue.copies', { ...names, n }), code)
      else if (max === 0) block(msg('format.issue.forbidden', names), code)
      else if (n > max) block(msg('format.issue.limited', { ...names, n, max }), code)
    }
    if (list?.file.kind === 'points') {
      const cap = list.file.cap ?? DEFAULT_CAP
      let used = 0
      for (const [code, n] of copies) used += (list.points.get(code) ?? 0) * n
      points = { used, cap }
      if (used > cap) block(msg('format.issue.points', { used, cap }))
    }
    if (info.status === 'unverified') issues.push({ text: msg('format.issue.unverified'), level: 'info' })
    return { format: id, legal: !issues.some((i) => i.level === 'blocking'), issues, points }
  }

  /** Points d'une carte dans un format à points (0 si la carte n'est pas listée). */
  pointsOf(id: FormatId, code: number): number {
    return this.lists.get(id)?.points.get(displayId(code)) ?? 0
  }
}

export { DEFAULT_FORMAT }
