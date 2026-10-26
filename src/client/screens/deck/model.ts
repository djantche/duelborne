// Éditeur de deck, partie sans affichage : brouillon, ajout et retrait, tri, recherche, vérification.
// Tout est ici pour pouvoir être testé sans navigateur ; Deck.tsx ne fait que montrer et relayer.
import { nameOf } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'

export const MAIN_MIN = 40
export const MAIN_MAX = 60
export const EXTRA_MAX = 15
export const COPIES_MAX = 3

export type Part = 'main' | 'extra'

/** Où retrouver une carte par son code : le catalogue (un Map convient). */
export interface Lookup {
  get(id: number): ClientCard | undefined
}

/** Le deck en cours d'édition. */
export interface Draft {
  /** Identifiant du deck de joueur ouvert (null : pas encore enregistré). */
  editing: string | null
  name: string
  series: string
  /** Carte emblème choisie à la main (sinon le serveur prend le monstre le plus fort). */
  cover: number | null
  main: number[]
  extra: number[]
}

export const emptyDraft = (): Draft => ({ editing: null, name: '', series: 'Mes decks', cover: null, main: [], extra: [] })

/** Empreinte d'un brouillon : sert à savoir s'il a changé depuis le dernier enregistrement. */
export const fingerprint = (d: Draft): string => JSON.stringify([d.name.trim(), d.cover, [...d.main].sort((a, b) => a - b), [...d.extra].sort((a, b) => a - b)])

// ───────────────────────────── Classement des cartes ─────────────────────────────

export type Kind = 'monster' | 'spell' | 'trap'

/** Fusion, Synchro, Xyz et Lien (Pendule compris) vont dans l'Extra Deck. */
export const goesToExtra = (c: ClientCard): boolean => /^(fusion|synchro|xyz|link)/.test(c.frameType)

export const kindOf = (c: ClientCard): Kind => (c.frameType === 'spell' ? 'spell' : c.frameType === 'trap' ? 'trap' : 'monster')

/** Peut-on mettre cette carte dans un deck ? (Pas de jeton ni de Carte Compétence.) */
export const isDeckable = (c: ClientCard): boolean => c.id !== 3900000001 && c.frameType !== 'token' && c.frameType !== 'skill'

export const partOf = (c: ClientCard): Part => (goesToExtra(c) ? 'extra' : 'main')

/** Nombre d'exemplaires d'une carte dans tout le deck (Principal + Extra). */
export const copiesOf = (d: Draft, id: number): number => d.main.filter((c) => c === id).length + d.extra.filter((c) => c === id).length

/** Un message de l'interface : une clé de traduction et ses paramètres (le texte vient des fichiers de langue). */
export interface Msg {
  key: string
  params?: Record<string, string | number>
}

/** Pourquoi on ne peut pas en ajouter une autre (null : c'est possible). */
export function whyNotAdd(d: Draft, c: ClientCard): Msg | null {
  if (!isDeckable(c)) return { key: 'deck.err.undeckable' }
  if (copiesOf(d, c.id) >= COPIES_MAX) return { key: 'deck.err.copies', params: { max: COPIES_MAX, name: nameOf(c) } }
  if (partOf(c) === 'main' && d.main.length >= MAIN_MAX) return { key: 'deck.err.mainFull', params: { max: MAIN_MAX } }
  if (partOf(c) === 'extra' && d.extra.length >= EXTRA_MAX) return { key: 'deck.err.extraFull', params: { max: EXTRA_MAX } }
  return null
}

export function addCard(d: Draft, c: ClientCard): Draft {
  if (whyNotAdd(d, c)) return d
  const part = partOf(c)
  return { ...d, [part]: [...d[part], c.id] }
}

/** Retire un exemplaire (le dernier posé). */
export function removeCard(d: Draft, c: ClientCard, from: Part = partOf(c)): Draft {
  const part = from
  const list = [...d[part]]
  const i = list.lastIndexOf(c.id)
  if (i < 0) return d
  list.splice(i, 1)
  return { ...d, [part]: list, cover: d.cover === c.id && !list.includes(c.id) && !d[part === 'main' ? 'extra' : 'main'].includes(c.id) ? null : d.cover }
}

/** Les cartes d'une partie du deck, regroupées par carte et rangées : monstres (Niveau décroissant), Magies, Pièges. */
export interface Group {
  card: ClientCard
  count: number
}

export interface Section {
  /** Clé de traduction du titre. */
  title: string
  total: number
  groups: Group[]
}

const frameOrder = ['fusion', 'synchro', 'xyz', 'link']
const rank = (c: ClientCard): number => {
  const k = kindOf(c)
  return k === 'monster' ? 0 : k === 'spell' ? 1 : 2
}
/** Langue de tri des noms (réglée par l'interface selon la langue choisie). */
let sortLocale = 'fr'
export const setSortLocale = (code: string): void => {
  sortLocale = code
}
const byName = (a: ClientCard, b: ClientCard): number => nameOf(a).localeCompare(nameOf(b), sortLocale)

export function sections(codes: number[], part: Part, cards: Lookup): Section[] {
  const counts = new Map<number, number>()
  for (const id of codes) counts.set(id, (counts.get(id) ?? 0) + 1)
  const groups: Group[] = []
  for (const [id, count] of counts) {
    const card = cards.get(id)
    if (card) groups.push({ card, count })
  }
  const make = (title: string, list: Group[]): Section | null => (list.length ? { title, total: list.reduce((n, g) => n + g.count, 0), groups: list } : null)
  const out: (Section | null)[] = []
  if (part === 'extra') {
    const titles: Record<string, string> = { fusion: 'deck.section.fusion', synchro: 'deck.section.synchro', xyz: 'deck.section.xyz', link: 'deck.section.link' }
    for (const frame of frameOrder) {
      out.push(make(titles[frame] as string, groups.filter((g) => g.card.frameType.startsWith(frame)).sort((a, b) => (b.card.level ?? b.card.linkval ?? 0) - (a.card.level ?? a.card.linkval ?? 0) || byName(a.card, b.card))))
    }
  } else {
    const titles = ['deck.section.monster', 'deck.section.spell', 'deck.section.trap']
    for (let r = 0; r < 3; r++) {
      const list = groups.filter((g) => rank(g.card) === r)
      list.sort((a, b) => (r === 0 ? (b.card.level ?? 0) - (a.card.level ?? 0) : a.card.race.localeCompare(b.card.race)) || byName(a.card, b.card))
      out.push(make(titles[r] as string, list))
    }
  }
  return out.filter((s): s is Section => s !== null)
}

// ───────────────────────────── Vérification ─────────────────────────────

export interface Report {
  /** Jouable en duel : 40 à 60 cartes principales, 15 Extra au plus. */
  playable: boolean
  /** Ce qu'il reste à faire, en clair. Vide quand le deck est jouable. */
  todo: Msg[]
  monsters: number
  spells: number
  traps: number
}

export function check(d: Draft, cards: Lookup): Report {
  const kinds = { monster: 0, spell: 0, trap: 0 }
  for (const id of d.main) {
    const c = cards.get(id)
    if (c) kinds[kindOf(c)]++
  }
  const todo: Msg[] = []
  if (d.main.length < MAIN_MIN) todo.push({ key: 'deck.todo.missing', params: { n: MAIN_MIN - d.main.length, min: MAIN_MIN } })
  if (!d.name.trim()) todo.push({ key: 'deck.todo.name' })
  return { playable: d.main.length >= MAIN_MIN && d.main.length <= MAIN_MAX && d.extra.length <= EXTRA_MAX, todo, monsters: kinds.monster, spells: kinds.spell, traps: kinds.trap }
}

// ───────────────────────────── Recherche ─────────────────────────────

export interface Filters {
  text: string
  /** all : tout · monster / spell / trap · extra : Fusion, Synchro, Xyz, Lien. */
  kind: 'all' | 'monster' | 'spell' | 'trap' | 'extra'
  attribute: string
  /** Race d'un monstre, ou sous-type d'une Magie / d'un Piège (Continue, Jeu Rapide...). */
  race: string
  level: number | null
}

export const noFilters = (): Filters => ({ text: '', kind: 'all', attribute: '', race: '', level: null })

/** Vrai quand au moins un critère est posé : sans critère on n'affiche pas les 14 000 cartes. */
export const isFiltering = (f: Filters): boolean => f.text.trim().length >= 2 || f.kind !== 'all' || !!f.attribute || !!f.race || f.level !== null

/** Minuscules sans accents : « epee » trouve « Épée ». */
export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Noms (français puis anglais) déjà mis en minuscules sans accents : on ne le refait pas à chaque lettre tapée. */
const folded = new WeakMap<ClientCard, string>()
const foldedNames = (c: ClientCard): string => {
  let v = folded.get(c)
  if (v === undefined) {
    v = `${fold(nameOf(c))}\n${fold(c.name.en)}`
    folded.set(c, v)
  }
  return v
}

export function search(cards: Iterable<ClientCard>, f: Filters, limit: number): { list: ClientCard[]; more: boolean } {
  if (!isFiltering(f)) return { list: [], more: false }
  const q = fold(f.text.trim())
  const list: ClientCard[] = []
  let more = false
  for (const c of cards) {
    if (!isDeckable(c)) continue
    if (f.kind === 'extra' ? !goesToExtra(c) : f.kind !== 'all' && kindOf(c) !== f.kind) continue
    if (f.attribute && c.attribute !== f.attribute) continue
    if (f.race && c.race !== f.race) continue
    if (f.level !== null && (c.level ?? -1) !== f.level) continue
    if (q.length >= 2 && !foldedNames(c).includes(q)) continue
    list.push(c)
  }
  // Les noms qui commencent par le texte d'abord, puis l'ordre alphabétique.
  list.sort((a, b) => {
    const sa = q && foldedNames(a).startsWith(q) ? 0 : 1
    const sb = q && foldedNames(b).startsWith(q) ? 0 : 1
    return sa - sb || byName(a, b)
  })
  if (list.length > limit) more = true
  return { list: list.slice(0, limit), more }
}

/** Le .ydk du brouillon (format d'EDOPro), à copier ou à coller dans « Importer ». */
export function toYdk(d: Draft): string {
  return ['#created by Duelborne', `#name: ${d.name.trim() || 'Mon Deck'}`, '#main', ...d.main, '#extra', ...d.extra, '!side', ''].join('\n')
}
