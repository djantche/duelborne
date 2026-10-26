// Formats de jeu, défis et métadonnées d'un duel : ce que le client et le serveur ont en commun.
// Les listes de cartes (interdictions, points) et leur validation sont côté serveur (src/server/formats/).

/** casual : règles actuelles, sans liste · tcg / ocg : listes d'interdictions · goat : liste d'avril 2005 · genesys : budget de points. */
export type FormatId = 'casual' | 'tcg' | 'ocg' | 'goat' | 'genesys'
export const FORMAT_IDS: readonly FormatId[] = ['casual', 'tcg', 'ocg', 'goat', 'genesys']
export const DEFAULT_FORMAT: FormatId = 'casual'

/**
 * ready : sans liste à vérifier (jeu libre) · unverified : une liste est présente mais ni sa date officielle ni la réserve
 * de cartes n'ont été vérifiées · missing : aucune liste, le format ne peut pas être choisi.
 */
export type FormatStatus = 'ready' | 'unverified' | 'missing'

export interface FormatInfo {
  id: FormatId
  status: FormatStatus
  /** none : aucune liste · limits : 0, 1 ou 2 exemplaires par carte · points : budget de points (Genesys). */
  kind: 'none' | 'limits' | 'points'
  /** Région de la liste (TCG ou OCG), ou null. */
  region: 'TCG' | 'OCG' | null
  /** Date ou version de la liste telle que la source la donne, ou null si elle ne la donne pas. */
  version: string | null
  /** D'où vient la liste. */
  source: string | null
  /** Budget de points autorisé (Genesys). */
  cap: number | null
  /** Liste obtenue par synchronisation avec sa source (et non importée à la main ni livrée en instantané). */
  synced?: boolean
  /** Clés de traduction des limites connues de ce format (« format.note.… »). */
  notes: string[]
}

/** Un défaut d'un deck face à un format. `card` : la carte concernée, pour la repérer dans l'éditeur. */
export interface DeckIssue {
  /** Référence de message traduisible (voir shared/msg.ts). */
  text: string
  card?: number
  /** blocking : le deck n'est pas autorisé · info : à savoir, n'empêche pas de jouer. */
  level: 'blocking' | 'info'
}

export interface FormatCheck {
  format: FormatId
  legal: boolean
  issues: DeckIssue[]
  /** Points utilisés et budget (Genesys). */
  points: { used: number; cap: number } | null
}

// ───────────────────────────── Défis et règles maison ─────────────────────────────

/**
 * Condition de victoire supplémentaire, évaluée par le serveur sur la vue publique du duel (la victoire ordinaire reste possible) :
 *   lp-double : atteindre le double des points de vie de départ · graveyard : 12 cartes au Cimetière · monster-wall : 5 monstres en jeu ·
 *   banished : 10 cartes bannies · sprint : à la fin du 6e tour, le plus de points de vie gagne.
 */
export type ChallengeId = 'none' | 'lp-double' | 'graveyard' | 'monster-wall' | 'banished' | 'sprint'
export const CHALLENGE_IDS: readonly ChallengeId[] = ['none', 'lp-double', 'graveyard', 'monster-wall', 'banished', 'sprint']

/** Seuils des défis. */
export const CHALLENGE_RULES = { graveyard: 12, monsterWall: 5, banished: 10, sprintTurns: 6 } as const

/** Avantage de points de vie donné à une équipe : « équipe:points ». */
export type HandicapId = 'none' | '0:2000' | '0:4000' | '1:2000' | '1:4000'
export const HANDICAP_IDS: readonly HandicapId[] = ['none', '0:2000', '0:4000', '1:2000', '1:4000']

/** Points de vie de départ de chaque équipe, selon le réglage de base et l'avantage donné. */
export function startingLp(base: number, handicap: HandicapId): [number, number] {
  if (handicap === 'none') return [base, base]
  const [team, bonus] = handicap.split(':').map(Number) as [number, number]
  return team === 0 ? [base + bonus, base] : [base, base + bonus]
}

/** Tout ce qui caractérise une partie, pour la comprendre et la rejouer : enregistré avec le duel et son replay. */
export interface DuelMeta {
  mode: 'ai' | 'lan' | 'team' | 'sandbox' | 'aivai'
  format: { id: FormatId; status: FormatStatus; region: 'TCG' | 'OCG' | null; version: string | null }
  challenge: ChallengeId
  handicap: HandicapId
  /** Série de decks imposée (duel à thème), ou ''. */
  theme: string
  settings: { turnTime: number; startLp: number; startHand: number; drawPerTurn: number; first: string; shuffle: boolean }
  /** Équipe qui a commencé. */
  first: 0 | 1
  tournament?: { id: string; name: string; round: number }
}
