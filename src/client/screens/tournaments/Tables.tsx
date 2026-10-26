// Tableaux d'un tournoi : classement avec points, grille croisée du championnat, podium.
import type { JSX } from 'preact'
import type { TournamentMatchView, TournamentPlayerView, TournamentView } from '../../../shared/tournament.ts'
import { t, tx } from '../../i18n.ts'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'

type Form = 'W' | 'D' | 'L'

/** Résultats d'un joueur dans l'ordre des rondes (un exempt compte pour une victoire). */
export function formOf(view: TournamentView, userId: string): Form[] {
  const out: { round: number; slot: number; f: Form }[] = []
  for (const m of view.matches) {
    if (m.state !== 'done' || (m.a?.userId !== userId && m.b?.userId !== userId)) continue
    const f: Form = m.result === 'draw' ? 'D' : m.winner === userId ? 'W' : 'L'
    out.push({ round: m.round, slot: m.slot, f })
  }
  return out.sort((a, b) => a.round - b.round || a.slot - b.slot).map((x) => x.f)
}

function FormDots({ form }: { form: Form[] }): JSX.Element {
  return (
    <span class="tb-form" aria-label={form.map((f) => t(`tournament.form.${f}`)).join(', ')}>
      {form.slice(-6).map((f, i) => <i key={i} class={f} title={t(`tournament.form.${f}`)} />)}
    </span>
  )
}

function Who({ p }: { p: TournamentPlayerView }): JSX.Element {
  return (
    <span class="tb-who">
      <span class="tb-name">{p.bot && <Icon name="computer" />}<b>{tx(p.name)}</b></span>
      <small>{p.deckName}</small>
    </span>
  )
}

/** Classement d'une ronde suisse ou d'un championnat : rang, points, bilan, départage et forme. */
export function Standings({ view }: { view: TournamentView }): JSX.Element {
  const swiss = view.kind === 'swiss'
  const top = Math.max(1, ...view.playerList.map((p) => p.points))
  return (
    <div class="tb-wrap">
      <table class="tb-table">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>{t('tournament.player')}</th>
            <th class="num" title={t('tournament.pointsTip')}>{t('tournament.pts')}</th>
            <th class="num" title={t('tournament.recordTip')}>{t('tournament.record')}</th>
            {swiss && <th class="num hide-sm" title={t('tournament.tiebreakTip')}>{t('tournament.tiebreak')}</th>}
            <th class="hide-sm">{t('tournament.formTitle')}</th>
          </tr>
        </thead>
        <tbody>
          {view.playerList.map((p) => (
            <tr key={p.userId} class={cx(p.userId === view.me?.userId && 'me', p.rank === 1 && view.state === 'finished' && 'champ')}>
              <td class="num"><i class={cx('tb-rank', p.rank <= 3 && `r${p.rank}`)}>{p.rank}</i></td>
              <td><Who p={p} /></td>
              <td class="num">
                <b class="tb-pts">{p.points}</b>
                <span class="tb-bar" aria-hidden="true"><i style={{ width: `${Math.round((p.points / top) * 100)}%` }} /></span>
              </td>
              <td class="num">{p.wins}-{p.draws}-{p.losses}</td>
              {swiss && <td class="num hide-sm">{p.tiebreak}</td>}
              <td class="hide-sm"><FormDots form={formOf(view, p.userId)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellOf(view: TournamentView, row: string, col: string): { text: string; cls: string; title: string } {
  const m: TournamentMatchView | undefined = view.matches.find((x) => (x.a?.userId === row && x.b?.userId === col) || (x.a?.userId === col && x.b?.userId === row))
  if (!m) return { text: '', cls: 'none', title: '' }
  const rowIsA = m.a?.userId === row
  const mine = rowIsA ? m.scoreA : m.scoreB
  const theirs = rowIsA ? m.scoreB : m.scoreA
  const score = view.bestOf > 1 ? `${mine}–${theirs}` : ''
  if (m.state !== 'done') return { text: score || '·', cls: m.state === 'ready' ? 'todo' : 'none', title: t('tournament.toPlay') }
  if (m.result === 'draw') return { text: 'N', cls: 'draw', title: t('tournament.drawResult') }
  const won = m.winner === row
  return { text: score || (won ? 'V' : 'D'), cls: won ? 'win' : 'loss', title: won ? t('tournament.form.W') : t('tournament.form.L') }
}

/** Grille croisée d'un championnat : une ligne par joueur, une colonne par adversaire. */
export function Crosstable({ view }: { view: TournamentView }): JSX.Element {
  const players = view.playerList
  return (
    <div class="tb-wrap">
      <table class="tb-cross">
        <thead>
          <tr>
            <th />
            {players.map((p) => <th key={p.userId} class="col" title={tx(p.name)}><span>{p.bot ? 'IA ' : ''}{tx(p.name).replace(/^IA /, '').slice(0, 10)}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.userId} class={cx(row.userId === view.me?.userId && 'me')}>
              <th scope="row"><span class="tb-name">{row.bot && <Icon name="computer" />}{tx(row.name)}</span></th>
              {players.map((col) => {
                if (col.userId === row.userId) return <td key={col.userId} class="self" />
                const c = cellOf(view, row.userId, col.userId)
                return <td key={col.userId} class={c.cls} title={c.title}>{c.text}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Les trois premiers. En élimination directe : le vainqueur, le finaliste et les demi-finalistes. */
export function podiumOf(view: TournamentView): { first: TournamentPlayerView | null; second: TournamentPlayerView | null; third: TournamentPlayerView[] } {
  const byId = new Map(view.playerList.map((p) => [p.userId, p]))
  if (view.kind !== 'single') {
    const [a, b, c] = view.playerList
    return { first: a ?? null, second: b ?? null, third: c ? [c] : [] }
  }
  const final = view.matches.find((m) => m.round === view.rounds)
  const loserOf = (m: TournamentMatchView): TournamentPlayerView | null => {
    if (!m.winner || m.result === 'bye') return null
    const other = m.a?.userId === m.winner ? m.b : m.a
    return other ? (byId.get(other.userId) ?? null) : null
  }
  const semis = view.matches.filter((m) => m.round === view.rounds - 1)
  return { first: final?.winner ? (byId.get(final.winner) ?? null) : null, second: final ? loserOf(final) : null, third: semis.flatMap((m) => { const l = loserOf(m); return l ? [l] : [] }) }
}

export function Podium({ view }: { view: TournamentView }): JSX.Element | null {
  const { first, second, third } = podiumOf(view)
  if (!first) return null
  const block = (p: TournamentPlayerView | null, rank: 1 | 2 | 3): JSX.Element | null => p && (
    <div class={`pd-block r${rank}`} key={`${rank}-${p.userId}`}>
      <span class="pd-who">{p.bot && <Icon name="computer" />}<b>{tx(p.name)}</b><small>{p.deckName}</small></span>
      <i class="pd-step">{rank}</i>
    </div>
  )
  return (
    <div class="pd" role="group" aria-label={t('tournament.podium')}>
      {block(second, 2)}
      {block(first, 1)}
      {third.slice(0, 2).map((p) => block(p, 3))}
    </div>
  )
}
