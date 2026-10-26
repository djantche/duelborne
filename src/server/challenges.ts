// Défis : conditions de victoire supplémentaires, évaluées par le serveur sur la vue publique du duel (jamais sur une main
// cachée). La victoire ordinaire (points de vie à zéro, Deck vide, effet de carte) reste possible pendant un défi.
import { msg } from '../shared/msg.ts'
import { CHALLENGE_RULES, startingLp } from '../shared/formats.ts'
import type { ChallengeId } from '../shared/formats.ts'
import type { DuelSettings, DuelView, Seat } from '../shared/protocol.ts'

export interface ChallengeResult {
  winner: Seat | 'draw'
  /** Texte du journal. */
  reason: string
}

/** Les équipes qui remplissent la condition d'un défi. */
function reached(view: DuelView, challenge: ChallengeId, settings: Pick<DuelSettings, 'startLp' | 'handicap'>): Seat[] {
  const [lp0, lp1] = startingLp(settings.startLp, settings.handicap)
  const goals = [lp0 * 2, lp1 * 2]
  return ([0, 1] as const).filter((seat) => {
    const p = view.players[seat]
    switch (challenge) {
      case 'lp-double':
        return p.lp >= (goals[seat] as number)
      case 'graveyard':
        return p.graveyard.length >= CHALLENGE_RULES.graveyard
      case 'monster-wall':
        return p.monsters.filter(Boolean).length >= CHALLENGE_RULES.monsterWall
      case 'banished':
        return p.banished.length >= CHALLENGE_RULES.banished
      default:
        return false
    }
  })
}

/** Le défi est-il gagné dans cette vue ? null : la partie continue. */
export function evaluateChallenge(view: DuelView, settings: Pick<DuelSettings, 'challenge' | 'startLp' | 'handicap'>): ChallengeResult | null {
  const { challenge } = settings
  if (challenge === 'none' || view.winner !== null) return null
  const why = msg('log.challengeWon', { name: msg(`challenge.${challenge}`) })
  if (challenge === 'sprint') {
    // Le Sprint se joue en un nombre de tours fixé : à la fin, le plus de points de vie gagne.
    if (view.turn <= CHALLENGE_RULES.sprintTurns) return null
    const [a, b] = [view.players[0].lp, view.players[1].lp]
    return { winner: a === b ? 'draw' : a > b ? 0 : 1, reason: msg('log.sprintOver', { turns: CHALLENGE_RULES.sprintTurns }) }
  }
  const winners = reached(view, challenge, settings)
  if (!winners.length) return null
  // Les deux équipes au même moment : égalité.
  return { winner: winners.length === 2 ? 'draw' : (winners[0] as Seat), reason: why }
}
