// Arbre d'une élimination directe : une colonne par tour, des traits qui relient chaque match à celui où va son vainqueur.
// Les positions sont calculées (pas mesurées dans la page) : le dessin est le même partout et se redessine sans à-coup.
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { TournamentMatchView, TournamentPlayerView, TournamentView } from '../../../shared/tournament.ts'
import { t, tx } from '../../i18n.ts'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import { WatchMatch } from './WatchMatch.tsx'

const W = 224
const H = 72
const GAP = 18
const COL = 64
const HEAD = 34

/** Nom du tour, d'après le nombre de tours qu'il reste à jouer. */
export function roundName(round: number, rounds: number): string {
  const left = rounds - round
  if (left === 0) return t('tournament.final')
  if (left === 1) return t('tournament.semi')
  if (left === 2) return t('tournament.quarter')
  return t('tournament.round', { n: round })
}

interface Node {
  m: TournamentMatchView
  x: number
  y: number
}

function layout(rounds: number, byRound: Map<number, TournamentMatchView[]>): { nodes: Node[][]; height: number } {
  const nodes: Node[][] = []
  const first = byRound.get(1) ?? []
  for (let r = 1; r <= rounds; r++) {
    const list = [...(byRound.get(r) ?? [])].sort((a, b) => a.slot - b.slot)
    const x = (r - 1) * (W + COL)
    nodes.push(list.map((m, i) => {
      if (r === 1) return { m, x, y: HEAD + i * (H + GAP) }
      const a = nodes[r - 2]?.[2 * i]
      const b = nodes[r - 2]?.[2 * i + 1]
      const ya = a?.y ?? HEAD
      const yb = b?.y ?? ya
      return { m, x, y: (ya + yb) / 2 }
    }))
  }
  return { nodes, height: HEAD + first.length * (H + GAP) - GAP }
}

function Side({ player, name, score, won, lost, showScore, bye }: { player?: TournamentPlayerView; name: string | null; score: number; won: boolean; lost: boolean; showScore: boolean; bye?: boolean }): JSX.Element {
  return (
    <div class={cx('br-side', won && 'won', lost && 'lost', !name && 'empty')}>
      <i class="br-seed">{player?.seed ?? ''}</i>
      <span class="br-name">
        {player?.bot && <Icon name="computer" />}
        <span>{bye ? t('tournament.byeShort') : name ?? '—'}</span>
      </span>
      {showScore && <b class="br-score">{score}</b>}
      {won && <Icon name="check" />}
    </div>
  )
}

function MatchCard({ n, view, players }: { n: Node; view: TournamentView; players: Map<string, TournamentPlayerView> }): JSX.Element {
  const { m } = n
  const bye = m.result === 'bye'
  const series = view.bestOf > 1
  const playing = !!m.watchable || view.botMatch === m.id
  const aWon = m.state === 'done' && m.winner !== null && m.winner === m.a?.userId
  const bWon = m.state === 'done' && m.winner !== null && m.winner === m.b?.userId
  const label = m.state === 'done' ? (m.result === 'forfeit' ? t('tournament.forfeitResult') : bye ? t('tournament.bye') : '') : m.state === 'ready' ? (playing ? t('tournament.matchPlaying') : m.mine ? t('tournament.toPlay') : '') : ''
  return (
    <div class={cx('br-match', m.state, m.mine && 'mine', playing && 'playing', bye && 'bye', m.watchable && !m.mine && 'watchable')} style={{ left: `${n.x}px`, top: `${n.y}px`, width: `${W}px`, height: `${H}px` }} data-match={m.id} data-mine={m.mine ? '' : undefined}>
      <Side player={m.a ? players.get(m.a.userId) : undefined} name={m.a ? tx(m.a.name) : null} score={m.scoreA} won={aWon} lost={bWon} showScore={series && m.state !== 'waiting' && !bye} />
      <Side player={m.b ? players.get(m.b.userId) : undefined} name={m.b ? tx(m.b.name) : null} score={m.scoreB} won={bWon} lost={aWon} showScore={series && m.state !== 'waiting' && !bye} bye={bye} />
      {label && <em class="br-state">{playing && <span class="tn-spin" aria-hidden="true" />}{label}</em>}
      <WatchMatch match={m} tournament={view.id} compact />
    </div>
  )
}

export function Bracket({ view }: { view: TournamentView }): JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const byRound = new Map<number, TournamentMatchView[]>()
  for (const m of view.matches) byRound.set(m.round, [...(byRound.get(m.round) ?? []), m])
  const rounds = view.rounds || Math.max(...byRound.keys(), 1)
  const { nodes, height } = layout(rounds, byRound)
  const width = rounds * W + (rounds - 1) * COL
  const players = new Map(view.playerList.map((p) => [p.userId, p]))
  const paths: JSX.Element[] = []
  nodes.forEach((column, r) => {
    if (r === 0) return
    column.forEach((target, i) => {
      for (const k of [0, 1]) {
        const feeder = nodes[r - 1]?.[2 * i + k]
        if (!feeder) continue
        const x1 = feeder.x + W
        const y1 = feeder.y + H / 2
        const x2 = target.x
        const y2 = target.y + H / 2
        const mid = x1 + COL / 2
        const done = feeder.m.state === 'done' && feeder.m.winner !== null
        paths.push(<path key={`${r}-${i}-${k}`} d={`M${x1} ${y1}H${mid}V${y2}H${x2}`} class={cx('br-line', done && 'done')} />)
      }
    })
  })
  // Au premier affichage, on amène son propre match (ou le dernier tour joué) dans la vue.
  const mineKey = view.me?.matchId ?? ''
  useEffect(() => {
    const el = scroller.current
    const mine = el?.querySelector<HTMLElement>('[data-mine]')
    if (!el || !mine) return
    el.scrollLeft = Math.max(0, mine.offsetLeft - (el.clientWidth - W) / 2)
  }, [mineKey])
  return (
    <div class="br-scroll" ref={scroller} role="group" aria-label={t('tournament.bracket')}>
      <div class="br-canvas" style={{ width: `${width}px`, height: `${height}px` }}>
        {nodes.map((_, r) => (
          <h4 key={r} class="br-head" style={{ left: `${r * (W + COL)}px`, width: `${W}px` }}>{roundName(r + 1, rounds)}</h4>
        ))}
        <svg class="br-lines" width={width} height={height} aria-hidden="true">{paths}</svg>
        {nodes.flat().map((n) => <MatchCard key={n.m.id} n={n} view={view} players={players} />)}
      </div>
    </div>
  )
}
