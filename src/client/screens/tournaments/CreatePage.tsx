// Création d'un tournoi : une vraie page (et non une fenêtre) en sections, avec un récapitulatif qui dit ce que le tournoi va demander.
// Le brouillon est gardé quand on change de page (app/tournaments.ts).
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { AI_LEVELS, SETTING_CHOICES } from '../../../shared/protocol.ts'
import type { AiLevel } from '../../../shared/protocol.ts'
import { BEST_OF_CHOICES, ROBIN_MAX, SOLO_ROBIN_MAX, SOLO_TOURNAMENT_SIZES, TOURNAMENT_KINDS, matchCountOf, maxGamesPerPlayer, roundCountOf } from '../../../shared/tournament.ts'
import type { BestOf, TournamentKind, TournamentMode, TournamentSettings } from '../../../shared/tournament.ts'
import { callTournament, closeCreateTournament, newDraft, tournamentPage } from '../../app/tournaments.ts'
import type { TournamentDraft, TournamentReply } from '../../app/tournaments.ts'
import { redraw } from '../../app/render.ts'
import { t } from '../../i18n.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import { Select } from '../../ui/Select.tsx'
import { ChallengeSelect, FormatNotes, FormatSelect, HandicapSelect, ThemeSelect, challengeText } from '../../ui/rules.tsx'
import { DeckChoice, defaultDeck } from './decks.tsx'

/** Petit schéma de chaque formule. */
function KindGlyph({ kind }: { kind: TournamentKind }): JSX.Element {
  if (kind === 'single') {
    return (
      <svg viewBox="0 0 64 40" class="cr-glyph" aria-hidden="true">
        <path d="M4 6h14v8H4zM4 26h14v8H4zM28 14h14v8H28zM50 14h12v8H50z M18 10h5v8h5M18 30h5v-8h5M42 18h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      </svg>
    )
  }
  if (kind === 'swiss') {
    return (
      <svg viewBox="0 0 64 40" class="cr-glyph" aria-hidden="true">
        <path d="M6 8h18M6 20h18M6 32h18M40 8h18M40 20h18M40 32h18M24 8l16 12M24 20l16-12M24 20l16 12M24 32l16-12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 64 40" class="cr-glyph" aria-hidden="true">
      <path d="M8 6h48v28H8zM8 15h48M8 25h48M20 6v28M32 6v28M44 6v28" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    </svg>
  )
}

function Section({ icon, title, hint, children }: { icon: 'flag' | 'users' | 'deck' | 'gear' | 'sword'; title: string; hint?: string; children: ComponentChildren }): JSX.Element {
  return (
    <section class="cr-card">
      <header>
        <Icon name={icon} />
        <h2>{title}</h2>
      </header>
      {hint && <p class="cr-hint">{hint}</p>}
      {children}
    </section>
  )
}

function Chips({ value, values, label, onChange, disabled }: { value: number; values: readonly number[]; label: (n: number) => string; onChange: (n: number) => void; disabled?: (n: number) => boolean }): JSX.Element {
  return (
    <div class="cr-chips" role="radiogroup">
      {values.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} class={cx('cr-chip', value === n && 'on')} disabled={disabled?.(n)} onClick={() => onChange(n)}>
          {label(n)}
        </button>
      ))}
    </div>
  )
}

export function CreatePage({ mode, onCreated }: { mode: TournamentMode; onCreated: (id: string) => void }): JSX.Element {
  const solo = mode === 'solo'
  const draft: TournamentDraft = (tournamentPage.draft ??= newDraft(mode))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  // Le deck proposé est celui qu'on utilise d'habitude dans ce format.
  useEffect(() => { if (!draft.deck) { draft.deck = defaultDeck(draft.format); redraw() } }, [])
  const set = <K extends keyof TournamentDraft>(key: K, value: TournamentDraft[K]): void => { draft[key] = value; setError(null); redraw() }

  const sizes: readonly number[] = solo ? SOLO_TOURNAMENT_SIZES : [2, 3, 4, 6, 8, 12, 16, 32]
  const robinMax = solo ? SOLO_ROBIN_MAX : ROBIN_MAX
  const sizeOk = (n: number): boolean => draft.kind !== 'robin' || n <= robinMax
  // Un changement de formule qui rend la taille impossible la ramène à la plus grande permise.
  const chooseKind = (kind: TournamentKind): void => {
    draft.kind = kind
    if (kind === 'robin' && draft.size > robinMax) draft.size = [...sizes].filter((n) => n <= robinMax).at(-1) ?? 4
    redraw()
  }

  const rounds = roundCountOf(draft.kind, draft.size)
  const matches = matchCountOf(draft.kind, draft.size)
  const games = maxGamesPerPlayer(draft.kind, draft.size, draft.bestOf)
  const botDuels = solo ? Math.max(0, matches - (draft.kind === 'single' ? roundCountOf('single', draft.size) : draft.kind === 'robin' ? draft.size - 1 : roundCountOf('swiss', draft.size))) * draft.bestOf : 0

  const submit = async (ev: Event): Promise<void> => {
    ev.preventDefault()
    if (busy) return
    if (draft.name.trim().length < 2) return setError(t('tournament.badName'))
    if (!draft.deck) return setError(t('tournament.pickDeck'))
    setBusy(true)
    setError(null)
    const settings: Partial<TournamentSettings> = { turnTime: draft.turnTime, startLp: draft.startLp, startHand: draft.startHand, drawPerTurn: draft.drawPerTurn, challenge: draft.challenge, handicap: draft.handicap, theme: draft.theme }
    const body = { name: draft.name, kind: draft.kind, mode, format: draft.format, maxPlayers: draft.size, bestOf: draft.bestOf, settings, ...(solo ? { deck: draft.deck, aiLevel: draft.aiLevel, aiDeck: draft.aiDeck } : {}) }
    const r = await callTournament<TournamentReply & { id?: string }>('/api/tournaments', 'POST', body)
    if (!alive.current) return
    setBusy(false)
    if (r.error || !r.body?.id) return setError(r.error ?? t('auth.failed'))
    tournamentPage.draft = null
    onCreated(r.body.id)
  }

  const numeric = (label: string, value: number, key: 'turnTime' | 'startLp' | 'startHand' | 'drawPerTurn', values: readonly number[], text: (n: number) => string): JSX.Element => (
    <label class="cr-field"><span>{label}</span><Select value={String(value)} disabled={busy} onChange={(v) => set(key, Number(v))} choices={values.map((v) => ({ value: String(v), label: text(v) }))} /></label>
  )

  return (
    <form class="cr" onSubmit={(ev) => void submit(ev)} noValidate>
      <div class="cr-main">
        <Section icon="flag" title={t('tournament.sectionName')}>
          <label class="cr-field">
            <input class="cr-name" name="tournament-name" maxLength={40} autocomplete="off" placeholder={t('tournament.namePlaceholder')} aria-label={t('tournament.name')} disabled={busy} value={draft.name} onInput={(e) => set('name', e.currentTarget.value)} />
          </label>
        </Section>

        <Section icon="sword" title={t('tournament.sectionFormula')} hint={solo ? t('tournament.soloHint') : undefined}>
          <div class="cr-kinds" role="radiogroup" aria-label={t('tournament.kind')}>
            {TOURNAMENT_KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={draft.kind === k} class={cx('cr-kind', draft.kind === k && 'on')} data-act={`kind-${k}`} onClick={() => chooseKind(k)}>
                <KindGlyph kind={k} />
                <b>{t(`tournament.kind.${k}`)}</b>
                <small>{t(`tournament.kind.${k}.text`)}</small>
              </button>
            ))}
          </div>
          <div class="cr-row">
            <span class="cr-label">{t('tournament.bestOf')}</span>
            <Chips value={draft.bestOf} values={BEST_OF_CHOICES} label={(n) => t(`tournament.bestOf.${n}`)} onChange={(n) => set('bestOf', n as BestOf)} />
          </div>
          <p class="cr-hint">{t('tournament.bestOfHint')}</p>
        </Section>

        <Section icon="users" title={t('tournament.sectionPlayers')}>
          <div class="cr-row">
            <span class="cr-label">{t('tournament.size')}</span>
            <Chips value={draft.size} values={sizes} label={(n) => String(n)} onChange={(n) => set('size', n)} disabled={(n) => !sizeOk(n)} />
          </div>
          {solo && (
            <>
              <p class="cr-hint">{t('tournament.soloSizeNote', { n: draft.size, bots: draft.size - 1 })}</p>
              <div class="cr-row">
                <span class="cr-label">{t('lobby.levelLabel')}</span>
                <div class="cr-chips" role="radiogroup">
                  {AI_LEVELS.map((l) => (
                    <button key={l.id} type="button" role="radio" aria-checked={draft.aiLevel === l.id} class={cx('cr-chip', draft.aiLevel === l.id && 'on')} onClick={() => set('aiLevel', l.id as AiLevel)}>{t(`level.${l.id}`)}</button>
                  ))}
                </div>
              </div>
              <label class="cr-field">
                <span>{t('tournament.aiDeck')}</span>
                <DeckChoice value={draft.aiDeck} random onChange={(v) => set('aiDeck', v)} />
              </label>
            </>
          )}
        </Section>

        <Section icon="deck" title={t('tournament.sectionDeck')}>
          <div class="cr-two">
            <label class="cr-field"><span>{t('lobby.format')}</span><FormatSelect value={draft.format} onChange={(value) => { draft.format = value; draft.deck = defaultDeck(value); redraw() }} /></label>
            <label class="cr-field"><span>{t('tournament.myDeck')}</span><DeckChoice value={draft.deck} onChange={(d) => set('deck', d)} /></label>
          </div>
          <p class="cr-hint">{t('tournament.deckHint')}</p>
          <FormatNotes id={draft.format} />
        </Section>

        <details class="cr-card cr-rules">
          <summary><Icon name="gear" /><h2>{t('tournament.sectionRules')}</h2><Icon name="down" /></summary>
          <div class="cr-grid">
            {numeric(t('lobby.turnTime'), draft.turnTime, 'turnTime', SETTING_CHOICES.turnTime, (s) => s === 0 ? t('lobby.unlimited') : s < 60 ? `${s} s` : `${s / 60} min`)}
            {numeric(t('lobby.lp'), draft.startLp, 'startLp', SETTING_CHOICES.startLp, (v) => `${v} LP`)}
            {numeric(t('lobby.hand'), draft.startHand, 'startHand', SETTING_CHOICES.startHand, (v) => t('lobby.cards', { n: v }))}
            {numeric(t('lobby.draw'), draft.drawPerTurn, 'drawPerTurn', SETTING_CHOICES.drawPerTurn, (v) => t('lobby.cards', { n: v }))}
            <label class="cr-field"><span>{t('lobby.challenge')}</span><ChallengeSelect value={draft.challenge} onChange={(c) => set('challenge', c)} /></label>
            <label class="cr-field"><span>{t('lobby.handicap')}</span><HandicapSelect value={draft.handicap} team={false} onChange={(h) => set('handicap', h)} /></label>
            <label class="cr-field"><span>{t('lobby.theme')}</span><ThemeSelect value={draft.theme} onChange={(th) => set('theme', th)} /></label>
          </div>
          {draft.challenge !== 'none' && <p class="cr-hint">{challengeText(draft.challenge)}</p>}
        </details>
      </div>

      <aside class="cr-summary" aria-label={t('tournament.summary')}>
        <div class="cr-sum-card">
          <KindGlyph kind={draft.kind} />
          <h3>{draft.name.trim() || t('tournament.namePlaceholder')}</h3>
          <p class="cr-sum-kind">{t(`tournament.kind.${draft.kind}`)} · {t(`tournament.bestOf.${draft.bestOf}`)}</p>
          <dl>
            <div><dt>{t('tournament.sectionPlayers')}</dt><dd>{draft.size}</dd></div>
            <div><dt>{t('tournament.roundsLabel')}</dt><dd>{rounds}</dd></div>
            <div><dt>{t('tournament.matches')}</dt><dd>{matches}</dd></div>
            <div><dt>{t('tournament.yourDuels')}</dt><dd>{draft.kind === 'single' ? `1–${games}` : games}</dd></div>
          </dl>
          {solo && botDuels > 0 && <p class="cr-note"><Icon name="computer" />{t('tournament.sumBotDuels', { n: botDuels })}</p>}
          {solo && draft.aiLevel === 'hard' && <p class="cr-note warn"><Icon name="info" />{t('tournament.sumSlow')}</p>}
          {error && <p class="cr-error" role="alert">{error}</p>}
          <Button variant="primary" type="submit" act="tournament-create" disabled={busy || !draft.deck}>{busy ? t('auth.working') : t('tournament.createBtn')}</Button>
          <Button type="button" act="tournament-create-cancel" onClick={closeCreateTournament}>{t('common.cancel')}</Button>
        </div>
      </aside>
    </form>
  )
}

/** Bouton « retour » de l'en-tête : ferme la page de création. */
export const CreateBack = (): JSX.Element => <IconButton icon="back" label={t('common.back')} act="back" onClick={closeCreateTournament} />
