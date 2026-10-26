// Decks des joueurs : chacun a sa bibliothèque, isolée de celle des autres. Les decks fournis (decks/*.ydk) restent en
// lecture seule : pour en modifier un, le joueur en enregistre une copie dans sa bibliothèque.
import { randomBytes } from 'node:crypto'
import { msg } from '../../shared/msg.ts'
import { checkDeckContents, coverOf } from '../ocg/decks.ts'
import type { DeckList, UserDeck } from '../ocg/decks.ts'
import type { DeckRecord, Storage } from '../store/types.ts'

export const OWN_PREFIX = 'user-'

const asList = (d: DeckRecord): DeckList => ({ id: d.id, name: d.name, series: d.series, cover: d.cover, mainCount: d.main.length, extraCount: d.extra.length, main: d.main, extra: d.extra })

/** Entiers positifs raisonnables, en quantité raisonnable : le client n'est jamais cru sur parole. */
const clean = (v: unknown): number[] => (Array.isArray(v) ? (v.filter((n) => Number.isInteger(n) && n > 0 && n < 10_000_000_000) as number[]).slice(0, 90) : [])

/** Lit le corps d'une requête d'enregistrement. */
export function readUserDeck(body: unknown): UserDeck | null {
  const deck = (body as { deck?: Partial<UserDeck> } | null)?.deck
  if (!deck || typeof deck.name !== 'string') return null
  return {
    name: deck.name,
    series: typeof deck.series === 'string' ? deck.series : undefined,
    cover: Number.isInteger(deck.cover) ? deck.cover : undefined,
    main: clean(deck.main),
    extra: clean(deck.extra),
    replaces: typeof deck.replaces === 'string' ? deck.replaces : undefined,
  }
}

export class DeckService {
  private readonly store: Storage
  private readonly now: () => number

  constructor(store: Storage, now: () => number = Date.now) {
    this.store = store
    this.now = now
  }

  /** Tous les decks du compte, brouillons compris. */
  list(userId: string): DeckList[] {
    return this.store.decks.ofUser(userId).map(asList)
  }

  /** Un deck du compte. Un deck d'un autre compte n'existe pas, comme s'il était absent. */
  get(userId: string, id: string): DeckList | undefined {
    const d = this.store.decks.byId(id)
    return d && d.userId === userId ? asList(d) : undefined
  }

  save(userId: string, deck: UserDeck): { deck: DeckList } | { error: string; status: number; unplayable?: number[] } {
    const name = deck.name.trim().slice(0, 40) || 'Mon Deck'
    const bad = checkDeckContents(deck)
    if (bad) return { ...bad, status: 422 }
    const existing = deck.replaces ? this.store.decks.byId(deck.replaces) : undefined
    if (deck.replaces && (!existing || existing.userId !== userId)) return { error: msg('api.noDeck'), status: 404 }
    // Un nom déjà pris par un autre deck du compte est refusé : rien n'est écrasé en silence.
    if (this.store.decks.nameTaken(userId, name, existing?.id)) return { error: msg('api.nameTaken', { name }), status: 409 }
    const now = this.now()
    const record: DeckRecord = {
      id: existing?.id ?? `${OWN_PREFIX}${randomBytes(6).toString('hex')}`,
      userId,
      name,
      series: deck.series?.trim().slice(0, 30) || existing?.series || 'Mes decks',
      cover: coverOf(deck.main, deck.extra, deck.cover),
      main: deck.main,
      extra: deck.extra,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.store.decks.save(record)
    return { deck: asList(record) }
  }

  remove(userId: string, id: string): boolean {
    const d = this.store.decks.byId(id)
    if (!d || d.userId !== userId) return false
    return this.store.decks.delete(id)
  }

  // ───────────────────────── Decks d'avant les comptes ─────────────────────────

  legacyCount(): number {
    return this.store.decks.orphans().length
  }

  /** Donne au compte les decks d'avant les comptes. Un nom déjà pris dans sa bibliothèque reçoit un numéro. */
  claimLegacy(userId: string): { claimed: number; renamed: number } {
    return this.store.transaction(() => {
      let renamed = 0
      const orphans = this.store.decks.orphans()
      for (const d of orphans) {
        let name = d.name
        for (let n = 2; this.store.decks.nameTaken(userId, name); n++) name = `${d.name.slice(0, 34)} (${n})`
        if (name !== d.name) renamed++
        this.store.decks.claim(d.id, userId, name, this.now())
      }
      return { claimed: orphans.length, renamed }
    })
  }
}
