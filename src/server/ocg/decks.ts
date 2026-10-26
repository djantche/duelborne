// Decks fournis avec le jeu (fichiers .ydk du dossier decks/, en lecture seule) et règles de construction communes.
// Les decks des joueurs vivent dans la base, rattachés à leur compte (voir accounts/decks.ts).
import { msg } from '../../shared/msg.ts'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { DeckInfo } from '../../shared/protocol.ts'
import { DECKS_DIR } from '../paths.ts'
import { cardData, cardName, cardNameEn, displayId, TYPE } from './data.ts'

/** Identifiant lisible tiré d'un nom (anciens decks de joueurs, importés des fichiers). */
export const slug = (name: string): string => (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck').slice(0, 40)

export interface DeckList extends DeckInfo {
  main: number[]
  extra: number[]
}

export function parseYdk(file: string): DeckList {
  const id = path.basename(file, '.ydk')
  const meta: Record<string, string> = {}
  const main: number[] = []
  const extra: number[] = []
  let section: number[] | null = main
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '#main') section = main
    else if (line === '#extra') section = extra
    else if (line.startsWith('!side')) section = null
    else if (/^\d+$/.test(line)) {
      // Une carte inconnue du moteur ferait échouer le duel : on l'écarte.
      if (section && cardData(Number(line))) section.push(Number(line))
    } else {
      const m = /^#(\w+):\s*(.+)$/.exec(line)
      if (m) meta[m[1] as string] = m[2] as string
    }
  }
  const monsters = main.filter((c) => ((cardData(c)?.type ?? 0) & TYPE.MONSTER) !== 0)
  const strongest = [...monsters].sort((a, b) => (cardData(b)?.attack ?? 0) - (cardData(a)?.attack ?? 0))[0]
  return {
    id,
    name: meta.name ?? id,
    series: meta.series ?? 'Deck personnel',
    cover: displayId(Number(meta.cover) || strongest || main[0] || 0),
    mainCount: main.length,
    extraCount: extra.length,
    main,
    extra,
  }
}

/** Les decks fournis. Le dossier decks/user/ des versions d'avant les comptes n'est plus lu ici : voir accounts/legacy.ts. */
export function loadDecks(): Map<string, DeckList> {
  const decks = new Map<string, DeckList>()
  let files: string[] = []
  try {
    files = readdirSync(DECKS_DIR).filter((f) => f.endsWith('.ydk'))
  } catch {
    return decks
  }
  for (const f of files.sort()) {
    const deck = parseYdk(path.join(DECKS_DIR, f))
    if (isPlayable(deck)) decks.set(deck.id, deck)
    else console.warn(`Deck ignoré (${deck.main.length} cartes, ${deck.extra.length} Extra) : ${f}`)
  }
  return decks
}

export const deckInfo = ({ main: _m, extra: _e, ...info }: DeckList): DeckInfo => info

// ─────────────────── Règles de construction et contenu d'un deck de joueur ───────────────────

/** Contenu brut d'un deck de joueur : ce que le client envoie. */
export interface UserDeck {
  name: string
  series?: string
  cover?: number
  main: number[]
  extra: number[]
  /** Identifiant du deck de joueur que celui-ci remplace (modification, y compris un changement de nom). */
  replaces?: string
}

/** Un deck est jouable s'il a 40 à 60 cartes principales et au plus 15 Extra : sinon c'est un brouillon. */
export const isPlayable = (d: { main: unknown[]; extra: unknown[] }): boolean => d.main.length >= 40 && d.main.length <= 60 && d.extra.length <= 15

/** Vérifie qu'un contenu peut être enregistré (brouillon accepté). Renvoie l'erreur à montrer, ou null. */
export function checkDeckContents(deck: Pick<UserDeck, 'main' | 'extra'>): { error: string; unplayable?: number[] } | null {
  // Une carte inconnue du moteur ferait échouer le duel : on refuse l'enregistrement en les nommant, au lieu de les jeter en silence.
  const unplayable = [...new Set([...deck.main, ...deck.extra].filter((c) => !cardData(c)))]
  if (unplayable.length) return { error: msg('api.unknownCards', { n: unplayable.length }), unplayable }
  if (deck.main.length > 60) return { error: msg('api.mainMax', { n: deck.main.length }) }
  if (deck.extra.length > 15) return { error: msg('api.extraMax', { n: deck.extra.length }) }
  const copies = new Map<number, number>()
  for (const c of [...deck.main, ...deck.extra]) copies.set(displayId(c), (copies.get(displayId(c)) ?? 0) + 1)
  const over = [...copies].find(([, n]) => n > 3)
  if (over) return { error: msg('api.copies', { name: cardName(over[0]), 'name@en': cardNameEn(over[0]), n: over[1] }) }
  return null
}

/** Carte emblème : celle demandée si elle existe, sinon le monstre le plus fort du deck. */
export function coverOf(main: number[], extra: number[], wanted?: number): number {
  if (wanted && cardData(wanted)) return wanted
  const monsters = main.filter((c) => ((cardData(c)?.type ?? 0) & TYPE.MONSTER) !== 0)
  const strongest = [...monsters].sort((a, b) => (cardData(b)?.attack ?? 0) - (cardData(a)?.attack ?? 0))[0]
  return strongest ?? main[0] ?? extra[0] ?? 0
}

/** Un deck fourni, brouillons exclus (ils n'existent pas parmi les decks du jeu). */
export function findProvided(id: string): DeckList | undefined {
  const clean = id.replace(/[^a-z0-9-]/g, '')
  const file = path.join(DECKS_DIR, `${clean}.ydk`)
  return clean && existsSync(file) ? parseYdk(file) : undefined
}
