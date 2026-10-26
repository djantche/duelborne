// Les scripts de deck : des connaissances propres à un deck (ses combinaisons, ses pièges, ce qu'il garde en main) que
// l'ordinateur suit EN PLUS de sa propre réflexion. Un script ne remplace ni les règles simples (bot.ts) ni les essais
// du planificateur (planner.ts) : il leur souffle quoi jouer dans quel ordre, quoi ne jamais faire, quelle carte
// défausser ou chercher, et ce que vaut une position pour CE deck (un monstre 0/0 de la lignée Yubel ne vaut pas rien).
//
// Le script ne voit que la vue de l'ordinateur (ses cartes, ce que l'adversaire montre) : jamais la main adverse.
// Les scripts sont dans playbooks/ ; playbooks/index.ts reconnaît le deck de la place et rend le bon.
import type { Answer, DuelView, MonsterView, PlayerView, Prompt, PromptCard, PromptOption, Seat, Zone } from '../../shared/protocol.ts'
import { parseMsg } from '../../shared/msg.ts'
import type { Combat } from './tactics.ts'

type IdleAction = PromptOption['action']

/** La situation, vue par le script : des comptes simples plutôt que des vues brutes. */
export interface Ctx {
  view: DuelView
  seat: Seat
  me: PlayerView
  foe: PlayerView
  /** Identité de la carte qui vient d'être activée (haut de la chaîne), pour savoir qui pose la question en cours. */
  chainTop: number | null
  /** La dernière carte de la chaîne vient de l'adversaire : on lui répond. */
  foeChain: boolean
  /** Exemplaires encore dans notre Deck, déduits de notre liste et des zones visibles ; 1 si la liste est inconnue. */
  inDeck(id: number): number
  /** Une cible peut être appelée depuis la main, le Deck ou le Cimetière. */
  available(...ids: number[]): boolean
  /** Exemplaires de ces cartes à cet endroit chez nous (« field » : monstres, Magies/Pièges et Terrain). */
  count(where: 'hand' | 'monsters' | 'spells' | 'field' | 'grave' | 'banished', ...ids: number[]): number
  /** Idem, face recto seulement (monstres, Magies/Pièges, Terrain). */
  up(where: 'monsters' | 'spells' | 'field', ...ids: number[]): number
}

export function makeCtx(view: DuelView, seat: Seat, deck?: readonly number[]): Ctx {
  const me = view.players[seat]
  const foe = view.players[seat === 0 ? 1 : 0]
  const monsters = me.monsters.filter((m): m is MonsterView => m !== null)
  const spells = [...me.spellTraps, me.fieldZone].filter((s): s is NonNullable<typeof s> => s !== null)
  const of = (cards: { card: { cardId: number | null } }[], ids: number[]): number => cards.filter((c) => c.card.cardId !== null && ids.includes(c.card.cardId)).length
  const ofCards = (cards: { cardId: number | null }[], ids: number[]): number => cards.filter((c) => c.cardId !== null && ids.includes(c.cardId)).length
  const inDeck = (id: number): number => deck ? Math.max(0, deck.filter((c) => c === id).length - ofCards([...me.hand, ...me.graveyard, ...me.banished, ...me.extra], [id]) - of(monsters, [id]) - of(spells, [id])) : 1
  return {
    view,
    seat,
    me,
    foe,
    chainTop: view.chain[view.chain.length - 1]?.cardId ?? null,
    foeChain: (view.chain[view.chain.length - 1]?.seat ?? seat) !== seat,
    inDeck,
    available: (...ids) => ofCards([...me.hand, ...me.graveyard], ids) > 0 || ids.some((id) => inDeck(id) > 0),
    count(where, ...ids) {
      switch (where) {
        case 'hand':
          return ofCards(me.hand, ids)
        case 'grave':
          return ofCards(me.graveyard, ids)
        case 'banished':
          return ofCards(me.banished, ids)
        case 'monsters':
          return of(monsters, ids)
        case 'spells':
          return of(spells, ids)
        case 'field':
          return of(monsters, ids) + of(spells, ids)
      }
    },
    up(where, ...ids) {
      const ups = (list: { card: { cardId: number | null }; faceUp: boolean }[]): number => of(list.filter((c) => c.faceUp), ids)
      return where === 'monsters' ? ups(monsters) : where === 'spells' ? ups(spells) : ups(monsters) + ups(spells)
    },
  }
}

/** Une étape du script de Main Phase : « à ce moment, cette action avec cette carte ». */
export interface Step {
  /** Nom lisible, repris dans la trace de l'ordinateur. */
  id: string
  action: IdleAction | IdleAction[]
  /** Carte(s) concernée(s) ; absent : n'importe laquelle. */
  card?: number | number[]
  zone?: Zone
  /** Texte de l'effet, si la carte en a plusieurs (cherché dans le libellé de l'option, en français et en anglais). */
  effect?: RegExp
  /** Condition pour jouer cette étape. */
  when?: (c: Ctx, o: PromptOption) => boolean
  /** Nombre maximal de fois dans le tour (1 par défaut). */
  times?: number
  /** Poids dans le jugement du planificateur (1200 par défaut) ; les étapes plus haut dans la liste passent devant. */
  weight?: number
}

export function stepMatches(step: Step, o: PromptOption, c: Ctx): boolean {
  const actions = Array.isArray(step.action) ? step.action : [step.action]
  if (!actions.includes(o.action)) return false
  if (step.card !== undefined) {
    const ids = Array.isArray(step.card) ? step.card : [step.card]
    if (o.cardId === null || !ids.includes(o.cardId)) return false
  }
  if (step.zone && o.zone !== step.zone) return false
  const label = o.label ?? ''
  const message = parseMsg(label)
  if (step.effect && !step.effect.test(message?.key === '=' ? `${message.params.en ?? ''} ${message.params.fr ?? ''}` : label)) return false
  return step.when ? step.when(c, o) : true
}

export interface Playbook {
  name: string
  /** Liste de notre propre Deck/Extra, sans ordre de pioche. */
  deck?: readonly number[]
  /** Reconnaît le deck de la place d'après la liste de ses cartes (Deck principal et Extra Deck). */
  matches(deck: number[]): boolean
  /** Le script de Main Phase, dans l'ordre : la première étape jouable est jouée. */
  steps?: Step[]
  /** Options écartées des règles simples et essayées plus tard par le planificateur, qui peut les retenir. */
  avoid?: Step[]
  /** Bonus ou malus de jugement pour une option de la Main Phase, de la Battle Phase ou d'une chaîne (en plus des étapes). */
  bias?(c: Ctx, o: { action?: IdleAction; cardId: number | null; zone: Zone | null; uid: number | null; label?: string }): number
  /**
   * Ce que vaut une de NOS cartes selon l'intention du choix : « cost » (ce qu'on garde : la moins chère part en coût ou
   * en défausse), « gain » (ce qu'on veut : la plus chère est cherchée ou ramenée), « harm » (ce qu'on garde : la
   * moins chère est détruite). undefined : jugement général des effets et des ressources.
   */
  rate?(c: Ctx, card: PromptCard, intent: 'cost' | 'gain' | 'harm', prompt: Extract<Prompt, { kind: 'cards' }>): number | undefined
  /** Proposition pour une question secondaire : le planificateur la compare aux autres choix avec le moteur. */
  answer?(c: Ctx, prompt: Prompt): Answer | undefined
  /** Valeur d'un monstre de l'ordinateur sur le terrain, quand l'ATK ne dit pas sa force (undefined : jugement habituel). */
  monster?(m: MonsterView): number | undefined
  /** Effets de combat connus du deck (dégâts réfléchis, destruction après combat…). */
  combat?(c: Ctx, attacker: MonsterView, target: MonsterView): Combat | undefined
  /**
   * Cible voulue d'une attaque de ce monstre parmi les monstres adverses (uid), quand l'ATK ne dit pas ce qu'il vaut : un monstre
   * 0 ATK dont l'effet inflige des dégâts égaux à l'ATK de l'adversaire attaque le plus fort. undefined : jugement habituel.
   */
  target?(c: Ctx, attacker: MonsterView, foes: MonsterView[]): number | undefined
  /** Ce monstre ne doit pas attaquer (il sert à autre chose : tribut obligatoire de Yubel à l'End Phase, par exemple). */
  hold?(c: Ctx, m: MonsterView): boolean
  /** Ce monstre ne peut pas être détruit au combat (et ne coûte aucun dégât) : l'adversaire ne lui prend rien en attaquant. */
  immune?(m: MonsterView): boolean
  /** Les attaques adverses sont toutes détournées vers nos monstres invulnérables (Nightmare Pain) : leur menace ne compte plus. */
  redirects?(c: Ctx): boolean
  /** Valeur d'une position pour ce deck, en plus du jugement habituel (combinaisons en place, cartes à garder en main…). */
  position?(c: Ctx): number
}

/** La première étape jouable parmi les options (celles déjà jouées assez de fois selon `done` sont sautées). */
export function nextStep(pb: Playbook, c: Ctx, options: PromptOption[], done: (step: Step) => number): { step: Step; option: PromptOption } | null {
  for (const step of pb.steps ?? []) {
    if (done(step) >= (step.times ?? 1)) continue
    const option = options.find((o) => stepMatches(step, o, c))
    if (option) return { step, option }
  }
  return null
}

export function isAvoided(pb: Playbook, c: Ctx, o: PromptOption): boolean {
  return (pb.avoid ?? []).some((s) => stepMatches(s, o, c))
}

/** Bonus de jugement d'une option : étape du script (plus haut = plus fort), malus des choses à éviter, et biais propre au script. */
export function optionBonus(pb: Playbook, c: Ctx, o: PromptOption): number {
  let bonus = 0
  const steps = pb.steps ?? []
  const i = steps.findIndex((s) => stepMatches(s, o, c))
  if (i >= 0) bonus += (steps[i]?.weight ?? 1200) + (steps.length - i) * 20
  if (isAvoided(pb, c, o)) bonus -= 2500
  return bonus + (pb.bias?.(c, o) ?? 0)
}
