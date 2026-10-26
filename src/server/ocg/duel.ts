// Un duel conduit par le moteur ocgcore.
//
// Le moteur avance par petites étapes (duelProcess) et émet des messages : ce qui s'est passé, ou
// une question à un joueur. À chaque étape on relit tout le terrain, on traduit les messages en
// événements pour les animations, et on s'arrête dès qu'une réponse d'un joueur est nécessaire.
import { randomBytes, randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import createCore, { OcgDuelMode, OcgHintType, OcgLocation, OcgMessageType, OcgPhase, OcgPosition, OcgProcessResult } from '../../../vendor/ocgcore/dist/index.js'
import type { OcgCoreSync, OcgDuelHandle, OcgMessage, OcgResponse } from '../../../vendor/ocgcore/dist/index.js'
import type { Answer, CardView, DuelSettings, DuelView, GameEvent, Hand, LogEntry, MoveKind, Phase, Position, Prompt, Seat, SummonKind, Winner, Zone } from '../../shared/protocol.ts'
import { TYPE, cardData, cardName, counterName, describeMsg, displayId, effectNumber, idByEnglishName, readScript, victoryText } from './data.ts'
import { CONSOLE_CODE, CONSOLE_MAIN_REF } from './sandbox.ts'
import type { DeckList } from './decks.ts'
import { buildQuestion } from './prompts.ts'
import type { Pending, PromptCtx } from './prompts.ts'
import { ATTACK, UidTracker, cardAt, isFaceUp, readSnapshot } from './snapshot.ts'
import type { Card, Snap } from './snapshot.ts'
import { buildView } from './view.ts'
import { msg } from '../../shared/msg.ts'
import { startingLp } from '../../shared/formats.ts'
import { handFromCore } from '../../shared/rps.ts'

/** Cartes (par leur nom anglais) qui font une victoire particulière, selon la raison donnée par le moteur ; dans l'ordre où on les range à l'écran. */
const SPECIAL_WINS: Record<number, string[]> = {
  0x10: ['Left Leg of the Forbidden One', 'Left Arm of the Forbidden One', 'Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Right Leg of the Forbidden One'],
  0x11: ['Final Countdown'],
  0x12: ['Vennominaga the Deity of Poisonous Snakes'],
  0x13: ['Holactie the Creator of Light'],
  0x14: ['Exodius the Ultimate Forbidden Lord'],
  0x15: ['Spirit Message "I"', 'Spirit Message "N"', 'Destiny Board', 'Spirit Message "A"', 'Spirit Message "L"'],
  0x16: ['Last Turn'],
  0x17: ['Number 88: Gimmick Puppet of Leo'],
  0x18: ['Number C88: Gimmick Puppet Disaster Leo'],
  0x19: ['Jackpot 7'],
  0x1a: ['Relay Soul'],
  0x1b: ['Ghostrick Angel of Mischief'],
  0x1c: ['Phantasm Spiral Assault'],
  0x1d: ['F.A. Winners'],
  0x1e: ['Flying Elephant'],
}

const COMPAT = readFileSync(new URL('./compat.lua', import.meta.url), 'utf8')

let corePromise: Promise<OcgCoreSync> | null = null
const getCore = (): Promise<OcgCoreSync> => (corePromise ??= createCore({ sync: true }))

const REASON_DESTROY = 0x1
const REASON_RELEASE = 0x2
const REASON_DISCARD = 0x4000
const REASON_BATTLE = 0x20
const REASON_EFFECT = 0x40

/**
 * Carte citée dans le journal : « ⟦numéro|nom⟧ ». Le client en fait un lien vers sa fiche. Le journal est le même pour
 * les deux joueurs : on n'y cite jamais une carte cachée.
 */
const ref = (code: number): string => `⟦${displayId(code)}|${cardName(code)}⟧`
const faceDown = msg('log.facedownMonster')
const FACEUP_ANY = OcgPosition.FACEUP_ATTACK | OcgPosition.FACEUP_DEFENSE

/** Type du moteur → mise en scène de l'Invocation Spéciale par procédure. */
const SUMMON_KINDS: [number, SummonKind][] = [
  [0x40, 'fusion'],
  [0x80, 'ritual'],
  [0x2000, 'synchro'],
  [TYPE.XYZ, 'xyz'],
  [TYPE.LINK, 'link'],
]

/** Précision d'une Invocation Spéciale : par quelle procédure. */
function summonNote(mode: string, type: number): string {
  if (mode !== 'special') return ''
  const kind = SUMMON_KINDS.find(([bit]) => (type & bit) !== 0)?.[1]
  return kind ? msg('log.noteKind', { kind: msg(`log.kind.${kind}`) }) : ''
}

const zoneOf = (loc: number, overlay = false): Zone | null =>
  overlay
    ? 'overlay'
    : loc & OcgLocation.HAND
      ? 'hand'
      : loc & OcgLocation.MZONE
        ? 'monster'
        : loc & OcgLocation.SZONE
          ? 'spellTrap'
          : loc & OcgLocation.GRAVE
            ? 'graveyard'
            : loc & OcgLocation.REMOVED
              ? 'banished'
              : loc & OcgLocation.DECK
                ? 'deck'
                : loc & OcgLocation.EXTRA
                  ? 'extra'
                  : null

const PHASES: [number, Phase][] = [
  [OcgPhase.DRAW, 'draw'],
  [OcgPhase.STANDBY, 'standby'],
  [OcgPhase.MAIN1, 'main1'],
  [OcgPhase.BATTLE_START, 'battle'],
  [OcgPhase.MAIN2, 'main2'],
  [OcgPhase.END, 'end'],
]

/**
 * Mélange un Deck (Fisher-Yates). Le moteur ne mélange PAS les Decks au début du duel : c'est à
 * l'hôte de le faire avant de lui donner les cartes, sinon chacun pioche toujours la fin de sa liste.
 * @param seed pour les tests : mélange reproductible ; sinon hasard cryptographique
 */
function shuffled(cards: number[], seed?: bigint): number[] {
  const list = [...cards]
  let state = Number((seed ?? 0n) & 0xffffffffn) || 1
  const below = (n: number): number => {
    if (seed === undefined) return randomInt(n)
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) % n
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = below(i + 1)
    ;[list[i], list[j]] = [list[j] as number, list[i] as number]
  }
  return list
}

/**
 * Un lot d'animations et l'état qui en résulte, pour chaque place de la salle.
 * Places paires = équipe 0, impaires = équipe 1 ; en duel par équipes, les places 2 et 3 sont les
 * seconds duellistes de chaque équipe.
 */
export interface Step {
  events: GameEvent[][]
  views: DuelView[]
  /** Ce que voient les spectateurs : le public, sans aucune carte cachée. */
  watch: { events: GameEvent[]; view: DuelView }
}

/** Ce qu'il faut pour recréer le duel à l'identique : graine du moteur et cartes dans l'ordre mélangé. */
interface Setup {
  seed: [bigint, bigint, bigint, bigint]
  startingHand: number
  /** Points de vie de départ les plus hauts (la jauge des points de vie s'y rapporte). */
  startLp: number
  /** Points de vie de départ de chaque équipe du moteur (index 0 : l'équipe qui commence). */
  lp: [number, number]
  drawPerTurn: number
  cards: { team: 0 | 1; duelist: number; code: number; location: number; sequence?: number; position?: number }[]
}

/** Événement en attente d'envoi ; `only` le réserve à un seul joueur (carte révélée). */
interface Out {
  event: GameEvent
  only?: Seat
  identity?: { seat: Seat; cardId: number }
}

export class Duel {
  /** Pour les diagnostics (tools/audit) : reçoit chaque message du moteur avant qu'il soit traité. */
  static trace: ((m: OcgMessage) => void) | null = null
  finished = false
  winner: Winner = null
  /** Nombre de réponses de joueurs refusées par le moteur (diagnostic). */
  refused = 0
  private core: OcgCoreSync
  private handle!: OcgDuelHandle
  private setup: Setup
  /** seatOf[i] = équipe du joueur n°i du moteur ; le joueur 0 du moteur commence. */
  private seatOf: [Seat, Seat]
  /** Nombre de places : 2 en duel simple, 4 par équipes. */
  private places: number
  /** Par joueur du moteur : lequel des deux duellistes de l'équipe joue en ce moment. */
  private active: [number, number] = [0, 0]
  /** Par place : la main mise de côté pendant que le coéquipier joue (elle reste visible de son propriétaire). */
  private stash = new Map<number, CardView[]>()
  private stashUid = -1
  private extraZones: boolean
  private uids = new UidTracker()
  private snap!: Snap
  private turn = 0
  private turnPlayer: Seat
  private phase: Phase = 'draw'
  private lp: [number, number] = [8000, 8000]
  /** Zones rendues inutilisables par des effets : bits du moteur (16 par joueur du moteur). */
  private disabled = 0
  private log: LogEntry[] = []
  private pending: Pending | null = null
  private promptId = 0
  /** Dernière indication « choisis... » reçue par chaque joueur du moteur. */
  private hint: [number, number] = [0, 0]
  private attackerUid: number | null = null
  /** Maillons de la chaîne en cours (carte et équipe de chacun), pour nommer ce qui cible, résout ou est annulé. */
  private chainLog: { code: number; seat: Seat }[] = []
  private fusionMaterials: { uid: number | null; cardId: number }[] = []
  private inBattle = false
  /** Monstres qui ont attaqué ce tour : ils portent le coup fatal si la partie se termine au combat. */
  private attackers: { code: number; seat: Seat; turn: number }[] = []
  private autoAnswers = 0
  /** Toutes les réponses des joueurs, dans l'ordre : de quoi rejouer le duel jusqu'à un point donné. */
  private history: Answer[] = []
  /**
   * Dernière décision d'un joueur (action de Main Phase ou de Battle Phase). Tant que rien de visible
   * ne s'est produit depuis (aucun événement, terrain inchangé), il peut revenir dessus.
   */
  private checkpoint: { index: number; place: number; mark: string; events: number } | null = null
  /** Navigation des choix de la Console, avant toute conséquence sur le duel. */
  private consoleFlow: { place: number; points: { index: number; mark: string }[] } | null = null

  private constructor(core: OcgCoreSync, seatOf: [Seat, Seat], places: number, extraZones: boolean, setup: Setup) {
    this.core = core
    this.seatOf = seatOf
    this.places = places
    this.extraZones = extraZones
    this.setup = setup
    this.turnPlayer = seatOf[0]
    this.boot()
  }

  /**
   * @param decks  un deck par place : 2 (duel simple) ou 4 (par équipes, places 0 et 2 contre 1 et 3)
   * @param first  équipe qui joue en premier
   * @param rigged pour les tests : graine fixe et mains imposées (aucune pioche de départ)
   * @param rules  paramètres de la partie (points de vie, main de départ, pioche, mélange)
   */
  static async create(decks: DeckList[], first: Seat, rigged?: { seed?: bigint; hands?: [number[], number[]] }, rules: Partial<Pick<DuelSettings, 'startLp' | 'startHand' | 'drawPerTurn' | 'shuffle' | 'handicap'>> & { sandbox?: boolean } = {}): Promise<Duel> {
    if (decks.length !== 2 && decks.length !== 4) throw new Error('Un duel se joue à 2 ou à 4.')
    const core = await getCore()
    const seed = (rigged?.seed !== undefined ? [rigged.seed, 2n, 3n, 4n] : Array.from({ length: 4 }, () => randomBytes(8).readBigUInt64LE())) as [bigint, bigint, bigint, bigint]
    const seatOf: [Seat, Seat] = first === 0 ? [0, 1] : [1, 0]
    const cards: Setup['cards'] = []
    for (const p of [0, 1] as const) {
      // Chaque duelliste de l'équipe apporte son Deck ; le moteur les fait jouer à tour de rôle.
      for (let duelist = 0; duelist < decks.length / 2; duelist++) {
        const deck = decks[seatOf[p] + 2 * duelist] as DeckList
        const hand = duelist === 0 ? (rigged?.hands?.[seatOf[p]] ?? []) : []
        // Chaque Deck reçoit son propre mélange.
        const mix = rigged?.seed === undefined ? undefined : rigged.seed + BigInt(p * 2 + duelist + 1)
        for (const code of rules.shuffle === false ? deck.main : shuffled(deck.main, mix)) cards.push({ team: p, duelist, code, location: OcgLocation.DECK })
        for (const code of deck.extra) cards.push({ team: p, duelist, code, location: OcgLocation.EXTRA })
        for (const code of hand) cards.push({ team: p, duelist, code, location: OcgLocation.HAND })
      }
    }
    // Bac à sable : la Console est posée face recto au milieu des Zones Magie/Piège de chaque équipe.
    if (rules.sandbox) for (const p of [0, 1] as const) cards.push({ team: p, duelist: 0, code: CONSOLE_CODE, location: OcgLocation.SZONE, sequence: 2, position: OcgPosition.FACEUP_ATTACK | OcgPosition.FACEUP_DEFENSE })
    // Les Zones Monstre Extra ne servent qu'aux monstres Lien et aux Pendules revenant de l'Extra Deck :
    // sans eux, on garde le terrain classique et le placement automatique.
    const extraZones = cards.some((c) => ((cardData(c.code)?.type ?? 0) & (TYPE.LINK | TYPE.PENDULUM)) !== 0)
    // Un avantage de points de vie se donne à une équipe (équipe 1 = places paires = siège 0) ; le moteur compte par ordre de jeu.
    const bySeat = startingLp(rules.startLp ?? 8000, rules.handicap ?? 'none')
    const lp: [number, number] = [bySeat[seatOf[0]], bySeat[seatOf[1]]]
    return new Duel(core, seatOf, decks.length, extraZones, { seed, startingHand: rigged?.hands ? 0 : (rules.startHand ?? 5), startLp: Math.max(...lp), lp, drawPerTurn: rules.drawPerTurn ?? 1, cards })
  }

  /** Crée le duel dans le moteur et remet tout l'état à zéro. Rejouable à l'identique (voir undo). */
  private boot(): void {
    const team = (p: 0 | 1) => ({ startingLP: this.setup.lp[p], startingDrawCount: this.setup.startingHand, drawCountPerTurn: this.setup.drawPerTurn })
    const handle = this.core.createDuel({
      flags: OcgDuelMode.MODE_MR5,
      seed: this.setup.seed,
      team1: team(0),
      team2: team(1),
      cardReader: cardData,
      scriptReader: readScript,
      errorHandler: (_type, text) => console.error(`[ocgcore] ${text}`),
    })
    if (!handle) throw new Error('Le moteur n’a pas pu créer le duel.')
    for (const base of ['constant.lua', 'utility.lua']) this.core.loadScript(handle, base, readScript(base) ?? '')
    // Notre correctif de compatibilité entre les scripts de cartes et le moteur embarqué.
    this.core.loadScript(handle, 'compat.lua', COMPAT)
    for (const c of this.setup.cards) {
      this.core.duelNewCard(handle, { team: c.team, duelist: c.duelist, code: c.code, controller: c.team, location: c.location as never, sequence: c.sequence ?? 0, position: (c.position ?? OcgPosition.FACEDOWN_DEFENSE) as never })
    }
    this.core.startDuel(handle)
    this.handle = handle

    this.finished = false
    this.winner = null
    this.active = [0, 0]
    this.stash.clear()
    this.stashUid = -1
    this.uids = new UidTracker()
    this.turn = 0
    this.turnPlayer = this.seatOf[0]
    this.phase = 'draw'
    this.lp = [...this.setup.lp]
    this.disabled = 0
    this.log = []
    this.pending = null
    this.promptId = 0
    this.hint = [0, 0]
    this.attackerUid = null
    this.fusionMaterials = []
    this.inBattle = false
    this.autoAnswers = 0
    this.history = []
    this.checkpoint = null
    this.consoleFlow = null
    this.snap = readSnapshot(this.core, handle)
    this.uids.assign(null, this.snap)
  }

  destroy(): void {
    this.core.destroyDuel(this.handle)
  }

  private seat(corePlayer: number): Seat {
    return this.seatOf[corePlayer === 0 ? 0 : 1]
  }

  /** Place du duelliste qui joue actuellement pour cette équipe. */
  private placeOf(team: Seat): number {
    return team + 2 * (this.active[this.seatOf[0] === team ? 0 : 1] as number)
  }

  /** Place dont on attend une réponse, et la question posée. */
  get waiting(): { seat: number; prompt: Prompt } | null {
    return this.pending && !this.finished ? { seat: this.placeOf(this.pending.seat), prompt: this.pending.prompt } : null
  }

  // ───────────────────────────── Avancer jusqu'à la prochaine question ─────────────────────────────

  /** Première avancée du duel : distribution des mains, premier tour. */
  start(): Step[] {
    return this.advance([{ event: { type: 'start', firstPlayer: this.seatOf[0] } }])
  }

  /** Réponse d'un joueur à la question en cours. Renvoie un message d'erreur si elle est refusée. */
  answer(place: number, id: number, value: Answer): Step[] | string {
    const p = this.pending
    if (this.finished) return msg('err.duelOver')
    if (!p || this.placeOf(p.seat) !== place) return msg('err.notYou')
    if (p.prompt.id !== id) return msg('err.stale')
    const response = p.toResponse(value)
    if (!response) return msg('err.badAnswer')
    if (p.prompt.kind === 'idle' || p.prompt.kind === 'battle') {
      this.checkpoint = { index: this.history.length, place, mark: JSON.stringify(this.snap), events: 0 }
      const action = p.prompt.options.find((option) => option.id === value)
      this.consoleFlow = action?.action === 'activate' && action.cardId === CONSOLE_CODE ? { place, points: [] } : null
    }
    this.history.push(value)
    this.pending = null
    this.core.duelSetResponse(this.handle, response)
    return this.advance([], p)
  }

  /** Vrai si ce joueur peut revenir à sa dernière décision : rien de visible ne s'est produit depuis. */
  private canUndo(place: number): boolean {
    const c = this.checkpoint
    const p = this.pending
    if (!c || !p || this.finished || c.place !== place || this.placeOf(p.seat) !== place) return false
    if (p.prompt.kind === 'idle' || p.prompt.kind === 'battle') return false
    return c.events === 0 && JSON.stringify(this.snap) === c.mark
  }

  private consoleMark(): string {
    return JSON.stringify({ cards: this.snap, lp: this.lp, disabled: this.disabled, turn: this.turn, log: this.log.length })
  }

  private recordConsoleQuestion(question: Pending): void {
    const flow = this.consoleFlow
    if (!flow) return
    if (this.placeOf(question.seat) !== flow.place || question.prompt.kind === 'idle' || question.prompt.kind === 'battle') {
      this.consoleFlow = null
      return
    }
    const main = question.prompt.kind === 'option' && question.prompt.text === CONSOLE_MAIN_REF
    const mark = this.consoleMark()
    if (main) flow.points = []
    else if (!flow.points.length) return
    else if (flow.points[flow.points.length - 1]?.mark !== mark) { this.consoleFlow = null; return }
    if (flow.points[flow.points.length - 1]?.index !== this.history.length) flow.points.push({ index: this.history.length, mark })
  }

  /** Recrée seulement les choix préparatoires ; une action appliquée ne peut pas être annulée par ces boutons. */
  navigateConsole(place: number, id: number, destination: 'back' | 'home'): Step[] | string {
    const flow = this.consoleFlow
    const last = flow?.points[flow.points.length - 1]
    if (this.finished || !flow || flow.place !== place || !this.pending || this.placeOf(this.pending.seat) !== place
      || this.pending.prompt.id !== id || !last || last.mark !== this.consoleMark()) return msg('err.undo')
    const at = destination === 'home' ? 0 : flow.points.length - 2
    const target = flow.points[at]
    if (!target || target === last) return msg('err.undo')
    const copy = new Duel(this.core, this.seatOf, this.places, this.extraZones, this.setup)
    try {
      copy.replay(this.history.slice(0, target.index))
      if (!copy.pending || copy.consoleMark() !== target.mark) throw new Error('Le point de navigation ne correspond plus au duel.')
      copy.consoleFlow = { place, points: flow.points.slice(0, at + 1) }
      copy.promptId = Math.max(copy.promptId, this.promptId) + 1
      copy.pending.prompt = { ...copy.pending.prompt, id: copy.promptId }
    } catch (error) {
      copy.destroy()
      console.warn('[bac à sable] Retour refusé :', (error as Error).message)
      return msg('err.undo')
    }
    this.core.destroyDuel(this.handle)
    Object.assign(this, copy)
    return [this.step([], this.snap)]
  }

  /**
   * Annule la dernière décision du joueur (choisir d'invoquer, d'activer...) tant qu'aucune carte
   * n'a bougé. Le moteur ne sait pas revenir en arrière : on recrée le duel avec la même graine et on
   * rejoue toutes les réponses précédentes, ce qui redonne exactement le même état.
   */
  undo(place: number): Step[] | string {
    const c = this.checkpoint
    if (!c || !this.canUndo(place)) return msg('err.undo')
    const keep = this.history.slice(0, c.index)
    this.core.destroyDuel(this.handle)
    this.boot()
    this.replay(keep)
    this.checkpoint = null
    return [this.step([], this.snap)]
  }

  /**
   * Une copie jetable du duel, dans le même état, pour que l'ordinateur essaie un coup sans toucher au vrai duel
   * (voir ai/planner.ts). Même principe que l'annulation : même graine, mêmes réponses rejouées. À détruire après usage.
   */
  fork(): Duel {
    const copy = new Duel(this.core, this.seatOf, this.places, this.extraZones, this.setup)
    copy.replay(this.history)
    return copy
  }

  /**
   * Contenu du deck d'un siège, tel qu'établi avant la distribution : le Deck et l'Extra de l'équipe, d'une seule
   * place identifiée par siège, dans un ordre trié qui ne dit rien de l'ordre réel de pioche. C'est ce qu'un
   * duelliste connaît avant la partie : les cartes de son adversaire, pas ce qu'il pioche. L'ordinateur s'en sert
   * pour juger ce que la main adverse peut plausiblement tenir, sans jamais lire les cartes piochées.
   */
  deckOf(seat: Seat): number[] {
    const p = this.seatOf[0] === seat ? 0 : 1
    return this.setup.cards.filter((c) => c.team === p && c.code !== CONSOLE_CODE).map((c) => displayId(c.code)).sort((a, b) => a - b)
  }

  /** Nombre de réponses données depuis le début du duel. */
  /**
   * Tout ce qu'il faut pour refaire ce duel à l'identique : la graine du moteur, les cartes dans l'ordre où elles ont été mélangées
   * et chaque réponse donnée. Contient les Decks : à garder côté serveur, jamais dans un replay public.
   */
  exportRecord(): { seed: string[]; startingHand: number; lp: [number, number]; drawPerTurn: number; seatOf: [Seat, Seat]; cards: Setup['cards']; answers: Answer[] } {
    return { seed: this.setup.seed.map(String), startingHand: this.setup.startingHand, lp: [...this.setup.lp], drawPerTurn: this.setup.drawPerTurn, seatOf: [...this.seatOf], cards: this.setup.cards, answers: [...this.history] }
  }

  get answers(): number {
    return this.history.length
  }

  /** Rejoue des réponses depuis le début du duel (fraîchement créé par boot). */
  private replay(answers: Answer[]): void {
    this.advance([])
    for (const value of answers) {
      const p = this.pending as Pending | null
      const response = p?.toResponse(value)
      if (!p || !response) throw new Error('Rejeu du duel impossible.')
      this.history.push(value)
      this.pending = null
      this.core.duelSetResponse(this.handle, response)
      this.advance([], p)
    }
  }

  /** Victoire (ou égalité) déclarée par une règle de la salle, pas par le moteur : défi, par exemple. */
  conclude(winner: Seat | 'draw', reason: string): Step[] {
    if (this.finished) return []
    this.finished = true
    this.pending = null
    this.winner = winner
    this.say(null, reason)
    return [this.step([{ event: { type: 'win', winner } }], this.snap)]
  }

  /** Abandon (ou temps écoulé) : l'équipe adverse gagne. */
  surrender(place: number, reason = msg('log.surrender')): Step[] {
    if (this.finished) return []
    const team: Seat = place % 2 === 0 ? 0 : 1
    this.finished = true
    this.pending = null
    this.winner = team === 0 ? 1 : 0
    this.say(team, reason)
    return [this.step([{ event: { type: 'win', winner: this.winner } }], this.snap)]
  }

  private step(out: Out[], snap: Snap, withPrompt = true): Step {
    const meta = { disabled: this.disabled, turn: this.turn, turnPlayer: this.turnPlayer, phase: this.phase, winner: this.winner, log: this.log, extraZones: this.extraZones, startLp: this.setup.startLp, seatOf: this.seatOf }
    const pending = withPrompt && this.pending && !this.finished ? { seat: this.pending.seat, prompt: this.pending.prompt } : null
    const eventsFor = (team: Seat, playing: boolean): GameEvent[] => out.filter((o) => o.only === undefined || o.only === team).map((o) => playing && o.identity?.seat === team && 'cardId' in o.event ? { ...o.event, cardId: o.identity.cardId } : o.event)
    const places = Array.from({ length: this.places }, (_, place) => place)
    // Par équipes, chacun voit quel coéquipier a la main de chaque côté.
    const members: Partial<DuelView> = this.places > 2 ? { playing: [this.placeOf(0), this.placeOf(1)] } : {}
    return {
      watch: { events: out.filter((o) => o.only === undefined).map((o) => o.event), view: { ...buildView(null, snap, meta, null), ...members, spectating: true, waitingFor: this.pending && !this.finished ? this.pending.seat : null } },
      events: places.map((place) => eventsFor(place % 2 === 0 ? 0 : 1, this.placeOf((place % 2) as Seat) === place)),
      views: places.map((place) => {
        const team: Seat = place % 2 === 0 ? 0 : 1
        const playing = this.placeOf(team) === place
        // Le coéquipier qui ne joue pas voit le terrain de son équipe, sans question, avec sa propre main.
        const view: DuelView = { ...buildView(team, snap, meta, playing ? pending : null), ...members }
        if (!playing) {
          view.spectating = true
          view.players[team].hand = this.stash.get(place) ?? []
        } else if (view.prompt && this.canUndo(place)) {
          view.prompt = { ...view.prompt, undoable: true }
        }
        if (view.prompt && playing && this.consoleFlow?.place === place && this.consoleFlow.points.length) {
          const back = this.consoleFlow.points.length > 1 && this.consoleFlow.points[this.consoleFlow.points.length - 1]?.mark === this.consoleMark()
          view.prompt = { ...view.prompt, consoleNavigation: { back, home: back } }
        }
        return view
      }),
    }
  }

  private advance(initial: Out[], answered: Pending | null = null): Step[] {
    const steps: Step[] = []
    let out = initial
    const flush = (snap: Snap, final = false): void => {
      if (!out.length && !final) return
      steps.push(this.step(out, snap, final))
      out = []
    }
    const ctx: PromptCtx = {
      snap: this.snap,
      seat: (p) => this.seat(p),
      nextId: () => ++this.promptId,
      takeHint: (player) => {
        const p = player === 0 ? 0 : 1
        const id = this.hint[p]
        this.hint[p] = 0
        return id
      },
      attackerUid: this.attackerUid,
      setAttacker: (uid) => {
        this.attackerUid = uid
      },
      extraZones: this.extraZones,
    }

    while (!this.finished) {
      const status = this.core.duelProcess(this.handle)
      const messages = this.core.duelGetMessage(this.handle)
      const pre = this.snap
      const post = readSnapshot(this.core, this.handle)
      // Main mélangée ou changement de duelliste : la main repart avec de nouvelles identités.
      this.uids.assign(pre, post, new Set(messages.flatMap((m) => (m.type === OcgMessageType.SHUFFLE_HAND || m.type === OcgMessageType.TAG_SWAP ? [m.player] : []))), messages)
      this.snap = post
      ctx.snap = post
      ctx.attackerUid = this.attackerUid

      let question: Pending | null = null
      let auto: OcgResponse | null = null
      let retry = false
      for (const m of messages) {
        Duel.trace?.(m)
        if (m.type === OcgMessageType.RETRY) {
          retry = true
          continue
        }
        // Un nouveau tour ouvre un nouveau lot d'animations : ce qui précède part avec l'état d'avant.
        if (m.type === OcgMessageType.NEW_TURN) flush(pre)
        this.translate(m, pre, post, out)
        const q = buildQuestion(m, ctx)
        if (q && 'toResponse' in q) question = q
        else if (q) auto = q
        // Chaque maillon résolu forme aussi un lot.
        if (m.type === OcgMessageType.CHAIN_SOLVED) flush(post)
      }

      // Après une victoire le moteur n'a plus rien d'utile à dire : on s'arrête là.
      if (status === OcgProcessResult.END || this.winner !== null) {
        this.finished = true
        break
      }
      if (status !== OcgProcessResult.WAITING) continue

      if (retry) {
        // Le moteur a refusé la réponse : on repose la même question au joueur.
        if (!answered) throw new Error('Le moteur a refusé une réponse automatique.')
        this.pending = { ...answered, prompt: { ...answered.prompt, id: ++this.promptId } }
        this.refused++
        break
      }
      if (auto) {
        if (++this.autoAnswers > 5000) throw new Error('Boucle de réponses automatiques.')
        this.core.duelSetResponse(this.handle, auto)
        continue
      }
      if (!question) throw new Error(`Le moteur attend une réponse à une question non gérée (${messages.map((m) => m.type).join(', ')}).`)
      this.autoAnswers = 0
      this.pending = question
      this.recordConsoleQuestion(question)
      break
    }
    flush(this.snap, true)
    return steps
  }

  // ───────────────────────────── Messages → événements ─────────────────────────────

  private say(seat: Seat | null, text: string): void {
    this.log.push({ turn: this.turn, seat, text })
  }

  private translate(m: OcgMessage, pre: Snap, post: Snap, out: Out[]): void {
    const T = OcgMessageType
    const emit = (event: GameEvent, only?: Seat): void => {
      if (this.checkpoint) this.checkpoint.events++
      out.push(only === undefined ? { event } : { event, only })
    }
    switch (m.type) {
      case T.NEW_TURN:
        this.turn++
        this.turnPlayer = this.seat(m.player)
        this.inBattle = false
        this.say(null, msg('log.turn', { n: this.turn }))
        emit({ type: 'turn', player: this.turnPlayer, turn: this.turn })
        break
      case T.NEW_PHASE: {
        const phase = PHASES.find(([p]) => p === m.phase)?.[1]
        if (phase && phase !== this.phase) {
          this.phase = phase
          this.inBattle = false
          if (phase === 'battle') this.say(this.turnPlayer, msg('log.battle'))
          emit({ type: 'phase', phase })
        }
        break
      }
      case T.DRAW:
        this.say(this.seat(m.player), msg('log.draw', { n: m.drawn.length }))
        emit({ type: 'draw', player: this.seat(m.player), count: m.drawn.length })
        break
      case T.SUMMONING:
      case T.SPSUMMONING:
      case T.FLIPSUMMONING: {
        const card = cardAt(post, m)
        if (!card) break
        const mode = m.type === T.SUMMONING ? 'normal' : m.type === T.FLIPSUMMONING ? 'flip' : 'special'
        // Le retournement est déjà porté par l'événement d'invocation.
        const dup = out.findIndex((o) => o.event.type === 'position' && o.event.uid === card.uid)
        if (dup >= 0) out.splice(dup, 1)
        this.say(this.seat(m.controller), msg(mode === 'normal' ? 'log.summon' : mode === 'flip' ? 'log.flipSummon' : 'log.special', { card: ref(m.code), note: summonNote(mode, card.type) }))
        const kind = mode === 'special' ? SUMMON_KINDS.find(([bit]) => (card.type & bit) !== 0)?.[1] : undefined
        emit({ type: 'summon', player: this.seat(m.controller), uid: card.uid, cardId: displayId(m.code), mode, ...(kind ? { kind } : {}), ...(kind === 'fusion' && this.fusionMaterials.length ? { fusionMaterials: this.fusionMaterials.splice(0) } : {}) })
        break
      }
      case T.SET: {
        const card = cardAt(post, m)
        if (!card) break
        const monster = (m.location & OcgLocation.MZONE) !== 0
        this.say(this.seat(m.controller), msg(monster ? 'log.setMonster' : 'log.setCard'))
        emit({ type: 'set', player: this.seat(m.controller), uid: card.uid, kind: monster ? 'monster' : 'spellTrap' })
        break
      }
      case T.POS_CHANGE: {
        const card = cardAt(post, m)
        if (!card || !(m.location & OcgLocation.MZONE)) break
        const wasFaceUp = (m.prev_position & (OcgPosition.FACEUP_ATTACK | OcgPosition.FACEUP_DEFENSE)) !== 0
        const faceUp = isFaceUp(card)
        const position: Position = m.position & ATTACK ? 'atk' : 'def'
        const seat = this.seat(m.controller)
        if (out.some((o) => o.event.type === 'summon' && o.event.uid === card.uid)) break
        if (this.inBattle && !wasFaceUp && faceUp) {
          this.say(seat, msg('log.flipped', { card: ref(card.code) }))
          emit({ type: 'flip', player: seat, uid: card.uid, cardId: displayId(card.code) })
        } else {
          if (faceUp) this.say(seat, msg(position === 'atk' ? 'log.posAtk' : 'log.posDef', { card: ref(card.code) }))
          emit({ type: 'position', player: seat, uid: card.uid, position, faceUp, wasFaceUp })
        }
        break
      }
      case T.CHAINING: {
        const seat = this.seat(m.controller)
        const effect = effectNumber(m.description)
        const label = describeMsg(m.description)
        const was = cardAt(pre, m)
        const where = m.location & OcgLocation.HAND ? msg('log.from.hand') : m.location & OcgLocation.GRAVE ? msg('log.from.grave') : m.location & OcgLocation.REMOVED ? msg('log.from.banished') : m.location & OcgLocation.DECK ? msg('log.from.deck') : was && !isFaceUp(was) ? msg('log.set') : ''
        this.chainLog.push({ code: m.code, seat })
        this.say(seat, msg('log.activate', { prefix: m.chain_size > 1 ? msg('log.link', { n: m.chain_size }) : '', card: ref(m.code), where, effect: effect ? msg('log.effectNo', { n: effect }) : '', label: label ? msg('log.label', { label }) : '' }))
        emit({ type: 'chain', player: seat, uid: cardAt(post, m)?.uid ?? was?.uid ?? null, cardId: displayId(m.code), index: m.chain_size, ...(effect ? { effect } : {}), ...(label ? { label } : {}) })
        break
      }
      case T.CHAIN_SOLVING: {
        const link = this.chainLog[m.chain_size - 1]
        if (link && this.chainLog.length > 1) this.say(link.seat, msg('log.resolve', { n: m.chain_size, card: ref(link.code) }))
        emit({ type: 'chainResolve', index: m.chain_size })
        break
      }
      case T.CHAIN_END:
        this.fusionMaterials = []
        this.chainLog = []
        break
      case T.CHAIN_NEGATED:
      case T.CHAIN_DISABLED:
        this.say(null, this.chainLog[m.chain_size - 1] ? msg('log.negatedOf', { card: ref((this.chainLog[m.chain_size - 1] as { code: number }).code) }) : msg('log.negated'))
        emit({ type: 'chainNegated', index: m.chain_size })
        break
      case T.BECOME_TARGET: {
        const found = m.cards.flatMap((c) => cardAt(post, c) ?? [])
        const uids = found.map((c) => c.uid)
        if (uids.length) {
          const source = this.chainLog[this.chainLog.length - 1]
          // Seules les cartes que les deux joueurs voient sont nommées.
          const named = found.map((c) => (isFaceUp(c) || c.isPublic ? ref(c.code) : '[?]'))
          if (source) this.say(source.seat, msg('log.targets', { source: ref(source.code), cards: named.join(', ') }))
          emit({ type: 'target', uids })
        }
        break
      }
      case T.CONFIRM_CARDS:
      case T.CONFIRM_DECKTOP: {
        // Cartes montrées à un joueur (recherche dans le Deck par l'adversaire, etc.).
        for (const controller of [0, 1] as const) {
          const cardIds = m.cards.filter((c) => c.code && c.controller === controller).map((c) => displayId(c.code))
          if (cardIds.length) emit({ type: 'reveal', cardIds, player: this.seat(controller) }, this.seat(m.player))
        }
        break
      }
      case T.ATTACK: {
        const attacker = cardAt(pre, m.card)
        if (!attacker) break
        const target = m.target ? cardAt(pre, m.target) : null
        this.inBattle = true
        const seat = this.seat(m.card.controller)
        this.attackers.push({ code: attacker.code, seat, turn: this.turn })
        const what = target ? (isFaceUp(target) ? ref(target.code) : faceDown) : msg('log.directly')
        this.say(seat, msg('log.attacks', { card: ref(attacker.code), atk: attacker.atk, target: what }))
        emit({ type: 'attack', player: seat, attackerUid: attacker.uid, targetUid: target?.uid ?? null })
        break
      }
      case T.BATTLE: {
        const attacker = cardAt(pre, m.card)
        if (!attacker) break
        const target = m.target ? cardAt(pre, m.target) : null
        const targetPosition: Position | null = target ? (target.position & ATTACK ? 'atk' : 'def') : null
        if (target && m.target) {
          const seeTarget = cardAt(post, m.target)
          if (seeTarget && isFaceUp(seeTarget)) this.say(null, msg('log.combat', { a: ref(attacker.code), atk: attacker.atk, b: ref(target.code), stat: targetPosition === 'atk' ? msg('log.statAtk', { n: m.target.attack }) : msg('log.statDef', { n: m.target.defense }) }))
        }
        emit({
          type: 'battle',
          attackerUid: attacker.uid,
          targetUid: target?.uid ?? null,
          attackerValue: m.card.attack,
          targetValue: m.target && target ? (targetPosition === 'atk' ? m.target.attack : m.target.defense) : null,
          targetPosition,
        })
        break
      }
      case T.MOVE: {
        const fromZone = zoneOf(m.from.location, m.from.overlay_sequence !== undefined)
        const toZone = zoneOf(m.to.location, m.to.overlay_sequence !== undefined)
        // Une carte qui vient d'être créée par un effet (jeton, carte ajoutée par la Console) : elle surgit à sa place.
        // (Les jetons posés sur le terrain ont déjà leur propre événement d'Invocation.)
        if (!fromZone && toZone && toZone !== 'monster' && toZone !== 'overlay') {
          const created = toZone === 'deck' || toZone === 'extra' ? null : cardAt(post, m.to)
          const open = toZone === 'graveyard' || ((toZone === 'banished' || toZone === 'spellTrap') && created !== null && isFaceUp(created))
          emit({ type: 'move', player: this.seat(m.to.controller), uid: created?.uid ?? null, cardId: open ? displayId(m.card) : null, from: toZone, to: toZone, how: 'create' })
          break
        }
        if (!fromZone || !toZone) break
        const card = fromZone === 'deck' || fromZone === 'overlay' ? null : this.findMoved(pre, m, out)
        const seat = this.seat(m.from.controller)
        const toPlayer = this.seat(m.to.controller)
        const destination = toPlayer !== seat ? { toPlayer } : {}
        // REASON_MATERIAL | REASON_FUSION : seuls les matériaux désormais publics sont cités.
        if ((m.reason & 0x40008) === 0x40008 && m.card && (toZone === 'graveyard' || ((toZone === 'banished' || toZone === 'extra') && (m.to.position & FACEUP_ANY) !== 0))) {
          this.fusionMaterials.push({ uid: card?.uid ?? null, cardId: displayId(m.card) })
        }
        const fromField = fromZone === 'monster' || fromZone === 'spellTrap'
        const toField = toZone === 'monster' || toZone === 'spellTrap'
        // Les cartes qui quittent le terrain en étant détruites ou sacrifiées ont leur propre mise en scène.
        if (fromField && !toField && card && toZone !== 'overlay') {
          if (m.reason & REASON_DESTROY) {
            this.say(seat, msg('log.destroyed', { card: ref(card.code), how: m.reason & REASON_BATTLE ? msg('log.byBattle') : m.reason & REASON_EFFECT ? msg('log.byEffect') : '' }))
            emit({ type: 'destroy', player: seat, uid: card.uid, cardId: displayId(card.code), to: toZone, ...destination, faceUp: (m.to.position & FACEUP_ANY) !== 0 })
            break
          }
          if (m.reason & REASON_RELEASE) {
            this.say(seat, msg('log.tribute', { card: isFaceUp(card) ? ref(card.code) : faceDown }))
            emit({ type: 'tribute', player: seat, uid: card.uid, to: toZone, ...destination, faceUp: (m.to.position & FACEUP_ANY) !== 0 })
            break
          }
        }
        // Un monstre qui change de contrôleur sans quitter le terrain.
        if (fromField && toField && m.from.controller !== m.to.controller && card) {
          this.say(this.seat(m.to.controller), msg('log.control', { card: isFaceUp(card) ? ref(card.code) : faceDown }))
          emit({ type: 'control', player: this.seat(m.to.controller), uid: card.uid })
          break
        }
        // Une carte qui arrive sur le terrain depuis une pile (Cimetière, Deck, Extra Deck...) : le client la fait partir de cette pile.
        if (toField && !fromField) {
          const arrived = fromZone === 'hand' ? null : cardAt(post, m.to)
          const holder = fromZone === 'overlay' ? cardAt(pre, { ...m.from, location: OcgLocation.MZONE })?.uid : undefined
          const open = fromZone === 'graveyard' || ((fromZone === 'banished' || fromZone === 'extra') && (m.from.position & FACEUP_ANY) !== 0)
          if (arrived) emit({ type: 'move', player: seat, uid: arrived.uid, cardId: open ? displayId(m.card) : null, from: fromZone, to: toZone, how: 'toField', ...destination, fromFaceUp: open, ...(holder !== undefined ? { into: holder } : {}) })
          break
        }
        if (toField || (fromZone === toZone && toZone !== 'overlay')) break
        if (fromZone === 'overlay' && toZone === 'overlay' && m.from.controller === m.to.controller && m.from.sequence === m.to.sequence) break
        let how: MoveKind | null = null
        if (toZone === 'overlay') how = 'material'
        else if (toZone === 'graveyard') how = m.reason & REASON_DISCARD ? 'discard' : fromZone === 'deck' ? 'mill' : 'toGrave'
        else if (toZone === 'banished') how = 'banish'
        else if (toZone === 'hand') how = 'toHand'
        else if (toZone === 'deck') how = 'toDeck'
        else if (toZone === 'extra') how = 'toExtra'
        if (!how) break
        // Une carte est publique quand elle arrive au Cimetière, ou qu'elle en part (tout le monde le voit) ; une carte bannie l'est si elle est face recto,
        // à l'arrivée comme au départ.
        const publicCode = m.card && (toZone === 'graveyard' || toZone === 'overlay' || fromZone === 'graveyard' || fromZone === 'overlay' || ((toZone === 'banished' || toZone === 'extra') && (m.to.position & FACEUP_ANY) !== 0) || ((fromZone === 'banished' || fromZone === 'extra') && (m.from.position & FACEUP_ANY) !== 0))
        // into : le monstre Xyz qui reçoit la carte (matériel), ou celui dont elle se détache (sortie d'un matériel) : le client y trouve son point de départ.
        let into: number | undefined
        if (how === 'material') into = cardAt(post, m.to)?.uid
        else if (fromZone === 'overlay') into = cardAt(pre, { ...m.from, location: OcgLocation.MZONE })?.uid
        const fromHolder = fromZone === 'overlay' ? cardAt(pre, { ...m.from, location: OcgLocation.MZONE })?.uid : undefined
        const owner = this.seat(m.from.controller)
        const from = msg({ hand: 'log.from.hand', deck: 'log.from.deck', graveyard: 'log.from.grave', banished: 'log.from.banished', monster: 'log.from.field', spellTrap: 'log.from.field', extra: 'log.from.extra', overlay: 'log.from.overlay' }[fromZone])
        if (how === 'discard') this.say(owner, msg('log.discard', { card: ref(m.card) }))
        else if (how === 'banish') this.say(owner, publicCode ? msg('log.banished', { card: ref(m.card), from }) : msg('log.banishedDown', { from }))
        else if (how === 'toGrave' && publicCode) this.say(owner, msg('log.toGrave', { card: ref(m.card), from }))
        else if (how === 'mill' && publicCode) this.say(owner, msg('log.toGrave', { card: ref(m.card), from }))
        else if (how === 'toHand') this.say(owner, fromZone === 'graveyard' || (fromZone === 'banished' && publicCode) ? msg('log.addNamed', { card: ref(m.card), from }) : msg('log.addHand', { from }))
        else if (how === 'toDeck') this.say(owner, msg('log.toDeck', { from }))
        else if (how === 'toExtra') this.say(owner, msg('log.toExtra'))
        else if (how === 'material') this.say(owner, msg('log.material', { from }))
        // Un matériel n'a pas d'identité tant qu'il est sous un monstre ; à l'arrivée (main, Cimetière...), il en a une.
        let uid = card?.uid ?? null
        if (uid === null && how === 'toHand') uid = this.uids.movement(m)?.uid ?? null
        if (uid === null && fromZone === 'overlay' && how !== 'material') uid = cardAt(post, m.to)?.uid ?? null
        emit({ type: 'move', player: seat, uid, cardId: publicCode ? displayId(m.card) : null, from: fromZone, to: toZone, how, ...destination, fromFaceUp: (m.from.position & FACEUP_ANY) !== 0, faceUp: (m.to.position & FACEUP_ANY) !== 0, ...(into ? { into } : {}), ...(how === 'material' ? { intoIndex: m.to.sequence } : {}), ...(fromHolder !== undefined ? { fromHolder } : {}) })
        if (how === 'toHand' && m.card && out.length) out[out.length - 1]!.identity = { seat: toPlayer, cardId: displayId(m.card) }
        break
      }
      case T.DAMAGE:
      case T.RECOVER:
      case T.PAY_LPCOST: {
        const p = m.player === 0 ? 0 : 1
        const gain = m.type === T.RECOVER
        this.lp[p] = Math.max(0, this.lp[p] + (gain ? m.amount : -m.amount))
        const seat = this.seat(p)
        const type = gain ? 'recover' : m.type === T.DAMAGE ? 'damage' : 'cost'
        this.say(seat, msg(gain ? 'log.gain' : type === 'damage' ? 'log.damage' : 'log.cost', { n: m.amount }))
        emit({ type, player: seat, amount: m.amount, lp: this.lp[p] })
        break
      }
      case T.LPUPDATE:
        this.lp[m.player === 0 ? 0 : 1] = m.lp
        break
      case T.TOSS_DICE:
        this.say(this.seat(m.player), msg('log.dice', { results: m.results.join(', ') }))
        emit({ type: 'dice', player: this.seat(m.player), results: m.results })
        break
      case T.TOSS_COIN:
        this.say(this.seat(m.player), msg('log.coin', { results: m.results.map((r) => msg(r ? 'log.heads' : 'log.tails')).join(', ') }))
        emit({ type: 'coin', player: this.seat(m.player), results: m.results })
        break
      case T.HAND_RES: {
        // Pierre-feuille-ciseaux : les deux mains, rangées par équipe (et non par joueur du moteur).
        const hands: [Hand, Hand] = [0, 0]
        for (const p of [0, 1] as const) hands[this.seat(p)] = handFromCore(m.results[p])
        const name = (h: Hand): string => msg(h === 0 ? 'srv.rock' : h === 1 ? 'srv.paper' : 'srv.scissors')
        this.say(null, msg('log.rps', { a: name(hands[0]), b: name(hands[1]) }))
        emit({ type: 'rps', hands })
        break
      }
      case T.SHUFFLE_HAND:
        emit({ type: 'shuffle', player: this.seat(m.player) })
        break
      case T.TAG_SWAP: {
        // Duel par équipes : l'autre duelliste de l'équipe prend la main. Celui qui sort garde sa main
        // de côté ; elle lui reste visible, sous de nouvelles identités pour ne pas se confondre.
        const p = m.player === 0 ? 0 : 1
        const team = this.seat(p)
        const leaving = this.placeOf(team)
        this.stash.set(leaving, pre.sides[p].hand.map((c) => ({ uid: this.stashUid--, cardId: displayId(c.code) })))
        this.active[p] = 1 - (this.active[p] as number)
        this.stash.delete(this.placeOf(team))
        this.say(team, msg('log.mate'))
        emit({ type: 'shuffle', player: team })
        break
      }
      case T.DAMAGE_STEP_END:
        this.inBattle = false
        break
      case T.ADD_COUNTER:
      case T.REMOVE_COUNTER: {
        const card = cardAt(post, m)
        const name = counterName(m.counter_type)
        const delta = m.type === T.ADD_COUNTER ? m.count : -m.count
        this.say(this.seat(m.controller), msg(delta > 0 ? 'log.counterAdd' : 'log.counterRemove', { card: card && isFaceUp(card) ? ref(card.code) : msg('log.aCard'), n: m.count, name }))
        emit({ type: 'counter', uid: card?.uid ?? null, name, delta })
        break
      }
      case T.SHUFFLE_DECK:
        emit({ type: 'shuffleDeck', player: this.seat(m.player) })
        break
      case T.EQUIP: {
        const card = cardAt(post, m.card)
        const target = cardAt(post, m.target)
        if (card && target) emit({ type: 'equip', uid: card.uid, targetUid: target.uid })
        break
      }
      case T.SWAP: {
        // Deux monstres échangent leur contrôleur.
        for (const side of [m.card1, m.card2]) {
          const card = cardAt(post, side)
          if (card) emit({ type: 'control', player: this.seat(side.controller), uid: card.uid })
        }
        this.say(null, msg('log.swap'))
        break
      }
      case T.MISSED_EFFECT:
        this.say(null, msg('log.missed', { card: ref(m.code) }))
        break
      case T.FIELD_DISABLED:
        this.disabled = m.field_mask
        break
      case T.ATTACK_DISABLED:
        this.say(null, msg('log.attackNegated'))
        emit({ type: 'attackNegated' })
        break
      case T.HINT:
        if (m.hint_type === OcgHintType.SELECTMSG) this.hint[m.player === 0 ? 0 : 1] = Number(m.hint)
        // Une carte qui montre son effet sans chaîne (effet continu, règle spéciale...).
        else if (m.hint_type === OcgHintType.CARD && m.hint) emit({ type: 'cardHint', cardId: displayId(Number(m.hint)) })
        // Message d'un script au joueur : il va au journal.
        else if (m.hint_type === OcgHintType.MESSAGE && m.hint) { const hintText = describeMsg(m.hint); if (hintText) this.say(this.seat(m.player), hintText) }
        break
      case T.WIN:
        this.winner = m.player > 1 ? 'draw' : this.seat(m.player)
        // Victoire particulière (Exodia, compte à rebours...) : on dit laquelle.
        this.say(null, this.winner === 'draw' ? msg('log.draw') : victoryText(m.reason) ? msg('log.victory', { why: victoryText(m.reason) as string }) : msg('log.over'))
        emit({ type: 'win', winner: this.winner, ...(this.winner === 'draw' ? {} : (() => { const finale = this.finaleOf(this.winner, m.reason, post); return finale ? { finale } : {} })()) })
        break
    }
  }

  /**
   * Carte déplacée par un message MOVE, telle qu'elle était avant l'étape. Plusieurs déplacements d'une même
   * étape décalent les rangs dans la main ou le Cimetière : on vérifie le code, et à défaut on cherche
   * un exemplaire de la zone qui n'a pas encore été signalé.
   */
  private findMoved(pre: Snap, m: Extract<OcgMessage, { type: typeof OcgMessageType.MOVE }>, out: Out[]): Card | null {
    const routed = this.uids.movement(m)
    if (routed) return routed
    const at = cardAt(pre, m.from)
    const taken = (c: Card): boolean => out.some((o) => 'uid' in o.event && o.event.uid === c.uid)
    if (at && at.code === m.card && !taken(at)) return at
    const side = pre.sides[m.from.controller === 0 ? 0 : 1]
    const list = m.from.location & OcgLocation.HAND ? side.hand : m.from.location & OcgLocation.GRAVE ? side.grave : m.from.location & OcgLocation.REMOVED ? side.removed : m.from.location & OcgLocation.EXTRA ? side.extra : m.from.location & OcgLocation.MZONE ? side.mzone : side.szone
    return list.find((c) => c !== null && c.code === m.card && !taken(c)) ?? (at && at.code === m.card ? at : null)
  }

  /**
   * Les cartes qui ont rempli la condition de victoire, pour la scène de fin : les pièces d'une victoire particulière (Exodia...), sinon les monstres qui
   * ont attaqué ce tour (points de vie à zéro au combat), sinon la carte du dernier effet activé par le vainqueur, sinon ses monstres les plus forts.
   * null quand la fin n'a pas de cause à montrer (abandon, Deck vide, temps écoulé, connexion perdue).
   */
  private finaleOf(winner: Seat, reason: number, snap: Snap): { kind: 'battle' | 'effect' | 'special'; cards: number[] } | null {
    if (reason === 0 || reason === 2 || reason === 3 || reason === 4) return null
    const side = snap.sides[this.seatOf[0] === winner ? 0 : 1]
    const own = [...side.hand, ...side.mzone, ...side.szone, ...side.grave, ...side.removed].filter((c): c is Card => c !== null)
    const has = (id: number): boolean => own.some((c) => displayId(c.code) === id)
    const special = SPECIAL_WINS[reason]
    if (special) {
      const ids = special.flatMap((name) => { const id = idByEnglishName(name); return id !== null && has(id) ? [id] : [] })
      if (ids.length) return { kind: 'special', cards: ids }
    }
    const unique = (codes: number[]): number[] => [...new Set(codes.map(displayId))].slice(0, 5)
    const hit = unique(this.attackers.filter((a) => a.seat === winner && a.turn === this.turn).map((a) => a.code))
    if (reason === 1 && hit.length) return { kind: 'battle', cards: hit }
    // La Console du bac à sable n'est pas une carte à montrer.
    const source = [...this.chainLog].reverse().find((l) => l.seat === winner && l.code !== CONSOLE_CODE)
    if (source) return { kind: 'effect', cards: [displayId(source.code)] }
    const strongest = side.mzone.filter((c): c is Card => c !== null && isFaceUp(c)).sort((a, b) => b.atk - a.atk).slice(0, 3).map((c) => c.code)
    return strongest.length ? { kind: reason === 1 ? 'battle' : 'effect', cards: unique(strongest) } : null
  }

  /** Renvoie l'état courant tel que cette place a le droit de le voir (resynchronisation). */
  currentView(place: number): DuelView {
    return this.step([], this.snap).views[place] as DuelView
  }

  /** L'état courant tel que le public le voit (spectateurs). */
  watchView(): DuelView {
    return this.step([], this.snap).watch.view
  }
}
