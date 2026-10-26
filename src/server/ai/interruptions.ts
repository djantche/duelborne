// Le moteur mesure les gains immédiats d'une négation. Ce complément estime le développement
// adverse évité quand la copie s'arrête avant ses choix suivants, sans examiner ses ressources cachées.
import type { DuelView, Prompt, Seat } from '../../shared/protocol.ts'
import { TYPE, cardData, cardText } from '../ocg/data.ts'
import { cardWorth, effectText, HAND_TRAPS, NEGATES } from './tactics.ts'
import { effectsOf } from './effects.ts'

type ChainOption = Extract<Prompt, { kind: 'chain' }>['options'][number]

/** Valeur du tempo d'une interruption, distincte des préférences de script et de la position simulée. */
export function interruptionTempo(view: DuelView, seat: Seat, option: ChainOption): number {
  const top = view.chain.at(-1)
  if (!top || (!NEGATES.has(option.cardId) && !effectsOf(option.cardId).negate)) return 0
  const label = effectText(option.label ?? '')
  // Une carte peut aussi proposer d'invoquer ou de chercher : son autre effet de négation ne suffit pas.
  if (!NEGATES.has(option.cardId) && /Special Summon|draw|add.*hand|return/i.test(label) && !/negate/i.test(label)) return 0
  if (top.seat === seat) return -700
  const foe = view.players[top.seat]
  // Veiler et Impermanence ciblent un monstre sur le terrain ; Called by cible le Cimetière.
  // Leur présence dans les actions légales ne prouve pas qu'ils arrêtent l'effet activé.
  if ([97268402, 10045474].includes(option.cardId) && !foe.monsters.some((m) => m?.faceUp && m.card.cardId === top.cardId)) return 0
  if (option.cardId === 24224830 && !foe.graveyard.some((c) => c.cardId === top.cardId)) return 0
  // Lotus et Phantom réécrivent seulement les effets de monstres.
  if ([62318994, 80453041].includes(option.cardId) && !((cardData(top.cardId)?.type ?? 0) & TYPE.MONSTER)) return 0

  let tempo = 480 + Math.min(160, cardWorth(top.cardId) * 0.12)
  // Un moteur encore peu installé peut transformer une recherche ou une invocation en plusieurs cartes.
  if (foe.monsters.filter(Boolean).length < 2) tempo += 160
  if (/Special Summon.*from your Deck|add .*from your Deck to your hand/i.test(cardText(top.cardId))) tempo += 100
  // Une interruption adverse menace une de nos activations encore dans la chaîne.
  if (HAND_TRAPS.has(top.cardId) && view.chain.slice(0, -1).some((c) => c.seat === seat)) tempo += 240
  return Math.min(1000, tempo)
}
