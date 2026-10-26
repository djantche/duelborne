// Pile ou face d'avant-duel : la pièce est lancée, puis le joueur désigné choisit qui commence.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Hand, RpsInfo, Seat, TossInfo } from '../../shared/protocol.ts'
import { send } from '../app/net.ts'
import { sfx } from '../ui/audio.ts'
import { Button } from '../ui/Button.tsx'
import { cx } from '../ui/cx.ts'
import { Coin } from '../ui/Dice3D.tsx'
import { centerOf, flash, play, ring, sparks } from './duel/anim.ts'
import { clash } from './duel/clash.ts'
import { RpsCard, RpsChoices } from '../ui/rps.tsx'
import { t as tr, tx } from '../i18n.ts'

/** Durée du lancer : le résultat et les boutons n'apparaissent qu'ensuite. */
const SPIN_MS = 2300

/** Instants du lancer, hauteur (en diamètres de pièce au-dessus de la table) et part des tours restants à faire. */
const T = [0, 0.14, 0.36, 0.52, 0.64, 0.74, 0.84, 0.92, 1]
const UP = [0, 1.3, 2.7, 0, 0.8, 0, 0.28, 0, 0]
const SPIN = [1, 0.9, 0.55, 0.3, 0.18, 0.08, 0.04, 0.01, 0]
const WOBBLE = [0, 8, 12, -16, 9, -7, 4, -2, 0]

/**
 * Lance la pièce en l'air : elle monte en tournant, retombe sur la table, rebondit deux fois en perdant sa vitesse et se
 * stabilise sur le côté tiré par le serveur. L'ombre reste sur la table et rétrécit avec la hauteur.
 */
function toss(root: HTMLElement, heads: boolean, size: number): void {
  const fly = root.querySelector<HTMLElement>('.toss-fly') as HTMLElement
  const shade = root.querySelector<HTMLElement>('.toss-shade') as HTMLElement
  const body = root.querySelector<HTMLElement>('.coin-body') as HTMLElement
  const turns = 360 * 7
  const ease = (k: number): string => ((UP[k + 1] ?? 0) < (UP[k] ?? 0) ? 'cubic-bezier(.5,0,.95,.6)' : 'cubic-bezier(.1,.5,.4,1)')
  void play(fly, T.map((t, k) => ({ offset: t, transform: `translateY(${-(UP[k] as number) * size}px) scale(${1 + (UP[k] as number) * 0.16})`, easing: ease(k) })), { duration: SPIN_MS, fill: 'both' })
  void play(shade, T.map((t, k) => ({ offset: t, transform: `scale(${1 / (1 + (UP[k] as number) * 0.6)})`, opacity: Math.max(0.15, 0.85 - (UP[k] as number) * 0.25), easing: ease(k) })), { duration: SPIN_MS, fill: 'both' })
  void play(body, T.map((t, k) => ({ offset: t, transform: `rotateY(${(WOBBLE[k] as number) * (SPIN[k] as number) * 1.5 - 8 * (1 - (SPIN[k] as number))}deg) rotateX(${(heads ? 0 : 180) + turns * (SPIN[k] as number)}deg)`, easing: 'linear' })), { duration: SPIN_MS, fill: 'both' })
  sfx('coinflip', { gap: 0 })
  // Chaque contact avec la table : un petit choc, plus fort au premier.
  for (const [k, power] of [[3, 1], [5, 0.6], [7, 0.3]] as const) {
    setTimeout(() => {
      const c = centerOf(shade.getBoundingClientRect())
      ring(c, 'rgba(255,255,255,.6)', size * (1.1 + power * 0.9), 360)
      if (power === 1) sparks(c, '#ffe9a8', 10, 0.7)
    }, SPIN_MS * (T[k] as number))
  }
  // Arrêtée : un éclat sur le côté gagnant.
  setTimeout(() => {
    const c = centerOf(fly.getBoundingClientRect())
    flash(c, '#fff3c4', size * 2.4, 460)
    sparks(c, '#ffd24a', 14, 0.9)
  }, SPIN_MS)
}

function Outcome({ t }: { t: TossInfo }): JSX.Element {
  const side = t.winner === 0 ? tr('toss.heads') : tr('toss.tails')
  if (t.first !== null) return <p class="toss-first">{t.first === t.you ? tr('toss.youStart') : tr('toss.starts', { name: tx(t.names[t.first] ?? '') })}.</p>
  if (!t.choose) {
    return (
      <p>
        {tr('toss.chooses', { side, name: tx(t.chooser) })}
      </p>
    )
  }
  return (
    <>
      <p>
        {tr('toss.youWin', { side })}
      </p>
      <div class="panel-row">
        <Button variant="primary" act="toss" data-first="1" onClick={() => send({ t: 'toss', first: true })}>
          {tr('toss.iStart')}
        </Button>
        <Button act="toss" data-first="0" onClick={() => send({ t: 'toss', first: false })}>
          {tr('toss.iSecond')}
        </Button>
      </div>
      <small class="muted">{tr('toss.timeout', { n: Math.round(t.ms / 5000) * 5 || 20 })}</small>
    </>
  )
}

function CoinToss({ t }: { t: TossInfo }): JSX.Element {
  const [landed, setLanded] = useState(false)
  const coin = useRef<HTMLDivElement>(null)
  const size = Math.round(Math.max(74, Math.min(130, innerHeight * 0.22)))
  useEffect(() => {
    if (coin.current) toss(coin.current, t.winner === 1, size)
    const timer = setTimeout(() => setLanded(true), SPIN_MS + 200)
    return () => clearTimeout(timer)
  }, [])
  const side = (seat: 0 | 1, label: string): JSX.Element => (
    <span class={cx('toss-side', seat === t.you ? 'me' : 'foe', seat === t.winner && 'won')}>
      <small>{label}</small>
      <b>{tx(t.names[seat] ?? '')}</b>
    </span>
  )
  return (
    <div class={cx('toss', landed && 'landed')}>
      <div class="toss-in glass">
        <h2>{tr('toss.title')}</h2>
        <div class="toss-table">
          {side(0, tr('toss.heads'))}
          <div class="toss-coin" ref={coin} style={`--s:${size}px`}>
            <span class="toss-shade" />
            <div class="toss-fly">
              <Coin heads={t.winner === 1} />
            </div>
          </div>
          {side(1, tr('toss.tails'))}
        </div>
        <div class="toss-result">
          <Outcome t={t} />
        </div>
      </div>
    </div>
  )
}

/** Qui commence, une fois la manche gagnée : le gagnant choisit (comme après le pile ou face), ou son choix est annoncé. */
function RpsVerdict({ t }: { t: TossInfo }): JSX.Element {
  if (t.first !== null) return <p class="toss-first">{t.first === t.you ? tr('toss.youStart') : tr('toss.starts', { name: tx(t.names[t.first] ?? '') })}.</p>
  if (!t.choose) return <p>{tr('rps.foeWins', { name: tx(t.chooser) })}</p>
  return (
    <>
      <p>
        <b>{tr('rps.youWin')}</b>
      </p>
      <div class="panel-row">
        <Button variant="primary" act="toss" data-first="1" onClick={() => send({ t: 'toss', first: true })}>
          {tr('toss.iStart')}
        </Button>
        <Button act="toss" data-first="0" onClick={() => send({ t: 'toss', first: false })}>
          {tr('toss.iSecond')}
        </Button>
      </div>
      <small class="muted">{tr('toss.timeout', { n: Math.round(t.ms / 5000) * 5 || 20 })}</small>
    </>
  )
}

/**
 * Pierre-feuille-ciseaux d'avant-duel : on pose une carte face cachée, les deux se retournent ensemble, s'entrechoquent,
 * et la perdante est détruite. Une égalité rejoue la manche ; le gagnant choisit ensuite qui commence.
 */
function RpsToss({ t }: { t: TossInfo }): JSX.Element {
  const r = t.rps as RpsInfo
  const foe: Seat = t.you === 0 ? 1 : 0
  const stage = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ round: number; hand: Hand } | null>(null)
  /** Manche dont l'entrechoc est terminé (on peut alors dire qui a gagné). */
  const [done, setDone] = useState(0)
  const played = useRef(0)
  const mine = pick?.round === r.round ? pick.hand : null

  useEffect(() => {
    if (r.phase !== 'reveal' || !r.picks || played.current === r.round) return
    played.current = r.round
    const a = stage.current?.querySelector<HTMLElement>('.rps-card[data-side="me"]')
    const b = stage.current?.querySelector<HTMLElement>('.rps-card[data-side="foe"]')
    if (!a || !b) return
    const round = r.round
    const outcome = r.outcome === 'draw' ? 'draw' : r.outcome === t.you ? 'a' : 'b'
    void clash(a, b, { outcome, flipA: !r.plays, flipB: true, drawText: tr('rps.drawStamp'), shaker: stage.current }).then(() => setDone(round))
  }, [r.phase, r.round])

  const choose = (hand: Hand): void => {
    if (!r.plays || r.picked || r.phase !== 'pick') return
    sfx('cardpick')
    setPick({ round: r.round, hand })
    send({ t: 'rps', hand })
  }

  const myHand = r.picks ? r.picks[t.you] : mine
  const foeHand = r.picks ? r.picks[foe] : null
  const decided = r.phase === 'won' && r.outcome !== 'draw'
  const iWon = r.outcome === t.you
  const read = r.phase === 'won' || done === r.round
  const foeName = tx(t.names[foe] ?? '')
  const who = (seat: Seat, label: string, cls: string): JSX.Element => (
    <div class="who">
      <small>{label}</small>
      <b class={cls}>{tx(t.names[seat] ?? '')}</b>
    </div>
  )

  let status: JSX.Element
  if (r.phase === 'pick') status = <p>{!r.plays ? tr('rps.mate', { name: tx(t.names[t.you] ?? '') }) : r.picked ? tr('rps.picked', { name: foeName }) : tr('rps.pick')}</p>
  else if (r.phase === 'reveal') status = read ? <p><b>{r.outcome === 'draw' ? tr('rps.draw') : ''}</b></p> : <p class="muted">{tr('rps.reveal')}</p>
  else status = <RpsVerdict t={t} />

  return (
    <div class="toss">
      <div class="toss-in rps-in glass">
        <h2>{tr('rps.title')}</h2>
        <span class="rps-round">{tr('rps.round', { n: r.round })}</span>
        <div class="rps-table" ref={stage}>
          <div class={cx('rps-slot', 'me')}>
            <RpsCard key={`me${r.round}`} hand={myHand} up={r.phase === 'won' || (r.plays && myHand !== null)} side="me" class={cx(decided && iWon && 'winner', decided && !iWon && 'lost')} />
            {who(t.you, tr('rps.you'), 'me')}
          </div>
          <span class="rps-vs">VS</span>
          <div class={cx('rps-slot', 'foe', r.phase === 'pick' && !r.foePicked && 'thinking')}>
            <RpsCard key={`foe${r.round}`} hand={foeHand} up={r.phase === 'won'} side="foe" class={cx(decided && !iWon && 'winner', decided && iWon && 'lost')} />
            {who(foe, tr('rps.opponent'), 'foe')}
          </div>
        </div>
        {r.phase === 'pick' && r.plays && <RpsChoices onPick={choose} picked={r.picked ? mine : null} disabled={r.picked} />}
        <div class="rps-status">{status}</div>
      </div>
    </div>
  )
}

export function Toss({ t }: { t: TossInfo }): JSX.Element {
  return t.kind === 'rps' && t.rps ? <RpsToss t={t} /> : <CoinToss t={t} />
}
