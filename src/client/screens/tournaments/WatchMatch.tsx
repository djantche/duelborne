import type { JSX } from 'preact'
import type { TournamentMatchView } from '../../../shared/tournament.ts'
import { send } from '../../app/net.ts'
import { Button } from '../../ui/Button.tsx'
import { t, tx } from '../../i18n.ts'

/** La même entrée en spectateur depuis les rondes ou l'arbre du tournoi. */
export function WatchMatch({ match, tournament, compact = false }: { match: TournamentMatchView; tournament: string; compact?: boolean }): JSX.Element | null {
  if (!match.watchable || match.mine || !match.a || !match.b) return null
  const label = t('tournament.watchMatch', { a: tx(match.a.name), b: tx(match.b.name) })
  const watch = (): void => send({ t: 'tournamentMatch', tournament, match: match.id, spectate: true })
  return <Button small class={compact ? 'tn-watch compact' : 'tn-watch'} aria-label={label} title={label} act="tournament-watch" data-match={match.id} onClick={watch}>{t('tournament.watch')}</Button>
}
