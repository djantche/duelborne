// Listes officielles de Konami (base de données des cartes) : la source qui fait foi pour le TCG et l'OCG.
//
//   TCG : https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action?request_locale=en  (noms anglais)
//   OCG : la même page en japonais (noms japonais, rapprochés des numéros de carte par la base japonaise de mycard, data/ocg/cards.ja.cdb)
//
// Chaque page porte sa date (« Status Updated ») et trois listes (interdites, limitées, semi-limitées). On ne déclare « vérifiée » qu'une liste dont
// tous les noms ont été retrouvés dans la base du jeu ; sinon on laisse la synchronisation se rabattre sur la liste d'EDOPro.
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import type { FormatId } from '../../shared/formats.ts'
import { OCG_DIR } from '../paths.ts'
import { displayId, idByEnglishName, isKnownToClient } from '../ocg/data.ts'
import type { ListFile } from './catalog.ts'

export const KONAMI_URL = 'https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action'
/** Base japonaise des cartes (≈ 12 Mo, hors dépôt) : sert uniquement à rapprocher les noms japonais de la liste OCG des numéros de carte. */
export const JA_CDB_URL = 'https://raw.githubusercontent.com/mycard/ygopro-database/master/locales/ja-JP/cards.cdb'
export const JA_CDB = path.join(OCG_DIR, 'cards.ja.cdb')

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', times: '×', forall: '∀', exist: '∃', Omega: 'Ω', omega: 'ω', Alpha: 'Α', alpha: 'α', Beta: 'Β', beta: 'β', Gamma: 'Γ', gamma: 'γ', Delta: 'Δ', delta: 'δ', Sigma: 'Σ', sigma: 'σ', Pi: 'Π', pi: 'π', Phi: 'Φ', phi: 'φ', Psi: 'Ψ', psi: 'ψ', Theta: 'Θ', theta: 'θ', Lambda: 'Λ', lambda: 'λ', Xi: 'Ξ', xi: 'ξ', mu: 'μ', nu: 'ν', rho: 'ρ', tau: 'τ', chi: 'χ', eta: 'η', epsilon: 'ε', zeta: 'ζ', iota: 'ι', kappa: 'κ', ndash: '–', mdash: '—', star: '☆', hearts: '♥' }

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([A-Za-z]+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
}

export interface KonamiPage {
  /** Date de mise à jour de la liste, au format ISO (2026-10-19). */
  updated: string
  /** Noms des cartes de chaque liste, tels que la page les écrit. */
  forbidden: string[]
  limited: string[]
  semi: string[]
}

const clean = (s: string): string => decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()

/** Lit une page de la liste officielle (anglais ou japonais). */
export function parseKonamiPage(html: string): KonamiPage {
  const dated = /Status Updated\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(html)
  const dated2 = /(\d{4})\/(\d{2})\/(\d{2})/.exec(html.slice(html.indexOf('list_forbidden')))
  const updated = dated ? `${dated[3]}-${dated[1]}-${dated[2]}` : dated2 ? `${dated2[1]}-${dated2[2]}-${dated2[3]}` : ''
  const keys = ['list_forbidden', 'list_limited', 'list_semi_limited']
  const names = keys.map((key) => {
    const start = html.indexOf(`id="${key}"`)
    if (start < 0) return []
    const next = keys.map((k) => html.indexOf(`id="${k}"`)).filter((i) => i > start).sort((a, b) => a - b)[0] ?? html.length
    return [...html.slice(start, next).matchAll(/<span class="name">([\s\S]*?)<\/span>/g)].map((m) => clean(m[1] as string)).filter(Boolean)
  })
  return { updated, forbidden: names[0] ?? [], limited: names[1] ?? [], semi: names[2] ?? [] }
}

export interface Matched {
  limits: Map<number, number>
  unmatched: string[]
}

/** Rapproche les noms d'une page des cartes du jeu. `lookup` donne les numéros possibles d'un nom. */
export function matchPage(page: KonamiPage, lookup: (name: string) => number[]): Matched {
  const limits = new Map<number, number>()
  const unmatched: string[] = []
  const add = (names: string[], limit: number): void => {
    for (const name of names) {
      const ids = lookup(name)
      if (!ids.length) { unmatched.push(name); continue }
      // Plusieurs numéros pour un même nom (autres illustrations) : celui que le jeu connaît, sinon le premier.
      const resolved = ids.map((i) => displayId(i))
      const id = resolved.find((i) => isKnownToClient(i)) ?? resolved[0] as number
      limits.set(id, Math.min(limits.get(id) ?? 3, limit))
    }
  }
  add(page.forbidden, 0)
  add(page.limited, 1)
  add(page.semi, 2)
  return { limits, unmatched }
}

/** Les numéros d'un nom anglais, d'après les cartes du jeu. */
export const englishLookup = (name: string): number[] => {
  const id = idByEnglishName(name) ?? idByEnglishName(name.replace(/’/g, "'"))
  return id === null ? [] : [id]
}

const japaneseKey = (s: string): string => s.normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase()

/** Les numéros d'un nom japonais, d'après la base japonaise ; null si elle n'est pas installée. */
export function japaneseLookup(file: string = JA_CDB): ((name: string) => number[]) | null {
  if (!existsSync(file)) return null
  const db = new DatabaseSync(file, { readOnly: true })
  const byName = new Map<string, number[]>()
  for (const r of db.prepare('select id, name from texts').all() as { id: number; name: string }[]) {
    const k = japaneseKey(r.name)
    byName.set(k, [...(byName.get(k) ?? []), Number(r.id)])
  }
  db.close()
  return (name) => byName.get(japaneseKey(name)) ?? []
}

export function officialList(id: Extract<FormatId, 'tcg' | 'ocg'>, page: KonamiPage, matched: Matched, retrievedAt: string): ListFile {
  const limits: Record<string, number> = {}
  for (const [code, limit] of [...matched.limits].sort((a, b) => a[0] - b[0])) limits[code] = limit
  return {
    id,
    kind: 'limits',
    region: id === 'tcg' ? 'TCG' : 'OCG',
    version: page.updated,
    retrievedAt,
    source: `Konami, base de données officielle (${id === 'tcg' ? 'liste TCG' : 'liste OCG'} du ${page.updated}), reçue le ${retrievedAt}`,
    // Vérifiée : la liste vient de Konami et tous ses noms ont été retrouvés dans la base du jeu.
    verified: matched.unmatched.length === 0,
    synced: true,
    limits,
  }
}
