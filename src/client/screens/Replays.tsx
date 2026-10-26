import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { parseReplay } from '../../shared/replay.ts'
import { navigate } from '../app/navigation.ts'
import { ask, toast } from '../app/render.ts'
import { deleteReplay, downloadReplay, listReplays, readReplay, saveReplay } from '../app/replays.ts'
import type { ReplaySummary } from '../app/replays.ts'
import type { Seat } from '../../shared/protocol.ts'
import { saved, store } from '../app/store.ts'
import { redraw } from '../app/render.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Select } from '../ui/Select.tsx'
import { imgUrl } from '../ui/cardview.ts'
import { RuleTags } from '../ui/rules.tsx'
import { t, tx } from '../i18n.ts'
import { duel } from './duel/state.ts'
import { duelistName } from './duel/perspective.ts'
import { frameAt, hasHands, openReplay, pauseReplay, playback, playReplay, replayProgress, scrubReplay, seekReplay, setShowHands, speedReplay, stopPlayback } from './replay/playback.ts'
import { clockText } from './replay/timing.ts'

function ReplaySide({ match, seat }: { match: ReplaySummary; seat: Seat }): JSX.Element {
  const name = duelistName(match.names, seat)
  const decks = match.decks?.filter((d) => d.seat === seat).map((d) => tx(d.name)).join(' · ')
  const art = match.art?.[seat]
  const won = match.winner === seat
  return (
    <div class={`replay-side${won ? ' won' : ''}`}>
      <span class="replay-art" aria-hidden="true"><Icon name="deck" />{art != null && <img src={imgUrl(art)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.hidden = true }} />}</span>
      <div class="replay-duelist">
        <h2><span title={name}>{name}</span>{won && <span class="replay-victor" role="img" aria-label={t('replay.winner')} title={t('replay.winner')}><Icon name="check" /></span>}</h2>
        <p class={!decks ? 'replay-deck-unknown' : ''} title={decks || t('replay.legacyDeck')}><Icon name="deck" /><span>{decks || t('replay.unknownDeck')}</span></p>
      </div>
    </div>
  )
}

export function ReplayLibrary({ active }: { active: boolean }): JSX.Element {
  const [matches, setMatches] = useState<ReplaySummary[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!active) return
    let current = true
    setLoading(true)
    void listReplays().then((items) => { if (current) { setMatches(items); setError(false); items.forEach((m) => store.replaySavedIds.add(m.id)) } }).catch(() => { if (current) setError(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [active, store.replayRevision])
  const read = async (id: string, download = false): Promise<void> => {
    try { const match = await readReplay(id); if (!match) throw new Error('Archive missing'); if (download) downloadReplay(match); else if (store.screen === 'replays') openReplay(match) }
    catch { toast(t('replay.openFailed')) }
  }
  const importFile = async (input: HTMLInputElement): Promise<void> => {
    const selected = input.files?.[0]
    input.value = ''
    if (!selected) return
    try {
      if (selected.size > 50_000_000) throw new Error('Archive too large')
      const match = parseReplay(await selected.text())
      if (!match) return toast(t('replay.invalidFile'))
      await saveReplay(match)
      toast(t('replay.imported'))
    } catch { toast(t('replay.saveFailed')) }
  }
  const visible = matches.filter((m) => [...m.names.map(tx), ...(m.decks ?? []).map((d) => tx(d.name))].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return (
    <div class="screen replay-library">
      <header><IconButton icon="back" label={t('common.back')} onClick={() => navigate('home')} /><div class="lobby-title"><small>Duelborne</small><h1>{t('replay.library')}</h1></div><Button small icon="download" onClick={() => file.current?.click()}>{t('replay.import')}</Button><input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e.currentTarget)} /></header>
      <p class="muted replay-intro">{t('replay.publicView')}</p>
      <div class="replay-library-tools"><label class="journal-search"><Icon name="search" /><input type="search" value={query} placeholder={t('replay.search')} aria-label={t('replay.search')} onInput={(e) => setQuery(e.currentTarget.value)} /></label><span class="replay-count" role="status">{t('replay.matchCount', { n: visible.length })}</span></div>
      <div class="replay-list" role="list" aria-label={t('replay.library')}>
        {loading && !matches.length && <p class="journal-empty">{t('home.loading')}</p>}
        {error && <p class="journal-empty">{t('replay.storageFailed')}</p>}
        {!loading && !error && !visible.length && <div class="replay-empty"><Icon name="history" /><h2>{t(query ? 'replay.noMatch' : 'replay.empty')}</h2><p>{t('replay.emptyHint')}</p></div>}
        {visible.map((m) => <div class="replay-item" key={m.id} role="listitem">
          <div class="replay-item-content">
            <div class="replay-item-meta"><time dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time><span>{t('duel.turn', { n: m.turns })}</span>{m.winner === 'draw' && <b>{t('duel.draw')}</b>}{m.meta && <RuleTags format={m.meta.format.id} challenge={m.meta.challenge} theme={m.meta.theme} handicap={m.meta.handicap} tournament={m.meta.tournament?.name} />}</div>
            <div class="replay-matchup"><ReplaySide match={m} seat={0} /><span class="replay-versus" aria-hidden="true">vs</span><ReplaySide match={m} seat={1} /></div>
          </div>
          <div class="replay-item-actions"><Button small variant="primary" icon="play" onClick={() => void read(m.id)}>{t('replay.watch')}</Button><IconButton icon="download" label={t('replay.export')} onClick={() => void read(m.id, true)} /><IconButton icon="trash" label={t('replay.delete')} onClick={() => ask({ title: t('replay.delete'), text: t('replay.deleteText'), run: () => { void deleteReplay(m.id).catch(() => toast(t('replay.saveFailed'))) } })} /></div>
        </div>)}
      </div>
    </div>
  )
}

/** Le lecteur peut se masquer pour voir tout le terrain ; le choix est gardé d'une relecture à l'autre. */
const player = { hidden: saved.get('replay-controls') === 'hidden' }
function togglePlayer(): void {
  player.hidden = !player.hidden
  if (player.hidden) saved.set('replay-controls', 'hidden')
  else saved.remove('replay-controls')
  redraw()
}

export function ReplayControls(): JSX.Element | null {
  const ref = useRef<HTMLElement>(null)
  const match = playback.match
  useLayoutEffect(() => {
    const root = ref.current
    if (!match || !root || player.hidden) return
    const fill = root.querySelector<HTMLElement>('.replay-timeline-fill')!
    const track = root.querySelector<HTMLElement>('.replay-timeline-track')!
    const slider = root.querySelector<HTMLInputElement>('.replay-timeline input')!
    const clock = root.querySelector<HTMLElement>('.replay-clock')!
    const total = replayProgress.total()
    const totalText = clockText(total)
    const share = (time: number): number => (total ? Math.max(0, Math.min(1, time / total)) : 1)
    const scale = (time: number): string => `scaleX(${share(time)})`
    const shift = (time: number): string => `translateX(${share(time) * 100}%)`
    let motions: Animation[] = []
    let tick = 0
    let shown = ''
    // Sous le pointeur, la valeur du curseur appartient à la main qui le tient.
    let dragging = false
    const hold = (): void => { dragging = true }
    const release = (): void => { dragging = false }
    slider.addEventListener('pointerdown', hold)
    addEventListener('pointerup', release)
    addEventListener('pointercancel', release)
    // Texte et valeur accessible : mis à jour quand la seconde affichée change.
    const label = (): void => {
      const time = replayProgress.value()
      const text = clockText(time)
      if (text !== shown) {
        shown = text
        clock.textContent = `${text} / ${totalText}`
        slider.setAttribute('aria-valuetext', t('replay.position', { time: text, total: totalText, n: frameAt(time) + 1, count: match.frames.length }))
      }
      if (!dragging) slider.value = String(time)
      if (replayProgress.moving()) tick = requestAnimationFrame(label)
    }
    // La barre et sa pastille sont des animations linéaires sur transform, jouées par le navigateur hors du script :
    // vitesse constante au sous-pixel près, même quand les animations du duel occupent la page.
    const apply = (): void => {
      for (const motion of motions) motion.cancel()
      motions = []
      const plan = replayProgress.plan()
      const now = plan?.from ?? replayProgress.value()
      fill.style.transform = scale(now)
      track.style.transform = shift(now)
      if (plan) {
        const timing: KeyframeAnimationOptions = { duration: plan.duration, easing: 'linear', fill: 'forwards' }
        motions = [fill.animate([{ transform: scale(plan.from) }, { transform: scale(plan.to) }], timing), track.animate([{ transform: shift(plan.from) }, { transform: shift(plan.to) }], timing)]
      }
      cancelAnimationFrame(tick)
      label()
    }
    apply()
    const unsubscribe = replayProgress.subscribe(apply)
    return () => {
      unsubscribe()
      for (const motion of motions) motion.cancel()
      cancelAnimationFrame(tick)
      slider.removeEventListener('pointerdown', hold)
      removeEventListener('pointerup', release)
      removeEventListener('pointercancel', release)
    }
  }, [match, playback.starts, player.hidden])
  if (!match) return null
  if (player.hidden) {
    return (
      <div class="replay-handle">
        <IconButton icon="back" label={t('replay.back')} act="replay-back" onClick={() => stopPlayback()} />
        <IconButton icon={playback.playing ? 'pause' : 'play'} class="primary" label={t(playback.playing ? 'replay.pause' : 'replay.play')} act="replay-toggle-play" disabled={!playback.playing && duel.busy} onClick={() => playback.playing ? pauseReplay() : void playReplay()} />
        <IconButton icon="up" label={t('replay.showPlayer')} act="replay-show" onClick={togglePlayer} />
      </div>
    )
  }
  const frame = match.frames[playback.index]!
  const turns = new Map<number, number>()
  match.frames.forEach((f, i) => { if (!turns.has(f.view.turn)) turns.set(f.view.turn, i) })
  return (
    <section class="replay-controls glass" aria-label={t('replay.controls')} ref={ref}>
      <div class="replay-control-top"><IconButton icon="back" label={t('replay.back')} onClick={() => stopPlayback()} /><span class="replay-label"><Icon name="history" />{t('replay.playback')}</span><b>{t('duel.turn', { n: frame.view.turn })}</b>{match.meta && <RuleTags format={match.meta.format.id} challenge={match.meta.challenge} theme={match.meta.theme} handicap={match.meta.handicap} tournament={match.meta.tournament?.name} />}<span class="replay-control-extra"><Select value={String(frame.view.turn)} title={t('replay.jumpTurn')} choices={[...turns.keys()].map((n) => ({ value: String(n), label: t('duel.turn', { n }) }))} onChange={(s) => seekReplay(turns.get(Number(s)) ?? 0)} /></span><IconButton icon="hand" class={playback.showHands && hasHands() ? 'on' : ''} label={hasHands() ? t(playback.showHands ? 'replay.hideHands' : 'replay.showHands') : t('replay.noHands')} act="replay-hands" aria-pressed={playback.showHands && hasHands()} disabled={!hasHands()} onClick={() => { setShowHands(!playback.showHands); redraw() }} /><IconButton icon="down" label={t('replay.hidePlayer')} act="replay-hide" onClick={togglePlayer} /></div>
      <div class="replay-timeline">
        <div class="replay-timeline-rail" aria-hidden="true"><span class="replay-timeline-fill" /><span class="replay-timeline-track"><span class="replay-timeline-thumb" /></span></div>
        <input type="range" min={0} max={Math.max(1, replayProgress.total())} step="any" disabled={match.frames.length < 2} value={replayProgress.value()} aria-label={t('replay.timeline')} onInput={(e) => scrubReplay(Number(e.currentTarget.value))} />
      </div>
      <div class="replay-control-bottom"><IconButton icon="first" label={t('replay.beginning')} onClick={() => seekReplay(0)} /><IconButton icon="back" label={t('replay.previous')} disabled={playback.index === 0} onClick={() => seekReplay(playback.index - 1)} /><IconButton class="primary play" icon={playback.playing ? 'pause' : 'play'} label={t(playback.playing ? 'replay.pause' : 'replay.play')} act="replay-play" disabled={!playback.playing && duel.busy} onClick={() => playback.playing ? pauseReplay() : void playReplay()} /><IconButton icon="next" label={t('replay.next')} disabled={playback.index === match.frames.length - 1} onClick={() => seekReplay(playback.index + 1)} /><Select value={String(playback.speed)} title={t('replay.speed')} choices={[.5, 1, 2, 4].map((n) => ({ value: String(n), label: `×${n}` }))} onChange={(s) => speedReplay(Number(s))} /><small class="replay-progress"><span class="replay-clock" title={t('replay.clockHint')} /><span>{t('replay.actionCount', { n: playback.index + 1, count: match.frames.length })}</span></small></div>
    </section>
  )
}
