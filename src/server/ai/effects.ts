// Lecture du texte public des cartes : ces indices servent à classer les essais et à estimer les
// ressources. Ils ne remplacent jamais les conditions, coûts et opérations exécutés par ocgcore.
import type { DuelView, PromptOption, Seat } from '../../shared/protocol.ts'
import { cardText } from '../ocg/data.ts'
import { parseMsg } from '../../shared/msg.ts'

export interface EffectProfile {
  negate: boolean
  remove: boolean
  search: boolean
  draw: boolean
  summon: boolean
  revive: boolean
  protect: boolean
  damage: boolean
  grave: boolean
  floating: boolean
  quick: boolean
}

const profiles = new Map<number, EffectProfile>()

/** Une capacité détectée n'affirme pas que ses conditions sont actuellement satisfaites. */
export function effectsOf(cardId: number | null): EffectProfile {
  const cached = cardId === null ? undefined : profiles.get(cardId)
  if (cached) return cached
  const text = cardId === null ? '' : cardText(cardId).replace(/\s+/g, ' ')
  const profile: EffectProfile = {
    negate: /negate (?:the |that |its |their |all |any )?(?:activation|effects?|activated)/i.test(text),
    remove: /\b(?:destroy|banish|return|shuffle|send|take control)\b[^.;]*(?:opponent|on the field|on each field)/i.test(text),
    search: /\badd\b[^.;]*from (?:your |the )?(?:Deck|GY|Graveyard)[^.;]*to your hand/i.test(text),
    draw: /\bdraw (?:\d+|cards?|until)\b/i.test(text),
    summon: /\b(?:Special|Fusion|Synchro|Xyz|Ritual|Link) Summon\b/i.test(text),
    revive: /Special Summon[^.;]*from (?:your |either |the )?(?:GY|Graveyard)/i.test(text),
    protect: /cannot be (?:destroyed|targeted)|unaffected by|take no (?:battle |effect )?damage/i.test(text),
    damage: /(?:inflict|takes?|take)\b[^.;]*(?:damage|ATK)|battle damage[^.;]*(?:opponent|instead)/i.test(text),
    grave: /banish this card from your (?:GY|Graveyard)|this card (?:is|was) in (?:your |the )?(?:GY|Graveyard)/i.test(text),
    floating: /(?:if|when) this card is (?:sent|destroyed|Tributed|banished)|(?:if|when) this card leaves the field/i.test(text),
    quick: /\(Quick Effect\)|during either player's turn/i.test(text),
  }
  if (cardId !== null && text) profiles.set(cardId, profile)
  return profile
}

/** Valeur de capacités, en plus du corps et de l'ATK ; aucune carte particulière n'est requise. */
export function effectValue(cardId: number | null): number {
  const p = effectsOf(cardId)
  return 240 * Number(p.negate) + 180 * Number(p.remove) + 200 * Number(p.search)
    + 150 * Number(p.draw) + 130 * Number(p.revive) + 150 * Number(p.protect) + 80 * Number(p.quick)
}

/** Priorité contextuelle d'essai. Un effet de destruction à vide reste examinable, mais passe après les coups utiles. */
export function effectPriority(view: DuelView, seat: Seat, option: PromptOption): number {
  if (option.action !== 'activate') return 0
  const p = effectsOf(option.cardId)
  const me = view.players[seat]
  const foe = view.players[seat === 0 ? 1 : 0]
  const label = parseMsg(option.label ?? '')
  const text = label ? label.key === '=' ? String(label.params.en ?? '') : '' : option.label ?? ''
  // Le libellé distingue les modes lorsqu'il est disponible ; le profil complet reste seulement un indice.
  const removes = /destroy|banish|return|control/i.test(text) || (!text && p.remove)
  const draws = /draw|add.*hand/i.test(text) || (!text && (p.draw || p.search))
  const revives = /Special Summon/i.test(text) && p.revive
  let priority = 0
  if (draws) priority += me.hand.length < 4 ? 3 : 1.5
  if (removes) priority += foe.monsters.filter(Boolean).length + foe.spellTraps.filter(Boolean).length > 0 ? 3 : -3
  if (revives) priority += me.graveyard.length ? 2 : -2
  if (p.summon && me.monsters.filter(Boolean).length < 2) priority += 1.5
  if (p.negate && !view.chain.length) priority -= 2
  return priority
}
