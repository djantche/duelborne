// Présentation du classement final, à partir des résultats autoritaires du tournoi.
import type { TournamentView } from '../../../shared/tournament.ts'

export interface Placement { rank: number; tied: boolean }

/** Les joueurs éliminés au même tour partagent leur place : aucune petite finale n'est jouée. */
export function finalPlacement(view: TournamentView, userId: string): Placement | null {
  if (view.state !== 'finished') return null
  const player = view.playerList.find((p) => p.userId === userId)
  if (!player) return null
  if (view.kind !== 'single') return { rank: player.rank, tied: false }
  if (view.champion?.userId === userId) return { rank: 1, tied: false }
  const eliminated = view.matches.flatMap((m) => {
    if (m.state !== 'done' || !m.winner || m.result === 'bye' || !m.a || !m.b) return []
    return [{ id: m.winner === m.a.userId ? m.b.userId : m.a.userId, round: m.round }]
  })
  const loss = eliminated.find((p) => p.id === userId)
  if (!loss) return null
  return { rank: 2 + eliminated.filter((p) => p.round > loss.round).length, tied: eliminated.filter((p) => p.round === loss.round).length > 1 }
}
