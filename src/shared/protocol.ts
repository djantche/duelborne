// Tout ce qui circule entre le serveur et les clients (WebSocket, JSON).
//
// Le serveur fait tourner le moteur de règles ocgcore et n'envoie à chaque joueur que SA vue :
// une carte que ce joueur n'a pas le droit de connaître a toujours cardId = null.
import { cleanAvatar } from './accounts.ts'
import type { PublicUser } from './accounts.ts'
import { CHALLENGE_IDS, DEFAULT_FORMAT, FORMAT_IDS, HANDICAP_IDS } from './formats.ts'
import type { ChallengeId, DeckIssue, FormatId, FormatInfo, HandicapId } from './formats.ts'

export type Seat = 0 | 1
export type Phase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end'
export type Position = 'atk' | 'def'
export type Winner = Seat | 'draw' | null

// ───────────────────────────── Vue du duel ─────────────────────────────

export interface CardView {
  /** Identité stable d'une carte physique tant qu'elle reste visible : sert aux animations. */
  uid: number
  /** Code de la carte, ou null si elle est cachée pour ce joueur. */
  cardId: number | null
}

/** Compteurs posés sur une carte, par type (« Compteur Parchemin »). */
export interface CounterView {
  name: string
  count: number
}

export interface MonsterView {
  card: CardView
  position: Position
  faceUp: boolean
  /** ATK / DEF actuelles (bonus compris), null si la carte est cachée. */
  atk: number | null
  def: number | null
  /** Nombre de Matériels Xyz attachés. */
  materials: number
  /** Identifiants des Matériels Xyz attachés (ils sont face recto : publics), du premier au dernier attaché. */
  materialCards?: number[]
  counters?: CounterView[]
}

export interface SpellTrapView {
  card: CardView
  faceUp: boolean
  /** Échelle Pendule si la carte occupe une Zone Pendule. */
  scale: number | null
  counters?: CounterView[]
}

export interface PlayerView {
  lp: number
  deckCount: number
  hand: CardView[]
  /** 7 zones : les 5 Zones Monstre Principales, puis les 2 Zones Monstre Extra (indices 5 et 6). */
  monsters: (MonsterView | null)[]
  spellTraps: (SpellTrapView | null)[]
  fieldZone: SpellTrapView | null
  graveyard: CardView[]
  banished: CardView[]
  /** Extra Deck : toutes ses cartes pour son propriétaire, seulement les cartes face recto pour l'adversaire. */
  extra: CardView[]
}

/** Infos minimales pour une carte absente de data/cards.json (certains Jetons). */
export interface MiniCard {
  name: string
  atk: number
  def: number
  level: number
  token: boolean
  /** Carte Magie (la Console du bac à sable) : cadre vert, sans ATK ni DEF. */
  spell?: boolean
  /** Texte de la carte, pour celles qui n'existent pas dans le catalogue. */
  desc?: string
}

export interface LogEntry {
  turn: number
  seat: Seat | null
  text: string
}

export interface DuelView {
  you: Seat
  players: [PlayerView, PlayerView]
  turn: number
  turnPlayer: Seat
  phase: Phase
  winner: Winner
  log: LogEntry[]
  /** Rang absolu de la première ligne du lot (le réseau transmet une fenêtre du journal). */
  logOffset?: number
  /** Question posée à CE joueur (null si c'est à l'autre de répondre ou si rien n'est attendu). */
  prompt: Prompt | null
  /** Joueur dont le moteur attend une réponse. */
  waitingFor: Seat | null
  /** Zones rendues inutilisables par des effets : « siège:m:rang » (monstres) ou « siège:s:rang » (Magies, Pièges, Terrain). */
  disabled: string[]
  /** Maillons de la chaîne en cours, du premier au dernier. */
  chain: { cardId: number; seat: Seat }[]
  /** Duel par équipes : vrai quand c'est ton coéquipier qui joue pour l'équipe (tu regardes, avec ta propre main). */
  spectating: boolean
  /** Duel par équipes : place du duelliste qui joue actuellement pour chaque équipe (absent en duel simple). */
  playing?: [number, number]
  /** Vrai pour un spectateur : il voit le duel comme le public, sans aucune main ni carte posée (équipe 1 en bas). */
  watching?: boolean
  /** Points de vie de départ (pour la jauge). */
  startLp: number
  /** Vrai si le duel utilise les Zones Monstre Extra (un des decks contient des monstres Lien ou Pendule). */
  extraZones: boolean
  unknownCards: Record<number, MiniCard>
}

// ───────────────────────────── Questions du moteur ─────────────────────────────

export type IdleAction = 'summon' | 'spsummon' | 'set' | 'sset' | 'position' | 'activate' | 'attack' | 'toBattle' | 'toMain2' | 'toEnd'

export type Zone = 'hand' | 'monster' | 'spellTrap' | 'graveyard' | 'banished' | 'deck' | 'extra' | 'overlay'

export interface PromptOption {
  /** Valeur à renvoyer pour choisir cette option. */
  id: number
  /** Carte concernée (null pour un changement de phase, ou pour une carte sans identité visible : Deck). */
  uid: number | null
  cardId: number | null
  zone: Zone | null
  action: IdleAction
  /** Précision affichée : texte de l'effet à activer. */
  label?: string
  /** Le moteur connaît un texte pour cet effet, même sans traduction sûre : il mérite un numéro. */
  hasText?: true
  /** Rang de cet effet parmi ceux de la carte, quand le script permet de le dire. */
  effect?: number
  /** Pour une attaque : l'attaque directe est possible. */
  direct?: boolean
}

export interface PromptCard {
  /** uid si la carte a une identité visible (terrain, main, Cimetière, bannies, Extra Deck), sinon null. */
  uid: number | null
  cardId: number | null
  seat: Seat
  zone: Zone
  /** Numéro de la zone du terrain (0-4 : zones principales, 5-6 : Zones Monstre Extra ; Magie/Piège : 0-4, 5 = Terrain). */
  index?: number
  /** Déjà sélectionnée (choix carte par carte). */
  selected?: boolean
}

/** Une zone du terrain. index : 0-4 zones principales, 5-6 Zones Monstre Extra. */
export interface PlaceRef {
  seat: Seat
  zone: 'monster' | 'spellTrap'
  index: number
}

/** undoable : le joueur peut encore revenir sur sa décision (rien n'a bougé sur le terrain). */
export type Prompt = { id: number; undoable?: boolean; /** Console : seuls les choix sans conséquence peuvent être repris. Facultatif pour les autres clients. */ consoleNavigation?: { back: boolean; home: boolean } } & (
  | { kind: 'idle' | 'battle'; options: PromptOption[] }
  | { kind: 'chain'; forced: boolean; options: { id: number; uid: number | null; cardId: number; zone: Zone; label?: string; hasText?: true; effect?: number }[] }
  | { kind: 'yesno'; text: string; cardId?: number; /** Choix d'attaque directe (indication système 31 du moteur). */ direct?: true }
  /** pick : nombre d'options à choisir (la réponse est alors la liste de leurs rangs). */
  /** rps : la question est un pierre-feuille-ciseaux (options : ciseaux, pierre, feuille), montré sous forme de cartes. */
  | { kind: 'option'; text: string; options: string[]; cardId?: number; pick?: number; rps?: true }
  | {
      kind: 'cards'
      text: string
      /** Identifiant de l'indication du moteur (500 = Tribut, 502 = détruire...), utile à l'IA. */
      hint: number
      min: number
      max: number
      cancelable: boolean
      /** multi : on envoie toute la sélection ; step : une carte à la fois, le moteur redemande. */
      mode: 'multi' | 'step'
      /** En mode step : on peut s'arrêter là. */
      finishable: boolean
      cards: PromptCard[]
      /** Cible d'une attaque : l'interface trace une flèche depuis l'attaquant. */
      attackerUid?: number
      /** Sélection par somme (Rituel, Synchro) : total à atteindre et valeurs possibles de chaque carte. */
      sum?: { target: number; amounts: number[][]; /** Niveaux déjà comptés par les cartes imposées. */ fixed?: number; /** Au moins ce total (sinon : exactement ce total). */ atLeast?: boolean }
      /** Les cartes se touchent dans l'ordre voulu (cartes à ordonner) : la réponse est la liste des rangs, dans cet ordre. */
      ordered?: boolean
      /** Sacrifices : valeur de chaque carte (certaines comptent pour 2) ; le total doit tenir entre min et max. */
      weights?: number[]
      /** Les premières cartes de la liste sont imposées (déjà cochées, non modifiables). */
      mustCount?: number
    }
  | { kind: 'place'; text: string; zones: PlaceRef[]; /** Nombre de zones à choisir. */ count: number }
  /** Déclarer le nom d'une carte : cards = les cartes permises. La réponse est l'identifiant de la carte. */
  | { kind: 'announce'; text: string; cards: number[] }
  /** Retirer des compteurs : combien sur chaque carte, pour un total de `total`. La réponse est un nombre par carte. */
  | { kind: 'counters'; text: string; total: number; counter: string; cards: { uid: number | null; cardId: number | null; seat: Seat; zone: Zone; index?: number; max: number }[] }
  | { kind: 'position'; cardId: number; options: { position: Position; faceUp: boolean }[] }
  | { kind: 'number'; text: string; options: number[] }
)

export type Answer = number | number[] | null

/** Invocation Spéciale par procédure : de quoi choisir la mise en scène. */
export type SummonKind = 'fusion' | 'synchro' | 'xyz' | 'link' | 'ritual'

/**
 * discard : défausse · mill : Deck → Cimetière · toGrave : envoyée au Cimetière · banish : bannie · toHand/toDeck/toExtra : renvoyée ·
 * material : attachée comme Matériel Xyz · toField : arrive sur le terrain depuis le Deck, le Cimetière, les cartes bannies ou l'Extra Deck ·
 * create : la carte vient d'être créée par un effet (jeton, carte ajoutée par la Console).
 */
export type MoveKind = 'discard' | 'mill' | 'toGrave' | 'banish' | 'toHand' | 'toDeck' | 'toExtra' | 'material' | 'toField' | 'create'

// ───────────────────────────── Événements (animations) ─────────────────────────────

/** Ce qui vient de se passer, dans l'ordre. Un événement ne contient jamais le code d'une carte cachée pour son destinataire. */
export type GameEvent =
  | { type: 'start'; firstPlayer: Seat }
  | { type: 'turn'; player: Seat; turn: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'draw'; player: Seat; count: number }
  | { type: 'summon'; player: Seat; uid: number; cardId: number; mode: 'normal' | 'flip' | 'special'; kind?: SummonKind; /** Matériaux devenus publics, fournis par le moteur pour une vraie Fusion. */ fusionMaterials?: { uid: number | null; cardId: number }[] }
  | { type: 'set'; player: Seat; uid: number; kind: 'monster' | 'spellTrap' }
  | { type: 'position'; player: Seat; uid: number; position: Position; faceUp: boolean; wasFaceUp: boolean }
  /** effect : rang de l'effet dans le script ; label aide à retrouver son texte dans la fiche. */
  | { type: 'chain'; player: Seat; uid: number | null; cardId: number; index: number; effect?: number; label?: string }
  | { type: 'chainResolve'; index: number }
  | { type: 'chainNegated'; index: number }
  /** Cartes ciblées par un effet. */
  | { type: 'target'; uids: number[] }
  | { type: 'attack'; player: Seat; attackerUid: number; targetUid: number | null }
  | { type: 'flip'; player: Seat; uid: number; cardId: number }
  /** Valeurs comparées : ATK de l'attaquant contre ATK ou DEF de la cible (null = attaque directe). */
  | { type: 'battle'; attackerUid: number; targetUid: number | null; attackerValue: number; targetValue: number | null; targetPosition: Position | null }
  /** to : où la carte va ensuite (Cimetière en général ; Bannie, Deck... selon l'effet). */
  | { type: 'destroy'; player: Seat; uid: number; cardId: number; to?: Zone; toPlayer?: Seat; faceUp?: boolean }
  | { type: 'tribute'; player: Seat; uid: number; to?: Zone; toPlayer?: Seat; faceUp?: boolean }
  | { type: 'damage'; player: Seat; amount: number; lp: number }
  | { type: 'recover'; player: Seat; amount: number; lp: number }
  | { type: 'cost'; player: Seat; amount: number; lp: number }
  | { type: 'dice'; player: Seat; results: number[] }
  | { type: 'coin'; player: Seat; results: boolean[] }
  /** Pierre-feuille-ciseaux d'une carte : la main de chaque équipe, dans l'ordre des équipes. */
  | { type: 'rps'; hands: [Hand, Hand] }
  | { type: 'shuffle'; player: Seat }
  /** Cartes montrées au joueur qui reçoit l'événement (carte ajoutée à la main par l'adversaire, etc.). */
  | { type: 'reveal'; cardIds: number[]; /** Contrôleur des cartes révélées ; facultatif pour les anciens replays. */ player?: Seat }
  /**
   * Une carte change de zone sans autre événement (défausse, bannissement, retour en main...).
   * uid est null pour une carte du Deck (le Deck n'a pas d'identités) ; cardId n'est donné que si la carte est publique.
   * into : le monstre Xyz qui reçoit la carte (how « material »), ou celui dont elle se détache.
   * intoIndex : sa zone, même s'il n'est pas encore affiché ; fromHolder : l'ancien porteur lors d'un transfert de matériels.
   * toPlayer : côté d'arrivée s'il diffère du départ (retour chez le propriétaire).
   * fromFaceUp / faceUp : faces publiques au départ et à l'arrivée (Pendules, bannissements face verso).
   */
  | { type: 'move'; player: Seat; uid: number | null; cardId: number | null; from: Zone; to: Zone; how: MoveKind; into?: number; intoIndex?: number; fromHolder?: number; toPlayer?: Seat; fromFaceUp?: boolean; faceUp?: boolean }
  | { type: 'counter'; uid: number | null; name: string; delta: number }
  | { type: 'shuffleDeck'; player: Seat }
  | { type: 'equip'; uid: number; targetUid: number }
  /** Un monstre change de contrôleur. */
  | { type: 'control'; player: Seat; uid: number }
  | { type: 'attackNegated' }
  /** Une carte montre son effet sans passer par la chaîne (effet continu, règle spéciale d'une carte...). */
  | { type: 'cardHint'; cardId: number }
  /**
   * finale : de quoi jouer la scène de fin quand une victoire a une cause visible — les cartes qui ont rempli la condition (les cinq pièces d'Exodia,
   * les monstres qui ont porté le coup fatal, l'effet qui a fait les dégâts). Absent pour un abandon, un Deck vide, le temps écoulé.
   */
  | { type: 'win'; winner: Seat | 'draw'; finale?: { kind: 'battle' | 'effect' | 'special'; cards: number[] } }

// ───────────────────────────── Accueil et salles ─────────────────────────────

export interface DeckInfo {
  id: string
  name: string
  series: string
  /** Carte emblème affichée sur la vignette. */
  cover: number
  mainCount: number
  extraCount: number
}

/** ai : contre l'ordinateur · lan : un contre un · team : deux contre deux · aivai : deux ordinateurs s'affrontent, on regarde. */
export type RoomMode = 'ai' | 'lan' | 'team' | 'sandbox' | 'aivai'

/** Niveau de l'ordinateur : débutant (règles simples), confirmé (essaie ses coups), expert (cherche plus loin). */
export type AiLevel = 'easy' | 'normal' | 'hard'
export const AI_LEVELS: { id: AiLevel; name: string }[] = [
  { id: 'easy', name: 'Débutant' },
  { id: 'normal', name: 'Confirmé' },
  { id: 'hard', name: 'Expert' },
]

export interface LobbySeat {
  name: string
  deck: string | null
  /** Le deck choisi, décrit : le joueur d'à côté ne connaît pas forcément ses decks personnels. */
  deckInfo: DeckInfo | null
  /** Le deck respecte-t-il le format de la salle ? null : pas de deck, ou deck tiré au sort pour l'ordinateur. */
  legal: boolean | null
  /** Pourquoi le deck n'est pas autorisé (référence de message), quand il ne l'est pas. */
  issue?: string
  ready: boolean
  connected: boolean
  bot: boolean
  /** Niveau, pour une place tenue par l'ordinateur. */
  level?: AiLevel
  /** Deck tiré au hasard parmi cette série de decks du jeu (place de l'ordinateur sans deck choisi). */
  randomSeries?: string
}

/** Une main de pierre-feuille-ciseaux : 0 pierre, 1 feuille, 2 ciseaux (voir rps.ts). */
export type Hand = 0 | 1 | 2

/** Paramètres d'une partie, réglés dans le salon avant de commencer. */
export interface DuelSettings {
  /** Secondes accordées pour chaque décision ; 0 = illimité. Temps écoulé = défaite. */
  turnTime: number
  startLp: number
  startHand: number
  drawPerTurn: number
  /** Qui commence : pile ou face ou pierre-feuille-ciseaux (le gagnant choisit), au hasard, ou l'équipe 1 / 2 (places paires / impaires). */
  first: 'coin' | 'rps' | 'random' | 0 | 1
  /** Mélanger les Decks au départ (à désactiver seulement pour tester une combinaison). */
  shuffle: boolean
  /** Format de jeu : le serveur n'accepte que des decks qui le respectent (voir shared/formats.ts). */
  format: FormatId
  /** Condition de victoire supplémentaire. */
  challenge: ChallengeId
  /** Avantage de points de vie donné à une équipe. */
  handicap: HandicapId
  /** Série de decks imposée (duel à thème), ou '' pour tous les decks. */
  theme: string
}

export const DEFAULT_SETTINGS: DuelSettings = { turnTime: 300, startLp: 8000, startHand: 5, drawPerTurn: 1, first: 'coin', shuffle: true, format: DEFAULT_FORMAT, challenge: 'none', handicap: 'none', theme: '' }

/** Valeurs proposées (et acceptées par le serveur) pour chaque paramètre numérique. */
export const SETTING_CHOICES = {
  turnTime: [0, 60, 120, 180, 300, 600],
  startLp: [2000, 4000, 8000, 16000],
  startHand: [4, 5, 6, 7],
  drawPerTurn: [1, 2],
} as const

/** Pierre-feuille-ciseaux d'avant-duel : une manche à la fois, rejouée tant qu'il y a égalité. */
export interface RpsInfo {
  /** Numéro de la manche (1, puis 2 après une égalité...). */
  round: number
  /** pick : on choisit sa carte · reveal : les deux cartes se découvrent et s'entrechoquent · won : la manche est tranchée. */
  phase: 'pick' | 'reveal' | 'won'
  /** Tu joues pour ton équipe (sinon, un coéquipier joue à ta place et tu regardes). */
  plays: boolean
  /** Ton équipe a choisi sa carte ; l'autre équipe a choisi la sienne (sans qu'on sache laquelle). */
  picked: boolean
  foePicked: boolean
  /** Les deux cartes, dans l'ordre des équipes (équipe 1, équipe 2) : seulement une fois révélées. */
  picks: [Hand, Hand] | null
  /** Équipe gagnante de la manche, 'draw' pour une égalité (la manche est rejouée). */
  outcome: Seat | 'draw' | null
}

/** Tirage d'avant-duel (pile ou face, ou pierre-feuille-ciseaux). L'équipe désignée choisit qui commence. */
export interface TossInfo {
  /** coin : l'équipe 1 est « pile », l'équipe 2 « face » · rps : pierre-feuille-ciseaux. */
  kind: 'coin' | 'rps'
  /** Détail de la manche en cours (pierre-feuille-ciseaux). */
  rps?: RpsInfo
  /** Équipe désignée par la pièce, ou gagnante de la manche. */
  winner: Seat
  /** Ton équipe. */
  you: Seat
  /** Nom de chaque équipe. */
  names: string[]
  /** Nom du joueur qui choisit, et si c'est toi. */
  chooser: string
  choose: boolean
  /** Équipe qui commence, une fois le choix fait (le duel démarre juste après). */
  first: Seat | null
  /** Temps laissé pour choisir (ms) ; passé ce délai, l'équipe désignée commence. */
  ms: number
}

/** Un salon, tel que la liste des salles le montre. */
export interface RoomSummary {
  id: string
  mode: RoomMode
  /** lobby : on prépare la partie · toss : pile ou face · duel : en cours · over : terminé. */
  state: 'lobby' | 'toss' | 'duel' | 'over'
  /** Joueurs assis (null : place libre) ; bot : tenue par l'ordinateur. */
  seats: ({ name: string; bot: boolean } | null)[]
  spectators: number
  turn: number
  /** On peut s'y asseoir / la regarder. */
  open: boolean
  watchable: boolean
  format: FormatId
  challenge: ChallengeId
  theme: string
  /** Salon d'un match de tournoi privé : réservé à ses deux joueurs. */
  tournament: boolean
}

export interface RoomInfo {
  id: string
  mode: RoomMode
  settings: DuelSettings
  /** Ta place dans la salle. Places paires = équipe 1, impaires = équipe 2 (2 places en duel simple, 4 par équipes). −1 : tu n'as pas de place (IA contre IA : tu regardes). */
  you: number
  seats: (LobbySeat | null)[]
  /** Match de tournoi : les réglages sont imposés et la salle est réservée. */
  tournament?: { id: string; name: string; round: number }
}

/** Un duelliste, à sa place (places paires = équipe 1, impaires = équipe 2). */
export interface DuelPlayer {
  place: number
  name: string
  /** Carte dont l'illustration sert d'avatar ; null : aucun. */
  avatar: number | null
  bot: boolean
}

// ───────────────────────────── Messages ─────────────────────────────

export type ClientMessage =
  /** Premier message : ouvre une session, ou reprend celle du jeton (reconnexion). */
  | { t: 'hello'; name: string; token?: string; auth?: string; guest?: string; avatar?: number | null }
  /** Connexion ou déconnexion d'un compte sur une connexion déjà ouverte (token : jeton de session de connexion, null pour se déconnecter). */
  | { t: 'auth'; token: string | null }
  | { t: 'rename'; name: string }
  /** Avatar choisi (carte dont l'illustration représente le joueur), ou null pour aucun. */
  | { t: 'avatar'; avatar: number | null }
  /** ai / sandbox : duel contre l'ordinateur (le bac à sable ajoute la Console) ; lan / team : rejoint la salle ouverte du réseau local, ou en crée une. */
  | { t: 'play'; mode: RoomMode }
  /** Quitte la salle (abandonne le duel en cours). */
  | { t: 'leave' }
  | { t: 'deck'; deck: string }
  /** Deck d'un ordinateur (celui de la place indiquée) ; null = au hasard. */
  /** series : (avec deck null) tirer le deck au hasard parmi cette série de decks du jeu. */
  | { t: 'aiDeck'; deck: string | null; seat?: number; series?: string }
  /** Niveau d'un ordinateur (celui de la place indiquée). */
  | { t: 'aiLevel'; level: AiLevel; seat?: number }
  /** Duel par équipes : s'asseoir à une place libre, y mettre ou en retirer un ordinateur. */
  | { t: 'seat'; seat: number }
  | { t: 'bot'; seat: number; add: boolean }
  | { t: 'ready'; ready: boolean }
  | { t: 'settings'; settings: Partial<DuelSettings> }
  /** Le gagnant du pile ou face choisit de commencer (first) ou de jouer en second. */
  | { t: 'toss'; first: boolean }
  /** Pierre-feuille-ciseaux d'avant-duel : la carte choisie. */
  | { t: 'rps'; hand: Hand }
  | { t: 'answer'; id: number; value: Answer }
  /** Revenir sur sa dernière décision, tant qu'aucune carte n'a été posée ni aucun effet activé. */
  | { t: 'undo' }
  | { t: 'consoleNavigate'; id: number; destination: 'back' | 'home' }
  /** IA contre IA : l'écran du spectateur a fini de jouer ce qu'il a reçu ; les ordinateurs peuvent continuer. */
  | { t: 'idle' }
  | { t: 'surrender' }
  | { t: 'rematch' }
  /** Archive publique du match terminé, réservée aux participants et spectateurs de sa salle. */
  | { t: 'replay'; id: string }
  /** Liste des salons ouverts du réseau (réponse : « rooms »). */
  | { t: 'rooms' }
  /** Rejoint une salle (comme joueur, si une place est libre) ou la regarde (spectateur, quand le duel a commencé). */
  | { t: 'join'; room: string; spectate: boolean }
  /** Réservé à l'ordinateur qui héberge le serveur : éjecte un joueur. */
  | { t: 'kick'; seat?: number }
  /** Tournoi : rejoint (ou ouvre) le salon du match indiqué. */
  | { t: 'tournamentMatch'; tournament: string; match: string; spectate?: boolean }

export type ServerMessage =
  | { t: 'session'; token: string; name: string; admin: boolean; decks: DeckInfo[]; user: PublicUser | null; formats: FormatInfo[]; authInvalid?: boolean }
  /** Un tournoi auquel tu participes a changé (appariement prêt, résultat) : recharge-le si tu l'as ouvert. */
  | { t: 'tournamentUpdate'; id: string; reason: 'match' | 'result' | 'state' }
  /** Le joueur n'est dans aucune salle. */
  | { t: 'home'; reason?: 'kicked' | 'reset' | 'closed' }
  | { t: 'lobby'; room: RoomInfo }
  | { t: 'toss'; toss: TossInfo }
  /** events : ce qui vient de se passer (vide lors d'une simple resynchronisation). */
  /** timer : temps restant (ms) à l'équipe dont on attend la réponse ; null si le temps n'est pas limité. */
  | { t: 'state'; view: DuelView; events: GameEvent[]; names: string[]; connected: boolean[]; timer: { seat: Seat; ms: number } | null; matchId?: string; room?: RoomInfo; players?: DuelPlayer[] }
  | { t: 'replay'; replay: import('./replay.ts').MatchReplay }
  | { t: 'error'; message: string }
  | { t: 'rooms'; rooms: RoomSummary[] }

export type { DeckIssue }

const isInt = (v: unknown): v is number => Number.isInteger(v)
const isSeat = (v: unknown): v is number => isInt(v) && v >= 0 && v < 4
const cleanName = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, 24) : '') || 'Joueur'

/** Ne garde que des valeurs proposées : un client ne peut pas inventer un réglage. */
export function cleanSettings(value: unknown): Partial<DuelSettings> {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const settings: Partial<DuelSettings> = {}
  for (const key of ['turnTime', 'startLp', 'startHand', 'drawPerTurn'] as const) {
    if ((SETTING_CHOICES[key] as readonly number[]).includes(raw[key] as number)) settings[key] = raw[key] as number
  }
  if (raw.first === 'coin' || raw.first === 'rps' || raw.first === 'random' || raw.first === 0 || raw.first === 1) settings.first = raw.first
  if (typeof raw.shuffle === 'boolean') settings.shuffle = raw.shuffle
  if (FORMAT_IDS.includes(raw.format as FormatId)) settings.format = raw.format as FormatId
  if (CHALLENGE_IDS.includes(raw.challenge as ChallengeId)) settings.challenge = raw.challenge as ChallengeId
  if (HANDICAP_IDS.includes(raw.handicap as HandicapId)) settings.handicap = raw.handicap as HandicapId
  if (typeof raw.theme === 'string' && raw.theme.length <= 30) settings.theme = raw.theme
  return settings
}

/** Valide la forme d'un message reçu du réseau (les règles, elles, sont vérifiées par le moteur). */
export function parseClientMessage(text: string): ClientMessage | null {
  let m: unknown
  try {
    m = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null) return null
  const o = m as Record<string, unknown>
  switch (o.t) {
    case 'hello':
      return { t: 'hello', name: cleanName(o.name), token: typeof o.token === 'string' ? o.token.slice(0, 64) : undefined, auth: typeof o.auth === 'string' ? o.auth.slice(0, 100) : undefined, guest: typeof o.guest === 'string' && /^[a-f0-9]{64}$/.test(o.guest) ? o.guest : undefined, ...(o.avatar !== undefined ? { avatar: cleanAvatar(o.avatar) } : {}) }
    case 'auth':
      return { t: 'auth', token: typeof o.token === 'string' ? o.token.slice(0, 100) : null }
    case 'tournamentMatch':
      return typeof o.tournament === 'string' && /^[\w-]{1,40}$/.test(o.tournament) && typeof o.match === 'string' && /^[\w-]{1,40}$/.test(o.match) ? { t: 'tournamentMatch', tournament: o.tournament, match: o.match, spectate: o.spectate === true } : null
    case 'rename':
      return { t: 'rename', name: cleanName(o.name) }
    case 'avatar':
      return { t: 'avatar', avatar: cleanAvatar(o.avatar) }
    case 'play':
      return o.mode === 'ai' || o.mode === 'lan' || o.mode === 'team' || o.mode === 'sandbox' || o.mode === 'aivai' ? { t: 'play', mode: o.mode } : null
    case 'seat':
      return isSeat(o.seat) ? { t: 'seat', seat: o.seat } : null
    case 'bot':
      return isSeat(o.seat) ? { t: 'bot', seat: o.seat, add: o.add === true } : null
    case 'kick':
      return isSeat(o.seat) ? { t: 'kick', seat: o.seat } : { t: 'kick' }
    case 'deck':
      return typeof o.deck === 'string' && o.deck.length < 80 ? { t: 'deck', deck: o.deck } : null
    case 'aiDeck':
      return o.deck === null || (typeof o.deck === 'string' && o.deck.length < 80) ? { t: 'aiDeck', deck: o.deck, ...(isSeat(o.seat) ? { seat: o.seat } : {}), ...(o.deck === null && typeof o.series === 'string' && o.series.length > 0 && o.series.length <= 40 ? { series: o.series } : {}) } : null
    case 'aiLevel':
      return AI_LEVELS.some((l) => l.id === o.level) ? { t: 'aiLevel', level: o.level as AiLevel, ...(isSeat(o.seat) ? { seat: o.seat } : {}) } : null
    case 'ready':
      return { t: 'ready', ready: o.ready === true }
    case 'toss':
      return { t: 'toss', first: o.first === true }
    case 'rps':
      return o.hand === 0 || o.hand === 1 || o.hand === 2 ? { t: 'rps', hand: o.hand } : null
    case 'settings':
      return { t: 'settings', settings: cleanSettings(o.settings) }
    case 'leave':
    case 'undo':
    case 'idle':
    case 'surrender':
    case 'rematch':
    case 'rooms':
      return { t: o.t }
    case 'join':
      return typeof o.room === 'string' && o.room.length < 20 ? { t: 'join', room: o.room, spectate: o.spectate === true } : null
    case 'replay':
      return typeof o.id === 'string' && /^[\w-]{1,100}$/.test(o.id) ? { t: 'replay', id: o.id } : null
    case 'consoleNavigate':
      return Number.isSafeInteger(o.id) && (o.destination === 'back' || o.destination === 'home') ? { t: 'consoleNavigate', id: o.id as number, destination: o.destination } : null
    case 'answer': {
      const v = o.value
      const ok = v === null || isInt(v) || (Array.isArray(v) && v.length <= 200 && v.every(isInt))
      return isInt(o.id) && ok ? { t: 'answer', id: o.id, value: v as Answer } : null
    }
    default:
      return null
  }
}
