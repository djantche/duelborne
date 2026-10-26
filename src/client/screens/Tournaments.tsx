// Tournois privés entre amis : créer, rejoindre avec un code, suivre le tableau et lancer son match.
// Le serveur choisit les appariements et ne retient que le résultat des duels joués ici ; l'organisateur peut seulement déclarer un forfait.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { TOURNAMENT_MIN_PLAYERS } from '../../shared/tournament.ts'
import type { MatchSide, TournamentMode, TournamentMatchView, TournamentSummary, TournamentView } from '../../shared/tournament.ts'
import { api } from '../app/api.ts'
import { send } from '../app/net.ts'
import { navigate } from '../app/navigation.ts'
import { ask, toast } from '../app/render.ts'
import { store } from '../app/store.ts'
import { guestStorageAvailable } from '../app/guest.ts'
import { callTournament as call, closeCreateTournament, openCreateTournament, selectTournament, tournamentPage, openTournaments, type TournamentReply as Reply } from '../app/tournaments.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { cx } from '../ui/cx.ts'
import { Icon } from '../ui/Icon.tsx'
import { FormatBadge, FormatNotes, RuleTags } from '../ui/rules.tsx'
import { Bracket, roundName } from './tournaments/Bracket.tsx'
import { CreateBack, CreatePage } from './tournaments/CreatePage.tsx'
import { Crosstable, Podium, Standings } from './tournaments/Tables.tsx'
import { DeckChoice, defaultDeck } from './tournaments/decks.tsx'
import { WatchMatch } from './tournaments/WatchMatch.tsx'
import { TournamentFinish } from './tournaments/Finish.tsx'
import { t, tx } from '../i18n.ts'

/** Rechargement de secours si une notification a été manquée. */
const REFRESH_MS = 12_000

/** Charge une ressource, la recharge quand une notification arrive et de temps en temps. */
function useResource<T>(path: string | null, active: boolean): { data: T | null; missing: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [missing, setMissing] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active || !path) return
    let current = true
    void api<T>(path)
      .then((r) => {
        if (!current) return
        setMissing(r.status === 404)
        if (r.ok && r.body) setData(r.body)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [path, active, tick, store.tournamentRevision, store.user?.id])
  useEffect(() => {
    if (!active || !path) return
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(timer)
  }, [path, active])
  return { data, missing, reload: () => setTick((n) => n + 1) }
}

// ───────────────────────────── Rejoindre avec un code ─────────────────────────────

/** Rejoindre le tournoi d'un ami : un petit formulaire dans la page, sans fenêtre. */
function JoinPanel({ onJoined }: { onJoined: (id: string) => void }): JSX.Element {
  const [code, setCode] = useState('')
  const [deck, setDeck] = useState(defaultDeck('casual'))
  const [error, setError] = useState<string | null>(null)
  const submit = async (ev: Event): Promise<void> => {
    ev.preventDefault()
    const r = await call<Reply & { id?: string }>('/api/tournaments/join', 'POST', { code, deck })
    if (r.error || !r.body?.id) return setError(r.error)
    setCode('')
    onJoined(r.body.id)
  }
  return (
    <form class="tn-join" onSubmit={(ev) => void submit(ev)} noValidate>
      <label class="tn-join-code">
        <span>{t('tournament.code')}</span>
        <input name="tournament-code" class="tour-code-input" maxLength={12} autocomplete="off" autocapitalize="characters" spellcheck={false} placeholder="ABC123" value={code} onInput={(e) => { setCode((e.currentTarget as HTMLInputElement).value.toUpperCase()); setError(null) }} />
      </label>
      <label class="tn-join-deck">
        <span>{t('tournament.myDeck')}</span>
        <DeckChoice value={deck} onChange={setDeck} />
      </label>
      <Button variant="primary" type="submit" act="tournament-join" disabled={!code.trim() || !deck}>{t('tournament.joinBtn')}</Button>
      {error && <p class="tn-error" role="alert">{error}</p>}
    </form>
  )
}

// ───────────────────────────── Liste ─────────────────────────────

function StateBadge({ state }: { state: TournamentSummary['state'] }): JSX.Element {
  return <span class={cx('tn-state', `st-${state}`)}>{t(`tournament.state.${state}`)}</span>
}

const KIND_ICON = { single: 'sword', swiss: 'shuffle', robin: 'users' } as const

function Card({ s, onOpen }: { s: TournamentSummary; onOpen: () => void }): JSX.Element {
  const progress = s.state === 'finished' ? 100 : s.state === 'running' && s.rounds ? Math.round(((s.round - 1) / s.rounds) * 100) : 0
  return (
    <li class={cx('tn-card', `st-${s.state}`)}>
      <button type="button" class="tn-open" data-act="tournament-open" data-id={s.id} onClick={onOpen}>
        <span class="tn-card-head">
          <Icon name={KIND_ICON[s.kind]} />
          <b>{s.name}</b>
          <StateBadge state={s.state} />
        </span>
        <span class="tn-chips">
          <FormatBadge id={s.format} plain />
          <span class="tn-chip">{t(`tournament.kind.${s.kind}`)}</span>
          {s.bestOf > 1 && <span class="tn-chip">{t(`tournament.bestOf.${s.bestOf}`)}</span>}
          <span class="tn-chip">{t('tournament.players', { n: s.players, max: s.maxPlayers })}</span>
          {s.state === 'running' && <span class="tn-chip">{t('tournament.roundOf', { n: s.round, max: s.rounds })}</span>}
        </span>
        {s.state !== 'open' && s.state !== 'cancelled' && <span class="tn-progress" role="presentation"><i style={{ width: `${progress}%` }} /></span>}
      </button>
    </li>
  )
}

function ModeSwitch({ mode }: { mode: TournamentMode }): JSX.Element {
  return (
    <div class="tn-seg" role="group" aria-label={t('tournament.mode')}>
      {(['solo', 'friends'] as const).map((value) => (
        <button key={value} type="button" class={cx('tn-seg-btn', value === mode && 'on')} aria-pressed={value === mode} data-act={`tournament-mode-${value}`} onClick={() => openTournaments(value)}>
          <Icon name={value === 'solo' ? 'computer' : 'users'} />
          <span>{t(`tournament.mode.${value}`)}</span>
        </button>
      ))}
    </div>
  )
}

function List({ mode, active, onOpen }: { mode: TournamentMode; active: boolean; onOpen: (id: string) => void }): JSX.Element {
  const list = useResource<TournamentSummary[]>('/api/tournaments', active)
  const items = list.data?.filter((s) => (s.mode ?? 'friends') === mode)
  const running = items?.filter((s) => s.state === 'running' || s.state === 'open') ?? []
  const done = items?.filter((s) => s.state === 'finished' || s.state === 'cancelled') ?? []
  return (
    <>
      <div class="tn-actions">
        <Button variant="primary" icon="flag" act="tournament-new" onClick={openCreateTournament}>
          {t(mode === 'solo' ? 'tournament.createSolo' : 'tournament.create')}
        </Button>
      </div>
      {mode === 'friends' && <JoinPanel onJoined={onOpen} />}
      {items && items.length > 0 ? (
        <>
          {running.length > 0 && <ul class="tn-list">{running.map((s) => <Card key={s.id} s={s} onOpen={() => onOpen(s.id)} />)}</ul>}
          {done.length > 0 && (
            <section class="tn-section">
              <h3>{t('tournament.history')}</h3>
              <ul class="tn-list">{done.map((s) => <Card key={s.id} s={s} onOpen={() => onOpen(s.id)} />)}</ul>
            </section>
          )}
        </>
      ) : (
        <div class="tn-empty">
          <Icon name="flag" />
          <p>{list.data ? t(mode === 'solo' ? 'tournament.noneSolo' : 'tournament.none') : t('common.loading')}</p>
        </div>
      )}
    </>
  )
}

// ───────────────────────────── Un tournoi ─────────────────────────────

const side = (s: MatchSide | null): string => (s ? tx(s.name) : '—')

function Side({ s, won, hide }: { s: MatchSide | null; won: boolean; hide?: boolean }): JSX.Element {
  return (
    <span class={cx('tn-side', won && 'won')}>
      {!hide && s?.bot && <Icon name="computer" />}
      <span>{hide ? '' : side(s)}</span>
    </span>
  )
}

function MatchRow({ m, view, onForfeit }: { m: TournamentMatchView; view: TournamentView; onForfeit: (m: TournamentMatchView, loser: MatchSide) => void }): JSX.Element {
  const winner = m.winner
  const bye = m.result === 'bye'
  const botDuel = view.mode === 'solo' && !!m.a?.bot && !!m.b?.bot
  const playing = !!m.watchable || botDuel && m.state === 'ready' && view.botMatch === m.id
  const series = view.bestOf > 1 && !bye && m.state !== 'waiting'
  return (
    <li class={cx('tn-match', m.state, m.mine && 'mine', playing && 'playing')}>
      <div class="tn-versus">
        <Side s={m.a} won={!!winner && winner === m.a?.userId} />
        <i>{bye ? t('tournament.bye') : series ? <b class="tn-score">{m.scoreA}–{m.scoreB}</b> : 'vs'}</i>
        <Side s={m.b} won={!!winner && winner === m.b?.userId} hide={bye} />
      </div>
      <em class="tn-status">
        {playing && <span class="tn-spin" aria-hidden="true" />}
        {m.state === 'waiting' && t('tournament.waiting')}
        {m.state === 'ready' && (playing ? t('tournament.matchPlaying') : botDuel ? t('tournament.botQueued') : m.draws ? t('tournament.replay', { n: m.draws }) : m.scoreA + m.scoreB > 0 ? t('tournament.seriesOngoing') : t('tournament.toPlay'))}
        {m.state === 'done' && (m.result === 'draw' ? t('tournament.drawResult') : m.result === 'forfeit' ? t('tournament.forfeitResult') : bye ? '' : t('tournament.wonBy', { name: winner === m.a?.userId ? side(m.a) : side(m.b) }))}
      </em>
      <WatchMatch match={m} tournament={view.id} />
      {view.owner && view.mode !== 'solo' && m.state === 'ready' && m.a && m.b && view.state === 'running' && (
        <span class="tn-forfeit">
          {[m.a, m.b].map((p) => (
            <Button key={p.userId} small act="tournament-forfeit" data-user={p.userId} onClick={() => onForfeit(m, p)}>
              {t('tournament.forfeit', { name: tx(p.name) })}
            </Button>
          ))}
        </span>
      )}
    </li>
  )
}

function Rounds({ view, onForfeit }: { view: TournamentView; onForfeit: (m: TournamentMatchView, loser: MatchSide) => void }): JSX.Element {
  const rounds = [...new Set(view.matches.map((m) => m.round))].sort((a, b) => a - b)
  return (
    <>
      {rounds.map((r) => {
        const list = view.matches.filter((m) => m.round === r)
        const open = list.some((m) => m.state !== 'done') || r === rounds[rounds.length - 1]
        return (
          <details key={r} class="tn-round" open={open}>
            <summary>
              <h4>{t('tournament.round', { n: r })}</h4>
              <span class="tn-chip">{list.filter((m) => m.state === 'done').length}/{list.length}</span>
              <Icon name="down" />
            </summary>
            <ul>{list.map((m) => <MatchRow key={m.id} m={m} view={view} onForfeit={onForfeit} />)}</ul>
          </details>
        )
      })}
    </>
  )
}

function Detail({ id, active, onBack }: { id: string; active: boolean; onBack: () => void }): JSX.Element {
  const res = useResource<TournamentView>(`/api/tournaments/${encodeURIComponent(id)}`, active)
  const v = res.data
  const [deck, setDeck] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const seeded = useRef(false)
  const current = useRef(active)
  useEffect(() => { current.current = active; return () => { current.current = false } }, [active])
  useEffect(() => {
    if (!v || seeded.current) return
    seeded.current = true
    setDeck(defaultDeck(v.format))
  }, [v])
  // Un tournoi mémorisé qui n'existe plus (supprimé, autre compte) : on revient à la liste au lieu de rester sur une page vide.
  useEffect(() => {
    if (!res.missing || !active) return
    toast(t('tournament.noSuch'))
    onBack()
  }, [res.missing, active])
  if (res.missing) return <p class="muted tn-loading">{t('common.loading')}</p>
  if (!v) return <p class="muted tn-loading">{t('common.loading')}</p>

  const run = async (path: string, method = 'POST', json?: unknown): Promise<void> => {
    const r = await call(`/api/tournaments/${encodeURIComponent(id)}${path}`, method, json)
    if (!current.current) return
    setMessage(r.error)
    res.reload()
  }
  const copyCode = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(v.code)
      toast(t('tournament.codeCopied'))
    } catch {
      toast(v.code)
    }
  }
  const forfeit = (m: TournamentMatchView, loser: MatchSide): void =>
    ask({ title: t('tournament.forfeitTitle'), text: t('tournament.forfeitText', { name: tx(loser.name) }), ok: t('tournament.forfeitBtn'), run: () => void run('/forfeit', 'POST', { match: m.id, user: loser.userId }) })
  const cancel = (): void =>
    ask({
      title: t(v.state === 'running' ? 'tournament.cancelTitle' : 'tournament.deleteTitle'),
      text: t(v.state === 'running' ? 'tournament.cancelText' : 'tournament.deleteText'),
      ok: t(v.state === 'running' ? 'tournament.cancelBtn' : 'tournament.deleteBtn'),
      run: () =>
        void call(`/api/tournaments/${encodeURIComponent(id)}`, 'DELETE').then((r) => {
          if (!current.current) return
          if (r.error) return setMessage(r.error)
          if (v.state === 'running') res.reload()
          else onBack()
        }),
    })

  const mine = v.matches.filter((m) => m.mine && m.state === 'ready' && m.a && m.b)
  const inTournament = !!v.me
  const solo = v.mode === 'solo'
  const eliminated = inTournament && v.kind === 'single' && !v.playerList.find((p) => p.userId === v.me?.userId)?.alive
  const running = v.state === 'running'
  const played = v.me ? v.matches.filter((m) => m.mine && m.state === 'done' && m.result !== 'bye').length : 0
  return (
    <div class="tn-detail">
      <div class="tn-head">
        <div class="tn-title">
          <h2>{v.name}</h2>
          <RuleTags format={v.format} challenge={v.settings.challenge} theme={v.settings.theme} handicap={v.settings.handicap} />
          <p class="muted">
            {t(`tournament.kind.${v.kind}`)}{v.bestOf > 1 ? ` · ${t(`tournament.bestOf.${v.bestOf}`)}` : ''} · {t('tournament.players', { n: v.players, max: v.maxPlayers })}
            {running ? ` · ${t('tournament.roundOf', { n: v.round, max: v.rounds })}` : ''}
          </p>
        </div>
        <StateBadge state={v.state} />
        {!solo && <button type="button" class="tn-code" data-act="tournament-code" aria-label={t('tournament.copyCode')} onClick={() => void copyCode()}>
          <small>{t('tournament.code')}</small>
          <b>{v.code}</b>
        </button>}
      </div>
      <FormatNotes id={v.format} />
      {message && <p class="tn-error" role="alert">{message}</p>}

      {v.state === 'finished' && v.champion && (
        <section class="tn-finish">
          <TournamentFinish view={v} active={active} />
          <p class="tn-champion" role="status"><Icon name="flag" /> {t('tournament.champion', { name: tx(v.champion.name) })}</p>
          <Podium view={v} />
        </section>
      )}
      {v.state === 'cancelled' && <p class="muted">{t('tournament.cancelled')}</p>}

      {mine.length > 0 && (
        <div class="tn-mine-list">
          {mine.map((myMatch) => {
            const foe = myMatch.a?.userId === v.me?.userId ? myMatch.b : myMatch.a
            const youA = myMatch.a?.userId === v.me?.userId
            const score = v.bestOf > 1 ? `${youA ? myMatch.scoreA : myMatch.scoreB}–${youA ? myMatch.scoreB : myMatch.scoreA}` : ''
            return foe && (
              <div class="tn-mine" key={myMatch.id}>
                <span>
                  <small>{t('tournament.yourMatch')}{myMatch.round && v.kind !== 'robin' ? ` · ${roundNameOf(myMatch.round, v)}` : ''}</small>
                  <b>{t('tournament.against', { name: tx(foe.name) })}</b>
                </span>
                {score && <span class="tn-mine-score" title={t('tournament.seriesScore')}>{score}</span>}
                <Button variant="primary" icon="sword" act="tournament-play" onClick={() => send({ t: 'tournamentMatch', tournament: id, match: myMatch.id })}>
                  {t(myMatch.scoreA + myMatch.scoreB > 0 ? 'tournament.playNext' : 'tournament.play')}
                </Button>
              </div>
            )
          })}
        </div>
      )}
      {inTournament && running && mine.length === 0 && (
        <p class="tn-note">{t(eliminated ? 'tournament.eliminated' : played > 0 || solo ? (solo ? 'tournament.waitBots' : 'tournament.waitOthers') : 'tournament.waitOthers')}</p>
      )}
      {solo && running && v.botMatch && <p class="tn-note"><span class="tn-spin" aria-hidden="true" />{t('tournament.botsProgress')}</p>}
      {v.botError && running && (
        <div class="tn-error" role="alert">
          <p>{t('tournament.botError')}</p>
          <Button small onClick={() => void run('/resume')}>{t('tournament.retryBots')}</Button>
        </div>
      )}

      {v.state === 'open' && (
        <section class="tn-section">
          <h3>{t('tournament.registered')}</h3>
          <ul class="tn-players">
            {v.playerList.map((p) => (
              <li key={p.userId}>
                <b>{p.bot && <Icon name="computer" />} {tx(p.name)}</b>
                <small>{p.deckName}</small>
              </li>
            ))}
            {!v.playerList.length && <li class="muted">{t('tournament.nobody')}</li>}
          </ul>
          <div class="tn-actions tn-register">
            {!inTournament && (
              <>
                <DeckChoice value={deck} onChange={setDeck} />
                <Button act="tournament-enter" disabled={!deck} onClick={() => void call('/api/tournaments/join', 'POST', { code: v.code, deck }).then((r) => (setMessage(r.error), res.reload()))}>
                  {t('tournament.enter')}
                </Button>
              </>
            )}
            {inTournament && (
              <>
                <DeckChoice value={deck} onChange={setDeck} />
                <Button small act="tournament-deck" disabled={!deck} onClick={() => void run('/deck', 'POST', { deck })}>
                  {t('tournament.changeDeck')}
                </Button>
                {!solo && <Button small act="tournament-leave" onClick={() => void run('/leave')}>
                  {t('tournament.leave')}
                </Button>}
              </>
            )}
            {v.owner && (
              <Button variant="primary" act="tournament-start" disabled={v.players < TOURNAMENT_MIN_PLAYERS} onClick={() => void run('/start')}>
                {t('tournament.start')}
              </Button>
            )}
          </div>
          {v.owner && v.players < TOURNAMENT_MIN_PLAYERS && <p class="muted">{t('tournament.needTwo')}</p>}
        </section>
      )}

      {v.state !== 'open' && v.kind === 'single' && (
        <>
          <section class="tn-section">
            <h3>{t('tournament.bracket')}</h3>
            <Bracket view={v} />
          </section>
          <section class="tn-section">
            <h3>{t('tournament.playersTitle')}</h3>
            <ul class="tn-players tn-status-list">
              {v.playerList.map((p) => (
                <li key={p.userId} class={cx(p.userId === v.me?.userId && 'me', !p.alive && 'out')}>
                  <b>{p.bot && <Icon name="computer" />} {tx(p.name)}</b>
                  <small>{p.deckName}</small>
                  <em>{p.alive ? t('tournament.inRace') : v.champion?.userId === p.userId ? t('tournament.championShort') : t('tournament.out')}</em>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {v.state !== 'open' && v.kind !== 'single' && (
        <>
          <section class="tn-section">
            <h3>{t('tournament.standings')}</h3>
            <Standings view={v} />
          </section>
          {v.kind === 'robin' && (
            <section class="tn-section">
              <h3>{t('tournament.crosstable')}</h3>
              <Crosstable view={v} />
            </section>
          )}
          <section class="tn-section">
            <h3>{t('tournament.matches')}</h3>
            <Rounds view={v} onForfeit={forfeit} />
          </section>
        </>
      )}

      {v.owner && (
        <div class="tn-actions tn-danger">
          <Button small variant="danger" act="tournament-cancel" onClick={cancel}>
            {t(running ? 'tournament.cancelBtn' : 'tournament.deleteBtn')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** « Quart de finale », « Finale »… pour l'élimination directe ; vide sinon. */
function roundNameOf(round: number, v: TournamentView): string {
  return v.kind === 'single' ? roundName(round, v.rounds) : t('tournament.round', { n: round })
}

// ───────────────────────────── Écran ─────────────────────────────

export function TournamentsScreen({ active = true }: { active?: boolean }): JSX.Element {
  const { open, mode, creating } = tournamentPage
  const show = selectTournament
  const back = (): void => (creating ? closeCreateTournament() : open ? show(null) : navigate('home'))
  return (
    <div class={cx('screen options tournaments tn-screen', creating && 'tn-creating')}>
      <header>
        {creating ? <CreateBack /> : <IconButton icon="back" label={t('common.back')} act="back" onClick={back} />}
        <div class="lobby-title">
          <small>{t(mode === 'solo' ? 'home.solo' : 'home.multi')}</small>
          <h1>{t(creating ? (mode === 'solo' ? 'tournament.newSolo' : 'tournament.new') : 'tournament.title')}</h1>
        </div>
      </header>
      <div class="tn-body">
        {!store.user && <p class="muted" role="status">{t(guestStorageAvailable() ? 'guest.tournamentsHint' : 'guest.storageUnavailable')}</p>}
        {creating ? (
          <CreatePage mode={mode} onCreated={show} />
        ) : open ? (
          <Detail key={open} id={open} active={active} onBack={() => show(null)} />
        ) : (
          <>
            <ModeSwitch mode={mode} />
            <List key={mode} mode={mode} active={active} onOpen={show} />
          </>
        )}
      </div>
    </div>
  )
}
