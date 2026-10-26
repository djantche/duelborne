// Adversaire contrôlé par l'ordinateur.
//
// Pas de recherche ni d'anticipation : une suite de règles simples appliquées à chaque question du
// moteur (invoquer le plus fort, attaquer quand c'est gagnant, activer ce qui peut l'être, sacrifier
// le plus faible). Cela donne un adversaire qui joue des parties complètes, sans être un bon joueur.
import type { Answer, DuelView, MonsterView, Prompt, PromptOption, Seat } from '../../shared/protocol.ts'
import { TYPE, cardData } from '../ocg/data.ts'
import { isAvoided, makeCtx, nextStep, type Playbook } from './playbook.ts'
import { cardSelections, cardWorth, combat, HAND_TRAPS, selectionScore } from './tactics.ts'

type CardsPrompt = Extract<Prompt, { kind: 'cards' }>

/** Garde-fou : au-delà, l'IA arrête d'agir et passe à la phase suivante. */
const MAX_ACTIONS_PER_TURN = 30

const atkOf = (cardId: number | null): number => Math.max(0, cardId === null ? 0 : (cardData(cardId)?.attack ?? 0))
const defOf = (cardId: number | null): number => Math.max(0, cardId === null ? 0 : (cardData(cardId)?.defense ?? 0))
const typeOf = (cardId: number | null): number => (cardId === null ? 0 : (cardData(cardId)?.type ?? 0))

export interface BotOptions {
  /** Adversaire passif (bac à sable) : ne joue rien, ne répond à rien, termine ses tours. */
  passive?: boolean
  /** Script du deck (playbook.ts) : l'ordre de jeu connu de ce deck, passé avant les règles simples. */
  playbook?: Playbook | null
}

export class Bot {
  private passive: boolean
  private playbook: Playbook | null
  private seat: Seat
  private turn = -1
  private actions = 0
  /** Nombre de fois où chaque action a déjà été tentée ce tour (évite de tourner en rond). */
  private tried = new Map<string, number>()
  /** Cible retenue au moment de choisir l'attaquant. */
  private target: number | null = null

  constructor(seat: Seat, options: BotOptions = {}) {
    this.seat = seat
    this.passive = options.passive ?? false
    this.playbook = options.playbook ?? null
  }

  /**
   * @param attempt nombre de réponses à cette question déjà refusées par le moteur
   * @returns la réponse, ou undefined pour abandonner (aucune réponse acceptable trouvée)
   */
  choose(view: DuelView, attempt = 0): Answer | undefined {
    const prompt = view.prompt
    if (!prompt) return null
    if (view.turn !== this.turn) {
      this.turn = view.turn
      this.actions = 0
      this.tried.clear()
    }
    if (attempt > 25) return undefined
    if (attempt > 3) return this.random(prompt)
    // Le script du deck répond d'abord aux questions où il sait mieux (cible de Nightmare Pain, par exemple).
    if (this.playbook?.answer && attempt === 0 && prompt.kind !== 'idle' && prompt.kind !== 'battle') {
      const scripted = this.playbook.answer(makeCtx(view, this.seat, this.playbook?.deck), prompt)
      if (scripted !== undefined) return scripted
    }

    switch (prompt.kind) {
      case 'idle':
        if (this.passive) return (prompt.options.find((o) => o.action === 'toEnd') ?? prompt.options.find((o) => o.action === 'toBattle') ?? (prompt.options[0] as PromptOption)).id
        return this.idle(view, prompt.options)
      case 'battle':
        if (this.passive) return (prompt.options.find((o) => o.action === 'toEnd') ?? prompt.options.find((o) => o.action === 'toMain2') ?? (prompt.options[0] as PromptOption)).id
        return this.battle(view, prompt.options)
      case 'chain': {
        if (this.passive && !prompt.forced) return null
        if (prompt.forced) return (prompt.options[0] as { id: number }).id
        // On ne répond pas à ses propres effets, et pas deux fois avec la même carte dans le tour.
        if (view.chain[view.chain.length - 1]?.seat === this.seat) return null
        const option = prompt.options.find((o) => this.count(`chain:${o.cardId}`) < 1)
        if (!option) return null
        this.bump(`chain:${option.cardId}`)
        return option.id
      }
      case 'yesno':
        return this.passive ? 0 : 1
      case 'option':
        if (prompt.rps) return Math.floor(Math.random() * 3)
        return prompt.pick ? Array.from({ length: prompt.pick }, (_, i) => i) : 0
      case 'number':
        return 0
      case 'announce':
        return prompt.cards[0] ?? 0
      case 'counters': {
        // On retire le plus possible sur chaque carte, dans l'ordre.
        let left = prompt.total
        return prompt.cards.map((c) => {
          const n = Math.min(left, c.max)
          left -= n
          return n
        })
      }
      case 'place': {
        // Ses propres zones d'abord.
        const mine = prompt.zones.map((z, i) => ({ z, i })).filter(({ z }) => z.seat === this.seat)
        const pool = mine.length >= prompt.count ? mine : prompt.zones.map((z, i) => ({ z, i }))
        const picks = pool.slice(0, prompt.count).map(({ i }) => i)
        return prompt.count > 1 ? picks : (picks[0] ?? 0)
      }
      case 'position': {
        // Face recto en attaque, sauf pour un monstre nettement défensif.
        const defensive = defOf(prompt.cardId) > atkOf(prompt.cardId) + 400
        const wanted = prompt.options.findIndex((o) => o.faceUp && o.position === (defensive ? 'def' : 'atk'))
        return wanted >= 0 ? wanted : 0
      }
      case 'cards':
        return prompt.attackerUid !== undefined ? this.attackTarget(view, prompt) : this.cards(view, prompt, attempt)
    }
  }

  // ───────────────────────────── Main Phase ─────────────────────────────

  private count(key: string): number {
    return this.tried.get(key) ?? 0
  }

  private bump(key: string): void {
    this.tried.set(key, this.count(key) + 1)
  }

  private me(view: DuelView): DuelView['players'][0] {
    return view.players[this.seat]
  }

  private foe(view: DuelView): DuelView['players'][0] {
    return view.players[this.seat === 0 ? 1 : 0]
  }

  private monster(view: DuelView, uid: number | null): MonsterView | null {
    return this.me(view).monsters.find((m) => m?.card.uid === uid) ?? null
  }

  /** ATK la plus haute parmi les monstres adverses face recto en position d'attaque. */
  private strongestFoe(view: DuelView): number {
    return Math.max(0, ...this.foe(view).monsters.map((m) => (m && m.faceUp && m.position === 'atk' ? (m.atk ?? 0) : 0)))
  }

  private idle(view: DuelView, all: PromptOption[]): Answer {
    // Les actions que le script du deck interdit sont écartées d'emblée.
    const pb = this.playbook
    const ctx = pb ? makeCtx(view, this.seat, this.playbook?.deck) : null
    const options = pb && ctx ? all.filter((o) => !isAvoided(pb, ctx, o)) : all
    // Rien à attaquer qui vaille la peine : on termine le tour au lieu de passer par chaque phase.
    const leave = (this.worthAttacking(view) ? options.find((o) => o.action === 'toBattle') : undefined) ?? options.find((o) => o.action === 'toEnd') ?? options.find((o) => o.action === 'toBattle')
    const pick = (o: PromptOption): number => {
      this.bump(`${o.action}:${o.uid}:${o.cardId}:${o.label ?? ''}`)
      return o.id
    }
    const fresh = (o: PromptOption, max = 1): boolean => this.count(`${o.action}:${o.uid}:${o.cardId}:${o.label ?? ''}`) < max
    if (++this.actions > MAX_ACTIONS_PER_TURN && leave) return leave.id

    const of = (action: PromptOption['action']): PromptOption[] => options.filter((o) => o.action === action)
    const best = (list: PromptOption[], value: (o: PromptOption) => number): PromptOption | undefined => [...list].sort((a, b) => value(b) - value(a))[0]

    // 0. Le script du deck : la première étape jouable, dans l'ordre.
    if (pb && ctx) {
      const step = nextStep(pb, ctx, options, (st) => this.count(`step:${st.id}`))
      if (step) {
        this.bump(`step:${step.step.id}`)
        return pick(step.option)
      }
    }

    // 1. Activer ce qui peut l'être, puis Invoquer Spécialement.
    const activate = of('activate').find((o) => fresh(o))
    if (activate) return pick(activate)
    const special = of('spsummon').find((o) => fresh(o, 2))
    if (special) return pick(special)

    // 2. Invocation Normale du monstre le plus fort ; un monstre faible et défensif est plutôt Posé.
    const usefulSummons = of('summon').filter((o) => fresh(o) && !HAND_TRAPS.has(o.cardId ?? 0))
    const summon = best(usefulSummons, (o) => cardWorth(o.cardId))
    if (summon) {
      const set = of('set').find((o) => o.uid === summon.uid)
      const weak = atkOf(summon.cardId) < this.strongestFoe(view) && defOf(summon.cardId) > atkOf(summon.cardId)
      return pick(weak && set && fresh(set) ? set : summon)
    }
    const set = best(of('set').filter((o) => fresh(o) && !HAND_TRAPS.has(o.cardId ?? 0)), (o) => defOf(o.cardId))
    if (set && !of('summon').length) return pick(set)

    // 3. Poser les Pièges.
    const trap = of('sset').find((o) => fresh(o) && ((typeOf(o.cardId) & TYPE.TRAP) !== 0 || (typeOf(o.cardId) & 0x10000) !== 0))
    if (trap) return pick(trap)

    // 4. Se mettre en défense face à plus fort, repasser en attaque quand on domine.
    const threat = this.strongestFoe(view)
    for (const o of of('position').filter((o) => fresh(o))) {
      const m = this.monster(view, o.uid)
      if (!m) continue
      const atk = m.atk ?? atkOf(m.card.cardId)
      const def = m.def ?? defOf(m.card.cardId)
      const toDefense = m.faceUp && m.position === 'atk' && atk < threat && def >= atk
      const toAttack = m.position === 'def' && atk > threat && atk >= 1000
      if (toDefense || toAttack) return pick(o)
    }

    return (leave ?? (options[0] as PromptOption)).id
  }

  // ───────────────────────────── Battle Phase ─────────────────────────────

  /** Meilleure cible pour un attaquant de cette ATK : la plus forte qu'il bat. null = aucune attaque rentable. */
  private bestTarget(view: DuelView, atk: number, candidates: (number | null)[] | null = null, attacker?: MonsterView | null): number | null {
    const scored = this.foe(view)
      .monsters.filter((m): m is MonsterView => m !== null && (candidates === null || candidates.includes(m.card.uid)))
      .map((m) => {
        if (!m.faceUp) return { uid: m.card.uid, score: atk >= 1900 ? 1 : -1 } // pari sur un monstre face verso
        if (attacker) {
          const result = combat(view, this.seat, attacker, m, this.playbook)
          return { uid: m.card.uid, score: result.damage - result.selfDamage + (result.kills ? cardWorth(m.card.cardId, m) : 0) - (result.dies ? cardWorth(attacker.card.cardId, attacker) : 0) }
        }
        const wall = m.position === 'atk' ? (m.atk ?? 0) : (m.def ?? 0)
        if (wall >= atk) return { uid: m.card.uid, score: -1 }
        // Battre un monstre en attaque inflige des dégâts : on le préfère.
        return { uid: m.card.uid, score: 10 + wall + (m.position === 'atk' ? 5000 : 0) }
      })
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored[0]?.uid ?? null
  }

  /** Le monstre peut-il attaquer pour quelque chose ? Un monstre à 0 ATK ne fait rien, sauf si son effet le dit (script du deck) ; certains sont à garder. */
  private mayAttack(view: DuelView, m: MonsterView, ctx: ReturnType<typeof makeCtx> | null): boolean {
    if (ctx && this.playbook?.hold?.(ctx, m)) return false
    const foes = this.foe(view).monsters.filter((x): x is MonsterView => x !== null)
    if (ctx && this.playbook?.target?.(ctx, m, foes) !== undefined) return true
    return (m.atk ?? atkOf(m.card.cardId)) > 0
  }

  /**
   * Y a-t-il une attaque qui vaille la peine ce tour ? Sinon l'ordinateur ne passe pas par la Battle Phase : il finit son tour.
   * Une attaque vaut la peine si elle est directe, ou si un monstre adverse (ou posé, pour un gros ATK) est battu.
   */
  worthAttacking(view: DuelView): boolean {
    const pb = this.playbook
    const ctx = pb ? makeCtx(view, this.seat, this.playbook?.deck) : null
    const foes = this.foe(view).monsters.filter((x): x is MonsterView => x !== null)
    for (const m of this.me(view).monsters) {
      if (!m || !m.faceUp || m.position !== 'atk' || !this.mayAttack(view, m, ctx)) continue
      if (ctx && pb?.target?.(ctx, m, foes) !== undefined) return true
      if (!foes.length) return true
      if (this.bestTarget(view, m.atk ?? atkOf(m.card.cardId), null, m) !== null) return true
    }
    return false
  }

  private battle(view: DuelView, options: PromptOption[]): Answer {
    const leave = options.find((o) => o.action === 'toMain2') ?? options.find((o) => o.action === 'toEnd')
    if (++this.actions > MAX_ACTIONS_PER_TURN && leave) return leave.id
    const foeHasMonsters = this.foe(view).monsters.some((m) => m)
    const bctx = this.playbook ? makeCtx(view, this.seat, this.playbook?.deck) : null
    const attackers = options
      .filter((o) => o.action === 'attack' && this.count(`noattack:${o.uid}`) === 0)
      .filter((o) => {
        const m = this.monster(view, o.uid)
        return !m || this.mayAttack(view, m, bctx)
      })
      .map((o) => ({ o, atk: this.monster(view, o.uid)?.atk ?? atkOf(o.cardId) }))
      .sort((a, b) => a.atk - b.atk)
    const pb = this.playbook
    const ctx = pb?.target ? makeCtx(view, this.seat, this.playbook?.deck) : null
    const foes = this.foe(view).monsters.filter((m): m is MonsterView => m !== null)
    for (const { o, atk } of attackers) {
      // Le script du deck sait qu'un monstre 0 ATK peut frapper fort par son effet.
      const mine = this.monster(view, o.uid)
      const wanted = pb && ctx && mine ? pb.target?.(ctx, mine, foes) : undefined
      if (wanted !== undefined) {
        this.target = wanted
        return o.id
      }
      if (!foeHasMonsters || o.direct) {
        this.target = null
        return o.id
      }
      const target = this.bestTarget(view, atk, null, mine)
      if (target !== null) {
        this.target = target
        return o.id
      }
    }
    return (leave ?? (options[0] as PromptOption)).id
  }

  private attackTarget(view: DuelView, prompt: CardsPrompt): Answer {
    const uids = prompt.cards.map((c) => c.uid)
    const attacker = this.monster(view, prompt.attackerUid ?? null)
    const wanted = this.target !== null && uids.includes(this.target) ? this.target : this.bestTarget(view, attacker?.atk ?? 0, uids, attacker)
    if (wanted !== null) return [uids.indexOf(wanted)]
    // Aucune cible rentable : on renonce à attaquer avec ce monstre. S'il revient quand même (attaque
    // obligatoire, aucune autre action possible), on attaque plutôt que de tourner en rond.
    const key = `noattack:${prompt.attackerUid}`
    const givenUp = this.count(key) > 0
    this.bump(key)
    return prompt.cancelable && !givenUp ? null : [0]
  }

  // ───────────────────────────── Choix de cartes ─────────────────────────────

  private cards(view: DuelView, prompt: CardsPrompt, attempt: number): Answer {
    if (prompt.ordered) return prompt.cards.map((_, i) => i)
    const score = (card: CardsPrompt['cards'][number]): number => selectionScore(view, this.seat, prompt, card, this.playbook)
    if (prompt.mode === 'step') {
      if (prompt.finishable && prompt.cards.some((c) => c.selected)) return null
      return prompt.cards.map((card, i) => ({ card, i, score: score(card) })).filter((x) => !x.card.selected).sort((a, b) => b.score - a.score)[attempt]?.i ?? null
    }
    const choices = cardSelections(prompt, score, Math.max(8, attempt + 1))
    return choices[attempt % Math.max(1, choices.length)] ?? (prompt.cancelable ? null : this.random(prompt))
  }

  // ───────────────────────────── Dernier recours ─────────────────────────────

  /** Réponse valide prise au hasard, quand les règles ci-dessus ont été refusées par le moteur. */
  private random(prompt: Prompt): Answer {
    const rand = (n: number): number => Math.floor(Math.random() * n)
    switch (prompt.kind) {
      case 'idle':
      case 'battle': {
        const ends = prompt.options.filter((o) => o.action.startsWith('to'))
        return ((ends.length ? ends : prompt.options)[rand(ends.length || prompt.options.length)] as PromptOption).id
      }
      case 'chain':
        return prompt.forced ? (prompt.options[rand(prompt.options.length)] as { id: number }).id : null
      case 'yesno':
        return rand(2)
      case 'option':
        if (prompt.pick) {
          const pool = prompt.options.map((_, i) => i)
          return Array.from({ length: prompt.pick }, () => pool.splice(rand(pool.length), 1)[0] as number)
        }
        return rand(prompt.options.length)
      case 'number':
      case 'position':
        return rand(prompt.options.length)
      case 'announce':
        return prompt.cards[rand(prompt.cards.length)] ?? 0
      case 'counters': {
        let left = prompt.total
        return prompt.cards.map((c) => {
          const n = Math.min(left, c.max)
          left -= n
          return n
        })
      }
      case 'place': {
        const pool = prompt.zones.map((_, i) => i)
        const picks = Array.from({ length: prompt.count }, () => pool.splice(rand(pool.length), 1)[0] as number)
        return prompt.count > 1 ? picks : (picks[0] ?? 0)
      }
      case 'cards': {
        if (prompt.mode === 'step') {
          const free = prompt.cards.map((c, i) => (c.selected ? -1 : i)).filter((i) => i >= 0)
          return prompt.finishable && rand(2) ? null : (free[rand(free.length)] ?? null)
        }
        if (prompt.cancelable && rand(4) === 0) return null
        const n = Math.min(prompt.cards.length, prompt.min + rand(Math.max(1, prompt.max - prompt.min + 1)))
        const pool = prompt.cards.map((_, i) => i)
        return Array.from({ length: n }, () => pool.splice(rand(pool.length), 1)[0] as number)
      }
    }
  }
}
