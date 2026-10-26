// État de l'écran de duel, partagé par ses composants et par le contrôleur.
import type { DuelPlayer, DuelView, GameEvent, PromptOption } from '../../../shared/protocol.ts'
import type { Arrow } from './anim.ts'

export type Side = 'me' | 'foe'

export interface ActiveEffect {
  cardId: number
  uid: number | null
  n: number
  label?: string
  index: number
}

/** Effet activé pendant le tour en cours (activation annulée comprise : elle compte pour les limites par tour). */
export interface UsedEffect {
  cardId: number
  uid: number | null
  n: number
  label?: string
  turn: number
}

export const duel = {
  matchId: null as string | null,
  view: null as DuelView | null,
  names: [] as string[],
  /** Chaque duelliste à sa place, avec son avatar (absent : on s'en tient aux noms d'équipe). */
  players: [] as DuelPlayer[],
  connected: [] as boolean[],
  /**
   * Numéro de l'état affiché. Le terrain (tapis et mains) est reconstruit à chaque nouvel état, ce qui efface
   * tout ce que les animations y ont laissé ; le reste de l'écran est seulement mis à jour.
   */
  version: 0,
  /** Vrai pendant qu'une séquence d'animation se joue : les clics sur le plateau sont ignorés. */
  busy: false,
  /** Scène de fin de duel en cours (terrain vidé, cartes de la victoire mises en avant) : l'écran de résultat attend qu'elle se termine. */
  finale: false,
  /** Compte à rebours de la décision en cours : équipe concernée et heure d'échéance (horloge locale). */
  clock: null as { seat: number; end: number } | null,

  // ── Fiche de carte ──
  /** Carte dont on lit la fiche (colonne de gauche sur ordinateur, bandeau puis fiche sur téléphone). */
  focusId: null as number | null,
  /** Exemplaire (uid) dont on lit la fiche : ses compteurs s'y ajoutent. */
  focusUid: null as number | null,
  /** Une carte a été touchée : sa fiche reste, le survol ne la change plus (jusqu'à un clic ailleurs ou Échap). */
  pinned: false,
  /** Fenêtre d'aide des raccourcis clavier (touche « ? »). */
  keysHelp: false,
  /** Effet en cours d'activation ou de résolution : son paragraphe est surligné dans la fiche de la carte. */
  activeEffect: null as ActiveEffect | null,
  /** Effet choisi explicitement dans un aperçu : sa lecture survit à la suite de la chaîne. */
  inspectedEffect: null as ActiveEffect | null,
  /** Effets encore dans la chaîne : leurs fiches restent repérées pendant les réponses. */
  pendingEffects: [] as ActiveEffect[],
  /** Effets activés ce tour : leur paragraphe porte une coche dans la fiche. */
  usedEffects: [] as UsedEffect[],
  /**
   * Chaîne montrée pendant une séquence : un maillon y entre à son activation et n'en sort qu'une fois son effet résolu,
   * c'est-à-dire quand le maillon précédent commence à se résoudre ou que la séquence est finie. null : la vue reçue fait foi.
   */
  chainShown: null as DuelView['chain'] | null,
  /** Carte source (uid) de chaque maillon de la chaîne en cours : la vue du serveur ne les donne pas, la séquence les retient. */
  chainUids: [] as (number | null)[],
  /** La chaîne a compté au moins deux maillons : la barre reste jusqu'à la résolution du dernier, même s'il est seul. */
  chainLong: false,
  /** Téléphone : la fiche complète est ouverte (appui long sur une carte, ou toucher le bandeau). */
  sheet: false,

  // ── Question en cours ──
  /** La fenêtre de choix est masquée pour consulter le terrain ; les choix en cours sont conservés. */
  promptHidden: false,
  /** Confirmation d'une attaque directe : l'attaque choisie, en attente d'un toucher sur le terrain adverse. */
  direct: null as PromptOption | null,
  /** Cible d'attaque choisie ; null vise par défaut la première cible légale. Confirmation explicite. */
  attackTarget: null as number | null,
  /** Cartes cochées pour la question en cours (indices dans prompt.cards), en attente de validation. */
  picked: [] as number[],
  /** Sélection sur le plateau : la fenêtre des cartes qui n'y sont pas (Deck, Extra Deck, Cimetière) est ouverte. */
  offboardOpen: false,
  /** Réponse en chaîne : vignette désignée dans la fenêtre (indice parmi les cartes proposées), avant le choix de son effet. */
  replyGroup: null as number | null,
  /** Carte de la main que le joueur vient de toucher : elle reste soulevée jusqu'au prochain clic ailleurs. */
  handLocked: false,
  raised: null as number | null,
  /** Déclarer une carte : la carte retenue, et le texte tapé dans la recherche. */
  announced: null as number | null,
  search: '',
  /** Retirer des compteurs : nombre retiré sur chaque carte proposée. */
  counts: [] as number[],
  /** Fenêtre de consultation ouverte : une pile, ou le journal. */
  viewer: null as { kind: 'gy' | 'extra' | 'banished'; side: Side } | { kind: 'log' } | null,
  logQuery: '',
  logFilters: false,
  logSeat: 'all' as 'all' | 'me' | 'foe',
  logKind: 'all' as 'all' | 'effects' | 'combat' | 'moves',
  logTurn: 0,
  logFollow: true,
  logScroll: 0,
  logReadCount: 0,

  // ── Décor ──
  /** Décor effectivement présenté (« moi:adversaire », 0 = aucun), validé après la résolution. */
  fieldCard: null as string | null,

  // ── Flèches de visée (dessinées dans le calque d'effets) ──
  targetArrow: null as Arrow | null,
  directArrow: null as Arrow | null,
}

/** Appelé aussi sans animations (onglet masqué) pour garder les fiches à jour. */
export function trackEffect(event: GameEvent): void {
  if (event.type === 'start' || event.type === 'turn') {
    duel.pendingEffects = []
    duel.activeEffect = null
    duel.usedEffects = []
    usedTurn = event.type === 'turn' ? event.turn : 1
  } else if (event.type === 'chain') {
    if (event.index === 1) duel.pendingEffects = []
    const effect: ActiveEffect = { cardId: event.cardId, uid: event.uid, n: event.effect ?? 0, label: event.label, index: event.index }
    duel.pendingEffects = [...duel.pendingEffects.filter((e) => e.index !== event.index), effect]
    duel.activeEffect = effect
    duel.usedEffects = [...duel.usedEffects, { cardId: event.cardId, uid: event.uid, n: effect.n, label: event.label, turn: usedTurn }]
  } else if (event.type === 'chainResolve' || event.type === 'chainNegated') {
    if (event.type === 'chainResolve') duel.activeEffect = duel.pendingEffects.find((e) => e.index === event.index) ?? duel.activeEffect
    duel.pendingEffects = duel.pendingEffects.filter((e) => e.index !== event.index)
    if (event.type === 'chainNegated' && duel.activeEffect?.index === event.index) duel.activeEffect = null
  }
}

let usedTurn = 0

/** Duel quitté, ou saut dans une relecture : le tour en cours n'est plus suivi depuis son début. */
export function forgetUsedEffects(): void {
  duel.usedEffects = []
  usedTurn = 0
}

/**
 * Effets de cette carte déjà utilisés ce tour : ceux de l'exemplaire consulté, et ceux de tous ses exemplaires
 * quand le texte limite l'effet par nom de carte (« Vous ne pouvez utiliser … de "Nom" … une fois par tour »).
 */
export function usedEffectsOf(cardId: number, uid: number | null, byName: boolean): UsedEffect[] {
  const turn = duel.view?.turn
  return duel.usedEffects.filter((e) => e.cardId === cardId && (turn === undefined || e.turn === turn) && (byName || uid === null || e.uid === null || e.uid === uid))
}

/** L'exemplaire consulté garde son repère même si une autre carte ajoute un maillon. */
export function effectOfCard(cardId: number, uid: number | null): ActiveEffect | null {
  const matches = (effect: ActiveEffect): boolean => effect.cardId === cardId && (uid === null || effect.uid === null || effect.uid === uid)
  if (duel.activeEffect && matches(duel.activeEffect)) return duel.activeEffect
  return duel.pendingEffects.findLast(matches) ?? null
}
