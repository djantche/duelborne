// Questions du moteur → questions pour le joueur (ou réponse automatique quand le choix est sans intérêt).
import { OcgLocation, OcgMessageType, OcgPosition, OcgResponseType, SelectBattleCMDAction, SelectIdleCMDAction, cardMatchesOpcode } from '../../../vendor/ocgcore/dist/index.js'
import type { OcgMessage, OcgResponse } from '../../../vendor/ocgcore/dist/index.js'
import type { Answer, PlaceRef, Position, Prompt, PromptCard, PromptOption, Seat, Zone } from '../../shared/protocol.ts'
import { ATTRIBUTES, RACES, announceCandidates, cardData, cardName, cardNameEn, counterName, describeMsg, descriptionCard, displayId, effectNumber, hasEffectText, systemMsg } from './data.ts'
import { cardAt, isFaceUp } from './snapshot.ts'
import type { Loc, Snap } from './snapshot.ts'
import { msg } from '../../shared/msg.ts'
import { summonAssets, summonIllustrationIds } from '../assets/summons.ts'

export interface Pending {
  seat: Seat
  prompt: Prompt
  /** Convertit la valeur renvoyée par le client en réponse du moteur (null = valeur invalide). */
  toResponse(value: Answer): OcgResponse | null
}

/** Ce dont la construction d'une question a besoin de la part du duel. */
export interface PromptCtx {
  snap: Snap
  seat(corePlayer: number): Seat
  nextId(): number
  /** Dernière indication « choisis... » reçue par ce joueur ; elle est consommée. */
  takeHint(corePlayer: number): number
  /** Monstre qui vient d'être choisi pour attaquer (pour tracer la flèche vers la cible). */
  attackerUid: number | null
  setAttacker(uid: number | null): void
  /** Le duel affiche les Zones Monstre Extra : le joueur choisit alors où placer ses monstres. */
  extraZones: boolean
}

const ZONES: [number, Zone][] = [
  [OcgLocation.HAND, 'hand'],
  [OcgLocation.MZONE, 'monster'],
  [OcgLocation.SZONE, 'spellTrap'],
  [OcgLocation.GRAVE, 'graveyard'],
  [OcgLocation.REMOVED, 'banished'],
  [OcgLocation.DECK, 'deck'],
  [OcgLocation.EXTRA, 'extra'],
  [OcgLocation.OVERLAY, 'overlay'],
]
const zoneOf = (location: number): Zone => ZONES.find(([l]) => (location & l) !== 0)?.[1] ?? 'deck'
const isInt = (v: unknown): v is number => Number.isInteger(v)

const HINT_ATTACK_TARGET = 549

/** Libellé français d'un effet (s'il y en a un de sûr), son rang dans la carte, et si le moteur lui connaît un texte. */
function effectInfo(desc: bigint, code?: number): { label?: string; effect?: number; hasText?: true } {
  // Activation d'une Magie ou d'un Piège (sans texte d'effet propre) : on le dit, pour ne pas la confondre avec un autre effet de la carte.
  const label = describeMsg(desc) ?? (code !== undefined && ((cardData(code)?.type ?? 0) & 0x6) !== 0 ? msg('p.activateCard2') : '')
  const effect = effectNumber(desc)
  return { ...(label ? { label } : {}), ...(effect ? { effect } : {}), ...(hasEffectText(desc) ? { hasText: true as const } : {}) }
}

/**
 * @param asker joueur (du moteur) à qui la question est posée. Le moteur donne le code de toutes les
 *              cartes proposées : c'est à nous de cacher celles que ce joueur n'a pas le droit de
 *              connaître (choix au hasard dans la main ou le Deck adverse, carte face verso...).
 */
function promptCard(ctx: PromptCtx, c: Loc & { code: number }, asker: number, selected = false): PromptCard {
  const zone = zoneOf(c.location)
  // Les cartes du Deck et les Matériels Xyz n'ont pas d'identité visible côté client.
  const tracked = zone !== 'deck' && zone !== 'overlay'
  const card = tracked ? cardAt(ctx.snap, c) : null
  let visible = c.controller === asker || zone === 'graveyard' || zone === 'overlay'
  if (!visible && card) visible = zone === 'hand' ? card.isPublic : isFaceUp(card)
  const onField = zone === 'monster' || zone === 'spellTrap'
  return { uid: card?.uid ?? null, cardId: visible && c.code ? displayId(c.code) : null, seat: ctx.seat(c.controller), zone, ...(onField ? { index: c.sequence } : {}), ...(selected ? { selected } : {}) }
}

/** Zones libres d'un masque du moteur (bit à 1 = zone indisponible), dans l'ordre de préférence. */
function freePlaces(player: number, mask: number): { player: number; location: OcgLocation; sequence: number }[] {
  const places: { player: number; location: OcgLocation; sequence: number }[] = []
  for (const owner of [player, 1 - player]) {
    const bits = owner === player ? mask & 0xffff : mask >>> 16
    const add = (location: OcgLocation, sequence: number, offset: number): void => {
      if (!(bits & (1 << (sequence + offset)))) places.push({ player: owner, location, sequence })
    }
    for (let s = 0; s < 5; s++) add(OcgLocation.MZONE, s, 0)
    for (let s = 0; s < 8; s++) add(OcgLocation.SZONE, s, 8)
    for (let s = 5; s < 7; s++) add(OcgLocation.MZONE, s, 0)
  }
  return places
}

/** Carte dont vient une description du moteur, pour que le joueur puisse relire son texte. */
function cardOfDescription(desc: bigint): { cardId?: number } {
  const code = descriptionCard(desc)
  return code ? { cardId: displayId(code) } : {}
}

/** Renvoie une question pour un joueur, une réponse automatique, ou null si le message n'en demande pas. */
export function buildQuestion(m: OcgMessage, ctx: PromptCtx): Pending | OcgResponse | null {
  const T = OcgMessageType
  const R = OcgResponseType
  // Une indication est soit un texte système (petit numéro), soit la description d'une carte (code << 20 | rang).
  const text = (hint: number, fallback: string): string => (hint ? ((hint > 0xfffff ? describeMsg(BigInt(hint)) : systemMsg(hint)) ?? fallback) : fallback)

  switch (m.type) {
    case T.SELECT_IDLECMD:
    case T.SELECT_BATTLECMD: {
      const options: PromptOption[] = []
      const responses: OcgResponse[] = []
      const add = (action: PromptOption['action'], c: (Loc & { code: number }) | null, response: OcgResponse, extra: Partial<PromptOption> = {}): void => {
        const ref = c ? promptCard(ctx, c, m.player) : null
        options.push({ id: responses.length, uid: ref?.uid ?? null, cardId: ref?.cardId ?? null, zone: ref?.zone ?? null, action, ...extra })
        responses.push(response)
      }
      const label = (desc: bigint, code?: number): Partial<PromptOption> => effectInfo(desc, code)
      if (m.type === T.SELECT_IDLECMD) {
        const A = SelectIdleCMDAction
        const res = (action: SelectIdleCMDAction, index: number | null): OcgResponse => ({ type: R.SELECT_IDLECMD, action, index })
        m.summons.forEach((c, i) => add('summon', c, res(A.SELECT_SUMMON, i)))
        m.special_summons.forEach((c, i) => add('spsummon', c, res(A.SELECT_SPECIAL_SUMMON, i)))
        m.pos_changes.forEach((c, i) => add('position', c, res(A.SELECT_POS_CHANGE, i)))
        m.monster_sets.forEach((c, i) => add('set', c, res(A.SELECT_MONSTER_SET, i)))
        m.spell_sets.forEach((c, i) => add('sset', c, res(A.SELECT_SPELL_SET, i)))
        m.activates.forEach((c, i) => add('activate', c, res(A.SELECT_ACTIVATE, i), label(c.description, c.code)))
        if (m.to_bp) add('toBattle', null, res(A.TO_BP, null))
        if (m.to_ep) add('toEnd', null, res(A.TO_EP, null))
      } else {
        const A = SelectBattleCMDAction
        const res = (action: SelectBattleCMDAction, index: number | null): OcgResponse => ({ type: R.SELECT_BATTLECMD, action, index })
        m.attacks.forEach((c, i) => add('attack', c, res(A.SELECT_BATTLE, i), { direct: c.can_direct }))
        m.chains.forEach((c, i) => add('activate', c, res(A.SELECT_CHAIN, i), label(c.description, c.code)))
        if (m.to_m2) add('toMain2', null, res(A.TO_M2, null))
        if (m.to_ep) add('toEnd', null, res(A.TO_EP, null))
      }
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: m.type === T.SELECT_IDLECMD ? 'idle' : 'battle', options },
        toResponse: (v) => {
          if (!isInt(v) || !responses[v]) return null
          const o = options[v]
          ctx.setAttacker(o?.action === 'attack' ? o.uid : null)
          return responses[v] ?? null
        },
      }
    }

    case T.SELECT_CHAIN: {
      // Rien à activer : on répond « non » sans déranger le joueur.
      if (!m.selects.length) return { type: R.SELECT_CHAIN, index: null }
      const options = m.selects.map((c, i) => {
        const ref = promptCard(ctx, c, m.player)
        return { id: i, uid: ref.uid, cardId: displayId(c.code), zone: ref.zone, ...effectInfo(c.description, c.code) }
      })
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'chain', forced: m.forced, options },
        toResponse: (v) => (v === null ? (m.forced ? null : { type: R.SELECT_CHAIN, index: null }) : isInt(v) && options[v] ? { type: R.SELECT_CHAIN, index: v } : null),
      }
    }

    case T.SELECT_EFFECTYN:
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'yesno', text: msg('srv.useEffect', { name: cardName(m.code), 'name@en': cardNameEn(m.code) }), cardId: displayId(m.code) },
        toResponse: (v) => (v === 0 || v === 1 ? { type: R.SELECT_EFFECTYN, yes: v === 1 } : null),
      }
    case T.SELECT_YESNO:
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'yesno', text: describeMsg(m.description) ?? (descriptionCard(m.description) ? msg('srv.useEffect2', { name: cardName(descriptionCard(m.description)), 'name@en': cardNameEn(descriptionCard(m.description)) }) : msg('srv.confirm')), ...cardOfDescription(m.description), ...(m.description === 31n ? { direct: true as const } : {}) },
        toResponse: (v) => (v === 0 || v === 1 ? { type: R.SELECT_YESNO, yes: v === 1 } : null),
      }
    case T.SELECT_OPTION: {
      // Un choix doit toujours dire ce qu'il fait : faute de traduction, on montre le libellé d'origine plutôt qu'« Option 2 ».
      const options = m.options.map((d, i) => describeMsg(d) ?? msg('srv.optionN', { n: i + 1 }))
      const source = m.options.map(descriptionCard).find((c) => c !== 0)
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'option', text: text(ctx.takeHint(m.player), msg('srv.chooseOption')), options, ...(source ? { cardId: displayId(source) } : {}) },
        toResponse: (v) => (isInt(v) && options[v] !== undefined ? { type: R.SELECT_OPTION, index: v } : null),
      }
    }

    case T.SELECT_CARD:
    case T.SELECT_TRIBUTE:
    case T.SELECT_SUM: {
      const sum = m.type === T.SELECT_SUM
      // Sélection par somme : les cartes imposées comptent dans le total mais ne se choisissent pas ; on les montre cochées.
      const must = m.type === T.SELECT_SUM ? m.selects_must : []
      const selects = m.selects
      const cancelable = m.type === T.SELECT_SUM ? false : m.can_cancel
      // Par somme de Niveaux, « 0 » veut dire sans limite de nombre de cartes.
      const min = sum ? Math.max(1, m.min) : m.min
      const max = m.max > 0 ? Math.min(m.max, selects.length) : sum ? selects.length : 0
      const hint = ctx.takeHint(m.player) || (m.type === T.SELECT_TRIBUTE ? 500 : 0)
      const base = text(hint, msg('srv.chooseCards'))
      const type = m.type === T.SELECT_CARD ? R.SELECT_CARD : m.type === T.SELECT_TRIBUTE ? R.SELECT_TRIBUTE : R.SELECT_SUM
      const attackTarget = m.type === T.SELECT_CARD && hint === HINT_ATTACK_TARGET && ctx.attackerUid !== null
      // Chaque Sacrifice compte pour 1, ou plus : certains monstres comptent pour 2.
      const weights = m.type === T.SELECT_TRIBUTE ? m.selects.map((c) => Math.max(1, c.release_param)) : null
      const values = (c: { amount: number }): number[] => [c.amount & 0xffff, c.amount >>> 16].filter((n) => n > 0)
      const fixed = must.reduce((t, c) => t + (values(c)[0] ?? 0), 0)
      const cards = [...must.map((c) => promptCard(ctx, c, m.player, true)), ...selects.map((c) => promptCard(ctx, c, m.player))]
      return {
        seat: ctx.seat(m.player),
        prompt: {
          id: ctx.nextId(),
          kind: 'cards',
          // Sélection par somme (Rituel, Synchro) : c'est le total des Niveaux qui compte.
          text: sum ? msg(m.select_max !== 0 ? 'srv.levelsAtLeast' : 'srv.levelsExactly', { base, n: m.amount }) : base,
          hint,
          min,
          max: weights ? m.max : max,
          cancelable,
          mode: 'multi',
          finishable: false,
          cards,
          ...(attackTarget ? { attackerUid: ctx.attackerUid as number } : {}),
          // Une carte peut compter pour deux valeurs (16 bits de poids fort) : on donne les deux.
          ...(m.type === T.SELECT_SUM ? { sum: { target: m.amount, amounts: [...must.map(() => [] as number[]), ...m.selects.map(values)], ...(fixed ? { fixed } : {}), ...(m.select_max !== 0 ? { atLeast: true } : {}) } } : {}),
          ...(weights ? { weights: weights } : {}),
          ...(must.length ? { mustCount: must.length } : {}),
        },
        toResponse: (v) => {
          if (v === null) return cancelable ? ({ type, indicies: null } as OcgResponse) : null
          // Les rangs reçus comptent les cartes imposées en premier ; le moteur ne veut que les cartes choisies.
          const list = (isInt(v) ? [v] : v).filter((i) => i >= must.length).map((i) => i - must.length)
          if (new Set(list).size !== list.length || !list.every((i) => i >= 0 && i < selects.length)) return null
          // Par somme, c'est le moteur qui juge le total. Pour les Sacrifices, une carte peut en valoir 2.
          const count = weights ? list.reduce((t, i) => t + (weights[i] ?? 1), 0) : list.length
          if (sum) return list.length >= 1 ? ({ type, indicies: list } as OcgResponse) : null
          return count >= min && count <= (weights ? m.max : max) ? ({ type, indicies: list } as OcgResponse) : null
        },
      }
    }
    case T.SELECT_UNSELECT_CARD: {
      const cards = [...m.select_cards.map((c) => promptCard(ctx, c, m.player)), ...m.unselect_cards.map((c) => promptCard(ctx, c, m.player, true))]
      const hint = ctx.takeHint(m.player)
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'cards', text: text(hint, msg('srv.chooseCards')), hint, min: m.min, max: m.max, cancelable: m.can_cancel, mode: 'step', finishable: m.can_finish, cards },
        toResponse: (v) => {
          if (v === null) return m.can_finish || m.can_cancel ? { type: R.SELECT_UNSELECT_CARD, index: null } : null
          return isInt(v) && cards[v] ? { type: R.SELECT_UNSELECT_CARD, index: v } : null
        },
      }
    }

    case T.SELECT_POSITION: {
      const all: [number, Position, boolean][] = [
        [OcgPosition.FACEUP_ATTACK, 'atk', true],
        [OcgPosition.FACEUP_DEFENSE, 'def', true],
        [OcgPosition.FACEDOWN_DEFENSE, 'def', false],
        [OcgPosition.FACEDOWN_ATTACK, 'atk', false],
      ]
      const choices = all.filter(([bit]) => (m.positions & bit) !== 0)
      const first = choices[0]
      if (!first) return null
      if (choices.length === 1) return { type: R.SELECT_POSITION, position: first[0] as never }
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'position', cardId: displayId(m.code), options: choices.map(([, position, faceUp]) => ({ position, faceUp })) },
        toResponse: (v) => (isInt(v) && choices[v] ? { type: R.SELECT_POSITION, position: choices[v][0] as never } : null),
      }
    }

    case T.SELECT_PLACE:
    case T.SELECT_DISFIELD: {
      const type = m.type === T.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD
      const count = Math.max(1, m.count)
      const free = freePlaces(m.player, m.field_mask)
      const hint = ctx.takeHint(m.player)
      // Rien à choisir : autant de zones libres que de zones demandées.
      if (free.length <= count) return { type, places: free.slice(0, count) }
      // Le joueur choisit aussi sa zone Magie/Piège : les colonnes peuvent influer sur les effets.
      const zones: PlaceRef[] = free.map((p) => ({ seat: ctx.seat(p.player), zone: p.location === OcgLocation.MZONE ? 'monster' : 'spellTrap', index: p.sequence }))
      const disabling = m.type === T.SELECT_DISFIELD
      const fallback = disabling ? (count > 1 ? msg('srv.disableZones', { n: count }) : msg('srv.disableZone')) : count > 1 ? msg('srv.chooseZones', { n: count }) : msg('srv.chooseZone')
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'place', text: hint ? text(hint, fallback) : fallback, zones, count },
        toResponse: (v) => {
          const list = isInt(v) ? [v] : v
          if (list === null || list.length !== count || new Set(list).size !== count || !list.every((i) => free[i] !== undefined)) return null
          return { type, places: list.map((i) => free[i] as (typeof free)[number]) }
        },
      }
    }

    case T.ANNOUNCE_NUMBER: {
      const options = m.options.map(Number)
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'number', text: text(ctx.takeHint(m.player), msg('srv.declareNumber')), options },
        toResponse: (v) => (isInt(v) && options[v] !== undefined ? { type: R.ANNOUNCE_NUMBER, value: v } : null),
      }
    }
    case T.ANNOUNCE_RACE:
    case T.ANNOUNCE_ATTRIB: {
      const race = m.type === T.ANNOUNCE_RACE
      const names = race ? RACES : ATTRIBUTES
      const available = BigInt(m.available)
      const bits = names.map((_, i) => 1n << BigInt(i)).filter((bit) => (available & bit) !== 0n)
      const respond = (chosen: bigint[]): OcgResponse => (race ? { type: R.ANNOUNCE_RACE, races: chosen as never } : { type: R.ANNOUNCE_ATTRIB, attributes: chosen.map(Number) as never })
      // Rien à choisir : une seule valeur possible (ou autant que demandé).
      if (bits.length <= Math.max(1, m.count)) return respond(bits)
      const options = bits.map((bit) => msg(`${race ? 'race' : 'attr'}.${names[bit.toString(2).length - 1] ?? '?'}`))
      ctx.takeHint(m.player)
      const count = Math.max(1, m.count)
      const declare = race ? (count > 1 ? msg('srv.declareRaces', { n: count }) : msg('srv.declareRace')) : count > 1 ? msg('srv.declareAttrs', { n: count }) : msg('srv.declareAttr')
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'option', text: declare, options, ...(count > 1 ? { pick: count } : {}) },
        toResponse: (v) => {
          const list = isInt(v) ? [v] : v
          if (list === null || list.length !== count || new Set(list).size !== count || !list.every((i) => bits[i] !== undefined)) return null
          return respond(list.map((i) => bits[i] as bigint))
        },
      }
    }

    // ── Déclarer le nom d'une carte : le joueur cherche parmi les cartes permises ──
    case T.ANNOUNCE_CARD: {
      const hint = ctx.takeHint(m.player)
      let title = text(hint, msg('srv.declareCard'))
      const illustrations = title === msg('sandbox.summon_pick') ? summonAssets() : null
      const candidates = announceCandidates((card) => cardMatchesOpcode(card, m.opcodes) && (!illustrations || !!illustrations[displayId(card.code)]?.image))
      if (illustrations) {
        const known = summonIllustrationIds()
        const total = announceCandidates((card) => cardMatchesOpcode(card, m.opcodes) && known.has(displayId(card.code))).length
        title = msg('sandbox.summon_progress', { ready: candidates.length, total })
      }
      if (!candidates.length) return { type: R.ANNOUNCE_CARD, card: 0 }
      const allowed = new Set(candidates)
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'announce', text: title, cards: candidates },
        toResponse: (v) => (isInt(v) && allowed.has(v) ? { type: R.ANNOUNCE_CARD, card: v } : null),
      }
    }

    // ── Ordonner des cartes (dessus du Deck, effets déclenchés simultanés) : on les touche dans l'ordre voulu ──
    case T.SORT_CARD:
    case T.SORT_CHAIN: {
      const n = m.cards.length
      if (n < 2) return { type: R.SORT_CARD, order: null }
      const hint = ctx.takeHint(m.player)
      const chain = m.type === T.SORT_CHAIN
      return {
        seat: ctx.seat(m.player),
        prompt: {
          id: ctx.nextId(),
          kind: 'cards',
          text: text(hint, msg(chain ? 'srv.orderChain' : 'srv.orderCards')),
          hint,
          min: n,
          max: n,
          cancelable: false,
          mode: 'multi',
          finishable: false,
          ordered: true,
          cards: m.cards.map((c) => promptCard(ctx, c, m.player)),
        },
        toResponse: (v) => {
          const list = isInt(v) ? [v] : v
          if (list === null || list.length !== n || new Set(list).size !== n || !list.every((i) => i >= 0 && i < n)) return null
          // Le moteur veut, pour chaque carte, sa nouvelle place (0 = dessus) ; le joueur a touché les cartes de la première à la dernière.
          const order = Array<number>(n).fill(0)
          list.forEach((card, place) => (order[card] = place))
          return { type: R.SORT_CARD, order }
        },
      }
    }

    // ── Retirer des compteurs : combien sur chaque carte ──
    case T.SELECT_COUNTER: {
      const cards = m.cards.map((c) => ({ ...promptCard(ctx, c, m.player), max: c.count }))
      // Une seule répartition possible : on ne dérange pas le joueur.
      const available = cards.reduce((t, c) => t + c.max, 0)
      if (available <= m.count) return { type: R.SELECT_COUNTER, counters: cards.map((c) => c.max) }
      const name = counterName(m.counter_type)
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'counters', text: text(ctx.takeHint(m.player), msg('srv.removeCounters', { n: m.count, name })), total: m.count, counter: name, cards },
        toResponse: (v) => {
          if (!Array.isArray(v) || v.length !== cards.length) return null
          const ok = v.every((n, i) => isInt(n) && n >= 0 && n <= (cards[i] as { max: number }).max) && v.reduce((t, n) => t + n, 0) === m.count
          return ok ? { type: R.SELECT_COUNTER, counters: v } : null
        },
      }
    }

    // ── Pierre-feuille-ciseaux : chacun choisit ──
    case T.ROCK_PAPER_SCISSORS:
      return {
        seat: ctx.seat(m.player),
        prompt: { id: ctx.nextId(), kind: 'option', text: msg('srv.rps'), options: [msg('srv.scissors'), msg('srv.rock'), msg('srv.paper')], rps: true },
        toResponse: (v) => (isInt(v) && v >= 0 && v <= 2 ? { type: R.ROCK_PAPER_SCISSORS, value: (v + 1) as 1 | 2 | 3 } : null),
      }
    default:
      return null
  }
}
