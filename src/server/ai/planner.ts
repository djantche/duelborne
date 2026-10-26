// L'ordinateur qui réfléchit : avant chaque décision importante, il ESSAIE ses coups possibles sur des copies du duel
// (Duel.fork : même graine, mêmes réponses rejouées), avec le vrai moteur de règles, puis garde celui qui mène à la
// meilleure position. Il n'invoque donc, n'active une Magie ou n'attaque que si cela améliore vraiment sa situation.
//
// Sans tricher : le jugement d'une position (evaluate) ne lit que ce que l'ordinateur a le droit de voir — sa vue du
// duel, où les cartes cachées n'ont pas d'identité. Ce qui était caché au moment de décider (main de l'adversaire,
// cartes posées face verso) compte pour une valeur moyenne, même si l'essai l'a révélé. Les attaques contre un monstre
// face verso ne sont pas essayées (l'essai dévoilerait sa DEF) : elles sont estimées. Dans les essais, l'adversaire
// ne répond jamais à rien (il ne joue pas ses cartes cachées), et l'essai s'arrête dès que l'adversaire reprend la main.
//
// Le soupçon (suspicion.ts) affine ce flou : l'ordinateur connaît le deck adverse tel qu'établi avant la distribution
// et se souvient de chaque carte révélée ; la main inconnue devient un échantillon de ce qui reste à voir (densité de
// pièges, réponses possibles depuis la main, meilleur monstre encore jamais vu). C'est ce soupçon qui pèse la prudence
// à l'attaque : un coup gagnant sur le papier peut coûter son meilleur monstre si une réponse se cache.
//
// Les scripts classent les essais et complètent la valeur des ressources du deck. Leurs réponses aux effets sont
// des candidats, jamais une obligation. simulation.ts compare les coûts, cibles et modes avec le vrai moteur.
//
// Trois budgets de recherche : Débutant, Confirmé et Expert explorent respectivement 6, 12 et 40 coups initiaux.
import type { AiLevel, Answer, DuelView, MonsterView, Prompt, PromptOption, Seat } from '../../shared/protocol.ts'
import { TYPE, cardData, miniCard } from '../ocg/data.ts'
import type { Duel } from '../ocg/duel.ts'
import { Bot } from './bot.ts'
import { effectPriority, effectValue, effectsOf } from './effects.ts'
import { interruptionTempo } from './interruptions.ts'
import { hiddenOf, knownView, visibleFoeOf, type Knowledge } from './knowledge.ts'
import { makeCtx, optionBonus, type Ctx, type Playbook } from './playbook.ts'
import { battleDanger, blindSuspicion, Suspects, type Suspicion } from './suspicion.ts'
import { simulate, type Move, type Simulation } from './simulation.ts'
import { battleSafe, cardSelections, cardWorth, combat, combatPotential, HAND_TRAPS, selectionScore } from './tactics.ts'

export { hiddenOf } from './knowledge.ts'

type CardsPrompt = Extract<Prompt, { kind: 'cards' }>

interface Budget {
  /** Temps de réflexion par décision. */
  ms: number
  /** Nombre maximal d'essais par décision. */
  trials: number
  /** Temps de plus pour l'ordre des attaques : toutes les suites d'attaques sont jouées d'avance (voir `deepen`). */
  battleMs: number
  /** Nombre d'attaques enchaînées prévues d'avance. */
  battleDepth: number
  mainWidth: number
  mainDepth: number
  effectWidth: number
  effectNodes: number
}
const BUDGETS: Record<AiLevel, Budget> = {
  easy: { ms: 350, trials: 6, battleMs: 250, battleDepth: 1, mainWidth: 2, mainDepth: 1, effectWidth: 2, effectNodes: 4 },
  normal: { ms: 1200, trials: 12, battleMs: 1200, battleDepth: 3, mainWidth: 3, mainDepth: 2, effectWidth: 3, effectNodes: 12 },
  hard: { ms: 4000, trials: 40, battleMs: 3000, battleDepth: 5, mainWidth: 5, mainDepth: 3, effectWidth: 5, effectNodes: 32 },
}

const typeOf = (cardId: number | null): number => (cardId === null ? 0 : (cardData(cardId)?.type ?? 0))
const isEffect = (cardId: number | null): boolean => cardId !== null && (typeOf(cardId) & 0x20) !== 0
/** Au-delà, l'ordinateur arrête de réfléchir pour ce tour (évite de tourner en rond sur un effet répétable). */
const MAX_DECISIONS_PER_TURN = 40
/** AI_TRACE=1 : l'ordinateur écrit ses coups essayés et leurs scores (pour régler le jugement, voir tools/ai/arena.ts). */
const TRACE = process.env.AI_TRACE === '1'
const yieldLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

// ───────────────────────────── Juger une position ─────────────────────────────

/** Valeur moyenne d'une carte qu'on ne connaît pas. */
const UNKNOWN_MONSTER = 1000
const HAND_CARD = 320
const SET_CARD = 360
/** DEF supposée d'un monstre face verso. */
const GUESS_DEF = 1400

/** Monstres venus de l'Extra Deck (Fusion, Synchro, Xyz, Lien) : leur force tient à leurs effets plus qu'à leur ATK. */
const EXTRA = 0x40 | 0x2000 | TYPE.XYZ | TYPE.LINK
const RITUAL = 0x80
const QUICK = 0x10000

function monsterValue(m: MonsterView, known: boolean, pb: Playbook | null = null): number {
  if (!known || m.atk === null) return UNKNOWN_MONSTER
  // Le script du deck connaît la force des monstres que l'ATK ne dit pas (lignée Yubel 0/0, Tuners posés pour servir).
  const own = pb?.monster?.(m)
  if (own !== undefined) return own
  const type = typeOf(m.card.cardId)
  const level = m.card.cardId === null ? 0 : (cardData(m.card.cardId)?.level ?? 0) & 0xff
  let v = 380 + 0.55 * (m.atk ?? 0) + 0.18 * (m.def ?? 0) + (isEffect(m.card.cardId) ? 220 : 0) + 180 * m.materials + effectValue(m.card.cardId)
  if (type & EXTRA) v += 700 + 120 * level
  else if (type & RITUAL) v += 400
  return v
}

/** Mur qu'un monstre oppose à une attaque : ATK en attaque, DEF en défense (supposée s'il est face verso et inconnu). */
function wall(m: MonsterView, known: boolean): { value: number; atk: boolean } {
  if (!known || m.atk === null) return { value: GUESS_DEF, atk: false }
  return m.position === 'atk' ? { value: m.atk ?? 0, atk: true } : { value: m.def ?? 0, atk: false }
}

/**
 * Ce que nos attaquants peuvent encore rapporter ce tour (dommages + monstres détruits), en les répartissant au mieux
 * sur les monstres adverses visibles. Prudence : chaque carte posée de l'adversaire peut être un piège, et la main
 * qu'on ne lisait pas peut tenir une réponse (voir suspicion.ts) — une réponse qui gaspille l'attaque et peut
 * détruire notre meilleur monstre. Le soupçon pèse donc à la fois sur le gain et en perte espérée.
 */
function attackPotential(view: DuelView, k: Knowledge, attackers: MonsterView[]): number {
  const ctx = k.playbook ? makeCtx(view, k.seat, k.playbook.deck) : null
  attackers = attackers.filter((m) => !ctx || !k.playbook?.hold?.(ctx, m))
  const gain = combatPotential(view, k.seat, attackers, k.playbook)
  // Risque d'une réponse : chaque face verso en est un candidat direct ; la main inconnue l'est d'autant
  // plus que le deck invisible a contenu des pièges ou des cartes qui répondent depuis la main.
  const danger = battleDanger(view, k.seat, k.suspect)
  if (!attackers.length) return gain * (1 - 0.5 * danger)
  const big = Math.max(...attackers.map((a) => monsterValue(a, true, k.playbook)))
  return gain * (1 - 0.6 * danger) - 0.45 * danger * big
}

/**
 * Ce que l'adversaire peut nous prendre à son prochain tour : avec les monstres qu'on voit d'abord, puis le
 * soupçon — sa main inconnue peut contenir un monstre déjà censé être dans son deck, jamais vu, qu'il invoquera
 * pour attaquer. Le soupçon croît avec la taille de sa main et plafonne : un échantillon de cinq cartes ne
 * contient probablement pas le meilleur monstre du deck.
 */
function threat(view: DuelView, k: Knowledge): number {
  const me = view.players[k.seat]
  const foe = view.players[k.seat === 0 ? 1 : 0]
  const attackers = foe.monsters.filter((m): m is MonsterView => m !== null && m.faceUp && !k.hidden.has(m.card.uid)).map((m) => Math.max(m.atk ?? 0, 0))
  const pb = k.playbook
  // Nightmare Pain : toutes les attaques adverses visent nos monstres invulnérables, qui renvoient les dégâts.
  if (pb?.redirects?.(makeCtx(view, k.seat, k.playbook?.deck))) return 0
  const safe = (m: MonsterView): boolean => battleSafe(m) || !!pb?.immune?.(m)
  const mine = me.monsters.filter((m): m is MonsterView => m !== null && !safe(m)).map((m) => ({ m, alive: true }))
  // Un monstre invulnérable tient la place : les attaquants n'ont plus d'attaque directe, et la leur ne lui coûte rien.
  const shielded = me.monsters.some((m) => m && safe(m))
  let loss = 0
  for (const atk of attackers.sort((a, b) => b - a)) {
    if (!mine.some((x) => x.alive)) {
      if (!shielded) loss += atk
      continue
    }
    let worst: { x: (typeof mine)[number]; l: number } | null = null
    for (const x of mine) {
      if (!x.alive) continue
      const w = wall(x.m, true)
      if (atk <= w.value) continue
      const l = monsterValue(x.m, true, k.playbook) + (w.atk ? atk - w.value : 0)
      if (!worst || l > worst.l) worst = { x, l }
    }
    if (worst) {
      worst.x.alive = false
      loss += worst.l
    }
  }
  const looming = Math.min(0.4, 0.07 * k.suspect.unknownHand) * k.suspect.loomingAtk
  return loss + looming
}

/**
 * Valeur d'une position pour l'ordinateur (en « points de vie équivalents ») : écart de LP, monstres, cartes posées,
 * cartes en main, attaques encore possibles ce tour, et ce que l'adversaire pourra nous prendre au tour suivant.
 * `attackers` : monstres qui peuvent encore attaquer ce tour (null : aucun, la Battle Phase est passée ou impossible).
 */
export function evaluate(view: DuelView, k: Knowledge, attackers: MonsterView[] | null): number {
  view = knownView(view, k)
  const other: Seat = k.seat === 0 ? 1 : 0
  if (view.winner === k.seat) return 1e7
  if (view.winner === other) return -1e7
  if (view.winner === 'draw') return 0
  const me = view.players[k.seat]
  const foe = view.players[other]
  let s = me.lp - 1.05 * foe.lp
  // En danger : chaque point de vie compte double sous 2000.
  if (me.lp < 2000) s -= (2000 - me.lp) * 0.8
  if (foe.lp < 2000) s += (2000 - foe.lp) * 0.5
  for (const m of me.monsters) if (m) s += monsterValue(m, true, k.playbook)
  for (const m of foe.monsters) if (m) s -= monsterValue(m, m.faceUp && !k.hidden.has(m.card.uid))
  for (const c of [...me.spellTraps, me.fieldZone]) {
    if (!c) continue
    const type = typeOf(c.card.cardId)
    // Posée, une Magie qui n'est pas Jeu-Rapide ne s'active pas au tour adverse : elle vaut moins qu'en main.
    if (!c.faceUp) s += type & TYPE.TRAP ? 540 : type & QUICK ? 480 : HAND_CARD - 80
    else s += (type & TYPE.CONTINUOUS || c.scale !== null ? 300 : 120) + effectValue(c.card.cardId) * 0.65
  }
  for (const c of [...foe.spellTraps, foe.fieldZone]) if (c) s -= c.faceUp && !k.hidden.has(c.card.uid) ? 280 + effectValue(c.card.cardId) * 0.65 : SET_CARD
  for (const c of me.hand) s += HAND_CARD + (c.cardId === null ? 0 : Math.min(160, cardWorth(c.cardId) * 0.1))
  // Une carte révélée en main adverse est une carte qu'on connaît : ni une inconnue ni une surprise ; on la juge
  // pour ce qu'elle vaut, tandis que les inconnues gardent la valeur moyenne d'une carte qu'on ne peut pas lire.
  for (const c of foe.hand) s -= c.cardId === null ? HAND_CARD : HAND_CARD + handCardValue(c.cardId)
  // Le Cimetière est une ressource pour bien des decks modernes.
  s += 45 * me.graveyard.length + 15 * me.banished.length
  for (const c of me.graveyard) if (effectsOf(c.cardId).grave) s += 150
  for (const c of foe.graveyard) if (effectsOf(c.cardId).grave) s -= 150
  if (me.deckCount < 3) s -= (3 - me.deckCount) * 900
  if (attackers?.length) s += attackPotential(view, k, attackers)
  // L'adversaire joue juste après nous : ce qu'il pourra nous prendre compte, moins ce qui est incertain.
  s -= (view.turnPlayer === k.seat ? 0.55 : 0.8) * threat(view, k)
  if (k.playbook?.position) s += k.playbook.position(makeCtx(view, k.seat, k.playbook?.deck))
  return s
}

/** Valeur d'une carte adverse connue tenue en main : ce qu'elle rapportera au mieux le jour où elle sort. */
function handCardValue(cardId: number): number {
  const d = cardData(cardId)
  const type = d?.type ?? 0
  if (type & TYPE.TRAP) return 260
  if (type & TYPE.SPELL) return type & TYPE.CONTINUOUS ? 260 : 180
  return 200 + (type & QUICK ? 160 : 0) + (d?.attack ?? 0) * 0.12
}

/** Les monstres qui peuvent encore attaquer, d'après la question posée (Main Phase 1 ou Battle Phase). */
function attackersOf(view: DuelView, seat: Seat): MonsterView[] | null {
  const p = view.prompt
  const mine = view.players[seat].monsters.filter((m): m is MonsterView => m !== null)
  if (!p || view.turnPlayer !== seat) return null
  if (p.kind === 'idle') return p.options.some((o) => o.action === 'toBattle') ? mine.filter((m) => m.faceUp && m.position === 'atk') : null
  if (p.kind === 'battle') {
    const uids = new Set(p.options.filter((o) => o.action === 'attack').map((o) => o.uid))
    return mine.filter((m) => uids.has(m.card.uid))
  }
  return null
}

// ───────────────────────────── Le planificateur ─────────────────────────────

export class Planner {
  /** Secours si le moteur refuse une réponse ou si le garde-fou du tour est atteint. */
  private readonly bot: Bot
  private readonly budget: Budget
  /** Cible retenue lors du choix de l'attaque, pour la question « quel monstre attaquer ? » qui suit. */
  private target: { attacker: number | null; uid: number | null } | null = null
  private turn = -1
  private decisions = 0
  private readonly place: number
  /** Le pont invisible adverse, alimenté par Duel.deckOf (avant mélange) et la mémoire des cartes révélées. */
  private suspects: Suspects | null = null

  /** Le script du deck de l'ordinateur (playbooks/), ou null. */
  private readonly playbook: Playbook | null

  constructor(place: number, level: AiLevel, playbook: Playbook | null = null) {
    this.place = place
    this.playbook = playbook
    this.bot = new Bot(place % 2 === 0 ? 0 : 1, { playbook })
    this.budget = BUDGETS[level]
  }

  private get seat(): Seat {
    return this.place % 2 === 0 ? 0 : 1
  }

  async choose(duel: Duel, attempt = 0): Promise<Answer | undefined> {
    const view = duel.currentView(this.place)
    const prompt = view.prompt
    if (!prompt) return null
    // Mémoriser aussi les révélations des questions sans choix et des sélections d'attaque.
    if (!this.suspects) this.suspects = new Suspects(duel.deckOf(this.seat === 0 ? 1 : 0))
    this.suspects.remember(view, this.seat)
    // Réponse refusée par le moteur : on laisse faire les règles simples (elles savent varier leurs réponses).
    if (attempt > 0) return this.bot.choose(view, attempt)
    if (prompt.kind === 'yesno' && prompt.direct && this.target && this.turn === view.turn) {
      const direct = this.target.uid === null
      if (direct) this.target = null
      return direct ? 1 : 0
    }
    if (prompt.kind === 'cards' && prompt.attackerUid !== undefined) {
      const t = this.target
      this.target = null
      const i = t && t.attacker === prompt.attackerUid ? prompt.cards.findIndex((c) => c.uid === t.uid) : -1
      if (i >= 0) return [i]
      return this.bot.choose(view, attempt)
    }
    if (view.turn !== this.turn) {
      this.turn = view.turn
      this.decisions = 0
    }
    // Garde-fou : trop de décisions dans un même tour, on laisse les règles simples finir le tour.
    if ((prompt.kind === 'idle' || prompt.kind === 'battle') && ++this.decisions > MAX_DECISIONS_PER_TURN) return this.bot.choose(view, attempt)
    const moves = this.moves(view)
    if (!moves.length) return this.bot.choose(view, attempt)
    if (moves.length === 1) return (moves[0] as Move).answer
    const best = await this.search(duel, view, moves)
    if (best.target !== undefined) this.target = { attacker: this.attackerOf(view, best.answer), uid: best.target }
    return best.answer
  }

  private attackerOf(view: DuelView, answer: Answer): number | null {
    const p = view.prompt
    return p && (p.kind === 'battle' || p.kind === 'idle') ? (p.options.find((o) => o.id === answer)?.uid ?? null) : null
  }

  // ─────────── Les coups possibles ───────────

  private moves(view: DuelView): Move[] {
    const moves = this.candidates(view)
    const p = view.prompt!
    if (p.kind !== 'idle' && p.kind !== 'battle' && !('rps' in p && p.rps)) {
      const preferred = this.playbook?.answer?.(makeCtx(view, this.seat, this.playbook.deck), p)
      if (preferred !== undefined) {
        const found = moves.find((move) => JSON.stringify(move.answer) === JSON.stringify(preferred))
        if (found) found.prior = Math.max(0, ...moves.map((m) => m.prior)) + 1
        else moves.push({ answer: preferred, prior: Math.max(0, ...moves.map((m) => m.prior)) + 1 })
      }
    }
    if (!moves.length) {
      const fallback = new Bot(this.seat).choose(view)
      if (fallback !== undefined) moves.push({ answer: fallback, prior: 0 })
    }
    return moves
  }

  private candidates(view: DuelView): Move[] {
    const p = view.prompt as Prompt
    switch (p.kind) {
      case 'idle':
        return this.idleMoves(view, p.options)
      case 'battle':
        return this.battleMoves(view, p.options)
      case 'chain':
        return [...(p.forced ? [] : [{ answer: null, prior: 0 }]), ...p.options.map((o) => {
          const c = this.ctx(view)
          const bonus = c && this.playbook?.bias ? this.playbook.bias(c, o) : 0
          const tempo = interruptionTempo(view, this.seat, o)
          return { answer: o.id, prior: 1 + (bonus + tempo) / 400, bonus, tempo }
        })]
      case 'yesno':
        return [{ answer: 0, prior: 0 }, { answer: 1, prior: 0 }]
      case 'option':
        // Pierre-feuille-ciseaux : aucun coup n'est meilleur qu'un autre, on tire au sort (sinon l'ordinateur jouerait toujours la même main).
        if (p.rps) return [{ answer: Math.floor(Math.random() * 3), prior: 0 }]
        return p.pick ? this.combinations(p.options.length, p.pick).map((answer) => ({ answer, prior: 0 })) : p.options.map((_, i) => ({ answer: i, prior: 0 }))
      case 'number':
        return p.options.map((_, i) => ({ answer: i, prior: 0 }))
      case 'place':
        return this.combinations(p.zones.length, p.count).map((answer) => ({
          answer: p.count > 1 ? answer : answer[0]!,
          prior: answer.filter((i) => p.zones[i]!.seat === this.seat).length,
        }))
      case 'position':
        return p.options.map((_, i) => ({ answer: i, prior: -i }))
      case 'announce': {
        const foe = view.players[this.seat === 0 ? 1 : 0]
        const publicCards = new Set([...foe.hand, ...foe.graveyard, ...foe.monsters.flatMap((m) => m?.faceUp ? [m.card] : [])].map((c) => c.cardId))
        return p.cards.map((id) => ({ answer: id, prior: (publicCards.has(id) ? 4 : 0) + cardWorth(id) / 400 }))
      }
      case 'cards':
        return this.cardMoves(view, p)
      default:
        return []
    }
  }

  private combinations(total: number, count: number, limit = 40): number[][] {
    const out: number[][] = []
    const walk = (picks: number[], from: number): void => {
      if (out.length >= limit) return
      if (picks.length === count) { out.push(picks); return }
      for (let i = from; i <= total - (count - picks.length) && out.length < limit; i++) walk([...picks, i], i + 1)
    }
    walk([], 0)
    return out
  }

  private idleMoves(view: DuelView, options: PromptOption[]): Move[] {
    const seen = new Set<string>()
    const out: Move[] = []
    const prior: Record<string, number> = { activate: 6, spsummon: 5, summon: 4, set: 3, sset: 2, position: 1, toBattle: 0, toMain2: 0, toEnd: 0, attack: 0 }
    for (const o of options) {
      // Deux exemplaires d'une même carte au même endroit font la même chose : un seul essai.
      const key = `${o.action}:${o.cardId}:${o.zone}:${o.label ?? ''}:${o.zone !== 'hand' ? o.uid : ''}`
      if (seen.has(key)) continue
      seen.add(key)
      const generic = ['summon', 'set'].includes(o.action) && HAND_TRAPS.has(o.cardId ?? 0) ? -700 : 0
      const bonus = this.bonusOf(view, o) + generic
      // Le script classe les essais ; il n'apporte plus de gain fictif au résultat du coup.
      out.push({ answer: o.id, prior: (prior[o.action] ?? 0) + bonus / 400 + effectPriority(view, this.seat, o) })
    }
    return out
  }

  private ctx(view: DuelView): Ctx | null {
    return this.playbook ? makeCtx(view, this.seat, this.playbook?.deck) : null
  }

  /** Bonus ou malus du script du deck pour une option de la Main Phase ou de la Battle Phase. */
  private bonusOf(view: DuelView, o: PromptOption): number {
    const c = this.ctx(view)
    return c && this.playbook ? optionBonus(this.playbook, c, o) : 0
  }

  private battleMoves(view: DuelView, options: PromptOption[]): Move[] {
    const foe = view.players[this.seat === 0 ? 1 : 0].monsters.filter((m): m is MonsterView => m !== null)
    const out: Move[] = []
    const c = this.ctx(view)
    for (const o of options) {
      if (o.action === 'attack') {
        const me = view.players[this.seat].monsters.find((m) => m?.card.uid === o.uid)
        const wanted = c && me ? this.playbook?.target?.(c, me, foe) : undefined
        // Même une attaque à 0 ATK ou perdante peut déclencher un effet utile : le moteur en juge le résultat.
        if (!foe.length || o.direct) out.push({ answer: o.id, target: null, prior: 3 })
        for (const m of foe) out.push({ answer: o.id, target: m.card.uid, prior: (m.faceUp ? 2 : 1) + (m.card.uid === wanted ? 2 : 0), bonus: m.card.uid === wanted ? 400 : 0 })
      } else if (o.action === 'activate') out.push({ answer: o.id, prior: 1, bonus: this.bonusOf(view, o) })
      else if (o.action === 'toMain2' || o.action === 'toEnd') out.push({ answer: o.id, prior: 0 })
    }
    return out
  }

  /** Compare des sélections de cibles, ressources ou matériaux classées par utilité. */
  private cardMoves(view: DuelView, p: CardsPrompt): Move[] {
    if (p.ordered || !p.cards.length) return []
    if (p.mode === 'step') return [
      ...(p.finishable || p.cancelable ? [{ answer: null, prior: 0 }] : []),
      ...p.cards.flatMap((card, i) => card.selected ? [] : [{ answer: i, prior: selectionScore(view, this.seat, p, card, this.playbook) / 400 }]),
    ]
    const choices = cardSelections(p, (card) => selectionScore(view, this.seat, p, card, this.playbook), this.budget.mainWidth * 4)
    return [
      ...(p.cancelable ? [{ answer: null, prior: -1 }] : []),
      ...choices.map((answer, i) => ({ answer, prior: choices.length - i })),
    ]
  }

  // ─────────── Essayer les coups ───────────

  private async search(duel: Duel, view: DuelView, moves: Move[]): Promise<Move> {
    const k: Knowledge = { seat: this.seat, hidden: hiddenOf(view, this.seat), visibleFoe: visibleFoeOf(view, this.seat), suspect: this.suspectOf(view), playbook: this.playbook, rootTurn: view.turn }
    const start = performance.now()
    const scored: { move: Move; score: number }[] = []
    const baseline = (move: Move): boolean => {
      const p = view.prompt!
      if (p.kind === 'chain' || p.kind === 'cards') return move.answer === null
      if (p.kind === 'yesno') return move.answer === 0
      if (p.kind === 'idle' || p.kind === 'battle') return p.options.some((o) => o.id === move.answer && o.action.startsWith('to'))
      return false
    }
    let ordered = [...moves].sort((a, b) => Number(baseline(b)) - Number(baseline(a)) || b.prior - a.prior)
    if (view.prompt?.kind === 'idle') {
      const options = view.prompt.options
      const families = new Set<string>()
      const first = ordered.filter((move) => {
        if (baseline(move)) return true
        const family = options.find((o) => o.id === move.answer)?.action ?? ''
        if (families.has(family)) return false
        families.add(family)
        return true
      })
      ordered = [...first, ...ordered.filter((move) => !first.includes(move))]
    }
    // Les connaissances guident l'essai, sans faire passer une étape de combo avant un vrai gain de position.
    const bonus = (m: Move): number => this.adjustment(view, k, m)
    const deadline = start + this.budget.ms
    const shallowDeadline = start + this.budget.ms * 0.5
    let trials = 0
    for (const move of ordered) {
      const quick = this.estimate(view, k, move)
      if (quick !== null) {
        scored.push({ move, score: quick + bonus(move) })
        continue
      }
      if (trials >= this.budget.trials || performance.now() > shallowDeadline) continue
      trials++
      await yieldLoop()
      // Répartir les essais : une carte aux nombreux choix ne doit pas consommer tout le budget des autres coups.
      const remaining = Math.max(1, Math.min(ordered.length - trials, this.budget.trials - trials + 1))
      const slice = Math.min(shallowDeadline, performance.now() + Math.max(15, (shallowDeadline - performance.now()) / remaining))
      const score = await this.trial(duel, move, k, slice)
      if (score !== null) scored.push({ move, score: score + bonus(move) })
    }
    // Battle Phase : avant d'attaquer, on joue d'avance toutes les suites d'attaques (qui attaque en premier, qui vise qui).
    if (view.prompt?.kind !== 'battle') await this.deepenMain(duel, scored, k, deadline, bonus)
    if (view.prompt?.kind === 'battle' && this.budget.battleMs > 0) await this.deepen(duel, scored, k, bonus)
    scored.sort((a, b) => b.score - a.score)
    if (TRACE) {
      const p = view.prompt as Prompt
      const name = (m: Move): string => {
        if (p.kind !== 'idle' && p.kind !== 'battle') return JSON.stringify(m.answer)
        const o = p.options.find((x) => x.id === m.answer)
        return `${o?.action} ${o?.cardId ? miniCard(o.cardId).name : ''}${o?.label ? ` « ${o.label} »` : ''}${m.target !== undefined ? ` → ${m.target}` : ''}`
      }
      console.log(`[IA] tour ${view.turn} ${p.kind} (${trials} essais, ${(performance.now() - start).toFixed(0)} ms)\n${scored.map((x) => `   ${x.score.toFixed(0).padStart(7)}  ${name(x.move)}`).join('\n')}`)
    }
    return scored[0]?.move ?? ordered.find(baseline) ?? (ordered[0] as Move)
  }

  /** Les réponses facultatives adverses ne sont pas jouées dans les copies : leur risque reste à déduire du coup. */
  private adjustment(view: DuelView, k: Knowledge, move: Move): number {
    let score = Math.max(-900, Math.min(500, (move.bonus ?? 0) * 0.25)) + (move.tempo ?? 0)
    const p = view.prompt
    if (p?.kind !== 'battle') return score
    const option = p.options.find((o) => o.id === move.answer)
    if (option?.action !== 'attack') return score
    const danger = battleDanger(view, this.seat, k.suspect)
    if (!danger) return score
    const attacker = view.players[this.seat].monsters.find((m) => m?.card.uid === option.uid)
    if (!attacker) return score
    const target = view.players[this.seat === 0 ? 1 : 0].monsters.find((m) => m?.card.uid === move.target)
    const damage = move.target === null ? Math.max(0, attacker.atk ?? 0)
      : target?.faceUp && !k.hidden.has(target.card.uid) ? combat(view, this.seat, attacker, target, this.playbook).damage : 0
    // Une fois l'attaque consommée, attackPotential ne la voit plus : sans ce coût, la prudence
    // disparaissait justement du coup qu'on choisissait, y compris d'une attaque directe.
    score -= danger * (0.45 * monsterValue(attacker, true, this.playbook) + 0.35 * damage)
    return score
  }

  /** Compare plusieurs suites de Main Phase, au lieu d'une seule continuation gloutonne. */
  private async deepenMain(duel: Duel, scored: { move: Move; score: number }[], k: Knowledge, deadline: number, bonus: (m: Move) => number): Promise<void> {
    const ranked = [...scored].sort((a, b) => b.score - a.score)
    const promising = [...scored].sort((a, b) => b.move.prior - a.move.prior)[0]
    // Réserver aussi une place à un démarrage prometteur dont le premier coût masque le gain de la combinaison.
    const roots = [...new Set([ranked[0], promising, ...ranked])].filter((r): r is NonNullable<typeof r> => !!r).slice(0, this.budget.mainWidth)
    for (const root of roots) {
      if (performance.now() >= deadline) break
      if (Math.abs(root.score) > 1e6) continue
      await yieldLoop()
      let simulation: Simulation | null = null
      try {
        simulation = await this.simulateMove(duel, root.move, k, deadline)
        if (simulation && !simulation.drew) root.score = await this.mainTree(simulation.duel, simulation.knowledge, this.budget.mainDepth, deadline) + simulation.tempo + bonus(root.move)
      } catch {
        // Le premier essai reste utilisable si une continuation échoue.
      } finally {
        simulation?.duel.destroy()
      }
    }
  }

  private async mainTree(duel: Duel, k: Knowledge, depth: number, deadline: number): Promise<number> {
    const view = knownView(duel.currentView(this.place), k)
    const fallback = evaluate(view, k, attackersOf(view, this.seat))
    const w = duel.waiting
    if (!w || duel.finished || depth <= 0 || w.seat % 2 !== this.seat || view.turn !== k.rootTurn) return fallback
    if (w.prompt.kind === 'battle') return this.attackTree(duel, k, Math.min(depth + 1, this.budget.battleDepth), deadline)
    if (w.prompt.kind !== 'idle') return fallback
    const ordered = this.idleMoves(view, w.prompt.options).sort((a, b) => b.prior - a.prior)
    // Le refus de poursuivre et différentes familles d'actions restent accessibles, même avec un petit faisceau.
    const selected: Move[] = []
    const used = new Set<string>()
    const baseline = ordered.find((m) => w.prompt.kind === 'idle' && w.prompt.options.some((o) => o.id === m.answer && o.action === 'toEnd'))
    if (baseline) selected.push(baseline)
    for (const move of ordered) {
      const action = w.prompt.options.find((o) => o.id === move.answer)?.action ?? ''
      if (selected.includes(move) || used.has(action)) continue
      used.add(action)
      selected.push(move)
      if (selected.length >= this.budget.mainWidth) break
    }
    const moves = [...selected, ...ordered.filter((m) => !selected.includes(m))].slice(0, this.budget.mainWidth)
    let best = -Infinity
    for (const move of moves) {
      if (performance.now() >= deadline) break
      await yieldLoop()
      let simulation: Simulation | null = null
      try {
        simulation = await this.simulateMove(duel, move, k, deadline)
        if (!simulation) continue
        const score = simulation.drew ? simulation.score : await this.mainTree(simulation.duel, simulation.knowledge, depth - 1, deadline) + simulation.tempo
        best = Math.max(best, score + this.adjustment(view, k, move))
      } catch {
        // Une combinaison non réalisable n'enlève pas les autres suites.
      } finally {
        simulation?.duel.destroy()
      }
    }
    return best === -Infinity ? fallback : best
  }

  /**
   * L'ordre des attaques. Un coup jugé tout seul ne dit pas où il mène : l'attaquant détruit un monstre dont l'effet
   * (renvoi, négation, Position de Défense forcée…) prive des attaques suivantes, ou qu'une autre attaque aurait mieux
   * traité d'abord. Pour chaque première attaque on joue donc, sur des copies du duel, toutes les suites possibles
   * (chaque monstre restant avec chaque cible, ou s'arrêter là) jusqu'à `battleDepth` attaques ; la valeur du coup est
   * celle de la meilleure suite. Les attaques sur un monstre face verso restent estimées (l'essai le dévoilerait).
   */
  private async deepen(duel: Duel, scored: { move: Move; score: number }[], k: Knowledge, bonus: (m: Move) => number): Promise<void> {
    const deadline = performance.now() + this.budget.battleMs
    const attacks = scored.filter((x) => this.isTrialAttack(duel, x.move, k)).sort((a, b) => b.score - a.score)
    for (const entry of attacks) {
      if (performance.now() > deadline) break
      let simulation: Simulation | null = null
      try {
        simulation = await this.simulateMove(duel, entry.move, k, deadline)
        if (!simulation) continue
        entry.score = (simulation.drew ? simulation.score : await this.attackTree(simulation.duel, simulation.knowledge, this.budget.battleDepth - 1, deadline) + simulation.tempo) + bonus(entry.move)
      } catch {
        // l'essai a échoué : on garde le jugement du coup seul
      } finally {
        simulation?.duel.destroy()
      }
    }
  }

  /** Une attaque jouable en essai : directe, ou sur un monstre face recto. */
  private isTrialAttack(duel: Duel, move: Move, k: Knowledge): boolean {
    const view = duel.currentView(this.place)
    const p = view.prompt
    if (!p || p.kind !== 'battle' || p.options.find((o) => o.id === move.answer)?.action !== 'attack') return false
    if (move.target === undefined || move.target === null) return true
    const m = view.players[this.seat === 0 ? 1 : 0].monsters.find((x) => x?.card.uid === move.target)
    return !!m && m.faceUp && !k.hidden.has(m.card.uid)
  }

  /**
   * Valeur d'une position de Battle Phase : la meilleure entre s'arrêter là et chaque attaque suivante, jouée pour de bon
   * sur une copie ; arrivé au bout de la profondeur ou du temps, on juge avec les attaques qu'il resterait.
   */
  private async attackTree(t: Duel, k: Knowledge, depth: number, deadline: number): Promise<number> {
    const v = knownView(t.currentView(this.place), k)
    const w = t.waiting
    const own = !!w && w.seat % 2 === this.place % 2 && w.prompt.kind === 'battle'
    if (t.finished || !w || !own) return evaluate(v, k, null)
    const fallback = evaluate(v, k, attackersOf(v, this.seat))
    if (depth <= 0 || performance.now() > deadline) return fallback
    const next = this.battleMoves(v, (w.prompt as { options: PromptOption[] }).options)
      .sort((a, b) => Number(b.prior === 0) - Number(a.prior === 0) || b.prior - a.prior)
    let best = -Infinity
    for (const move of next) {
      if (performance.now() > deadline) break
      const estimate = this.estimate(v, k, move)
      if (estimate !== null) {
        best = Math.max(best, estimate + this.adjustment(v, k, move))
        continue
      }
      await yieldLoop()
      let simulation: Simulation | null = null
      try {
        simulation = await this.simulateMove(t, move, k, deadline)
        if (!simulation) continue
        const after = simulation.duel.currentView(this.place)
        const score = simulation.drew ? simulation.score
          : after.prompt?.kind === 'idle' && after.turnPlayer === this.seat && after.turn === k.rootTurn
            ? await this.mainTree(simulation.duel, simulation.knowledge, 1, deadline) + simulation.tempo
            : await this.attackTree(simulation.duel, simulation.knowledge, depth - 1, deadline) + simulation.tempo
        best = Math.max(best, score + this.adjustment(v, k, move))
      } catch {
        // essai impossible : on passe à la suite suivante
      } finally {
        simulation?.duel.destroy()
      }
    }
    return best === -Infinity ? fallback : best
  }

  /**
   * Une attaque contre un monstre face verso reste estimée pour ne pas découvrir sa DEF dans l'essai.
   * Les changements de phase sont simulés : ils peuvent déclencher des effets. null : il faut essayer.
   */
  private estimate(view: DuelView, k: Knowledge, move: Move): number | null {
    const p = view.prompt as Prompt
    if (p.kind === 'battle') {
      const o = p.options.find((x) => x.id === move.answer)
      if (o?.action === 'toMain2' || o?.action === 'toEnd') return null
      if (o?.action === 'attack' && move.target !== undefined && move.target !== null) {
        const foe = view.players[this.seat === 0 ? 1 : 0].monsters.find((m) => m?.card.uid === move.target)
        if (foe && (!foe.faceUp || k.hidden.has(foe.card.uid))) {
          const me = view.players[this.seat].monsters.find((m) => m?.card.uid === o.uid)
          const atk = me?.atk ?? 0
          const others = (attackersOf(view, this.seat) ?? []).filter((m) => m.card.uid !== o.uid)
          // Chance de passer la DEF d'un monstre inconnu ; le profil de la main et les cartes posées
          // pondèrent séparément le risque de piège, sans lire leur identité.
          const win = Math.min(0.95, Math.max(0.05, 0.5 + (atk - GUESS_DEF) / 2200))
          const success = { ...view, players: [...view.players] as DuelView['players'] }
          const other = this.seat === 0 ? 1 : 0
          success.players[other] = { ...view.players[other], monsters: view.players[other].monsters.map((m) => m?.card.uid === move.target ? null : m) }
          // Un mur de défense trop fort inflige des dégâts : il ne détruit pas l'attaquant.
          return win * evaluate(success, k, others) + (1 - win) * (evaluate(view, k, others) - Math.max(0, GUESS_DEF - atk))
        }
      }
    }
    return null
  }

  /** Résout l'effet en comparant ses choix internes avant de juger ses conséquences. */
  private async trial(duel: Duel, move: Move, k: Knowledge, deadline: number): Promise<number | null> {
    let simulation: Simulation | null = null
    try {
      simulation = await this.simulateMove(duel, move, k, deadline)
      return simulation?.score ?? null
    } catch {
      return null
    } finally {
      simulation?.duel.destroy()
    }
  }

  private simulateMove(duel: Duel, move: Move, k: Knowledge, deadline: number): Promise<Simulation | null> {
    return simulate(duel, move, k, {
      place: this.place,
      width: this.budget.effectWidth,
      nodes: this.budget.effectNodes,
      deadline,
      choices: (view) => this.moves(view),
      judge: (view, knowledge) => evaluate(view, knowledge, attackersOf(knownView(view, knowledge), this.seat)),
    })
  }

  /** Profil déduit du deck initial et des cartes publiquement révélées. */
  private suspectOf(view: DuelView): Suspicion {
    return this.suspects ? this.suspects.profile(view, this.seat) : blindSuspicion(view, this.seat)
  }
}
