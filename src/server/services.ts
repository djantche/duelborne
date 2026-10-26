// Les services du serveur, assemblés une fois au démarrage : base, comptes, decks, formats, tournois.
import { AccountService } from './accounts/service.ts'
import { DeckService } from './accounts/decks.ts'
import { FormatCatalog } from './formats/catalog.ts'
import type { DeckList } from './ocg/decks.ts'
import type { Storage } from './store/types.ts'
import { TournamentService } from './tournaments/service.ts'
import type { TournamentHooks } from './tournaments/service.ts'

export interface Services {
  store: Storage
  accounts: AccountService
  decks: DeckService
  formats: FormatCatalog
  tournaments: TournamentService
  /** Decks fournis avec le jeu (lecture seule). */
  provided: Map<string, DeckList>
  /** Branchés par le hub : prévenir les joueurs connectés, fermer un salon. */
  hooks: TournamentHooks
}

export function createServices(store: Storage, provided: Map<string, DeckList>, formats: FormatCatalog): Services {
  const hooks: TournamentHooks = { notify: () => {}, closeMatchRoom: () => {} }
  const accounts = new AccountService(store)
  const decks = new DeckService(store)
  // Le service reçoit des fonctions qui suivent le branchement du hub, quel que soit le moment où il se fait.
  const tournaments = new TournamentService(store, decks, formats, { notify: (...a) => hooks.notify(...a), closeMatchRoom: (...a) => hooks.closeMatchRoom(...a), scheduleBots: (id) => hooks.scheduleBots?.(id), botError: (id) => hooks.botError?.(id) ?? false, botProgress: (id) => hooks.botProgress?.(id) ?? null, watchable: (id) => hooks.watchable?.(id) ?? false }, Date.now, provided)
  return { store, accounts, decks, formats, tournaments, provided, hooks }
}
