// État partagé par tous les écrans : identité du joueur, catalogue de cartes, salle, écran affiché.
//
// L'interface est une fonction de cet état : on le modifie, puis on appelle redraw() (voir app/render.ts).
import type { PublicUser, UserStats } from '../../shared/accounts.ts'
import type { FormatInfo } from '../../shared/formats.ts'
import type { DeckInfo, RoomInfo, RoomSummary, TossInfo } from '../../shared/protocol.ts'
import type { ClientCard } from '../ui/cardview.ts'
import type { MenuItem } from '../ui/Menu.tsx'

export type ScreenName = 'loading' | 'home' | 'lobby' | 'duel' | 'deck' | 'rooms' | 'options' | 'replays' | 'replay' | 'account' | 'tournaments'

export const store = {
  screen: 'loading' as ScreenName,
  connection: 'connecting' as 'connecting' | 'online' | 'offline',
  name: '',
  /** Vrai sur l'ordinateur qui héberge le serveur : peut fermer les salles et éjecter. */
  admin: false,
  decks: [] as DeckInfo[],
  /** Compte connecté sur cette connexion ; null : invité. */
  user: null as PublicUser | null,
  /** Bilan des duels du compte (chargé par l'écran Compte). */
  stats: null as UserStats | null,
  /** Formats de jeu et l'état de leur liste (prête, non vérifiée, absente). */
  formats: [] as FormatInfo[],
  /** Un tournoi auquel tu participes a changé : compteur, pour que l'écran des tournois se recharge. */
  tournamentRevision: 0,
  /** Chargement du démarrage : avancement des cartes (0 à 1, null si la taille est inconnue) et étape en cours. */
  loading: { progress: 0 as number | null, phase: 'cards' as 'cards' | 'connect' },
  /** Toutes les cartes de data/cards.json, par identifiant. */
  cards: new Map<number, ClientCard>(),
  /** Salle où se trouve le joueur (salon). */
  room: null as RoomInfo | null,
  /** Salons ouverts du réseau (écran « Salons »). */
  rooms: [] as RoomSummary[],
  /** Pile ou face d'avant-duel en cours. */
  toss: null as TossInfo | null,
  /** Message bref en haut de l'écran. */
  toast: null as { text: string; id: number } | null,
  /** Menu d'actions ouvert (au-dessus d'une carte ou d'un bouton). */
  /** `owner` : uid de la carte qui porte le menu ; la toucher de nouveau ne le referme pas. */
  menu: null as { anchor: DOMRect; items: MenuItem[]; promptId?: number; owner?: number } | null,
  /** Fenêtre de choix de deck ouverte (salon) : pour quelle place, pour un ordinateur ou non, deck actuel. */
  deckPicker: null as { seat: number; bot: boolean; current: string | null; who: string; currentSeries?: string } | null,
  /** Question de confirmation ouverte (jamais de boîte du navigateur : voir ui/ConfirmModal.tsx). */
  ask: null as { title: string; text: string; ok: string; danger: boolean; run: () => void } | null,
  fullscreen: false,
  replaySavingId: null as string | null,
  replaySavedIds: new Set<string>(),
  replayRevision: 0,
}

// Le nom survit à la fermeture du navigateur (localStorage) ; le jeton de session est propre à
// l'onglet (sessionStorage), ce qui permet de tester à deux joueurs avec deux onglets.
const area = (key: string): Storage => (key === 'token' ? sessionStorage : localStorage)

export const saved = {
  remove(key: string): void {
    try {
      area(key).removeItem(key)
    } catch {
      /* stockage indisponible */
    }
  },
  get(key: string): string | null {
    try {
      return area(key).getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      area(key).setItem(key, value)
    } catch {
      /* navigation privée : on s'en passe */
    }
  },
}

/** Avatar choisi sur cet appareil (numéro de carte), ou null. */
export function savedAvatar(): number | null {
  const n = Number(saved.get('avatar'))
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * Télécharge data/cards.json en suivant les octets reçus (`onProgress(reçus, total)` ; total = null si le serveur ne donne pas la taille).
 * Lecture par morceaux pour que la barre de chargement avance avec le vrai téléchargement.
 */
export async function loadCards(onProgress?: (done: number, total: number | null) => void): Promise<void> {
  const res = await fetch('/data/cards.json')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const length = Number(res.headers.get('Content-Length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  let list: ClientCard[]
  if (res.body) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let done = 0
    for (;;) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      chunks.push(value)
      done += value.length
      onProgress?.(done, total)
    }
    const bytes = new Uint8Array(done)
    let at = 0
    for (const c of chunks) (bytes.set(c, at), (at += c.length))
    list = JSON.parse(new TextDecoder().decode(bytes)) as ClientCard[]
  } else list = (await res.json()) as ClientCard[]
  for (const c of list) store.cards.set(c.id, c)
}
