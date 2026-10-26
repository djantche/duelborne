// Écran de duel : fiche de carte à gauche (le journal s'ouvre dans sa fenêtre), terrain au centre, points de vie et phases à droite.
import type { JSX } from 'preact'
import { useEffect, useLayoutEffect } from 'preact/hooks'
import type { DuelView, Seat } from '../../../shared/protocol.ts'
import { leaveRoom } from '../../app/actions.ts'
import { store } from '../../app/store.ts'
import { requestReplay } from '../../app/replays.ts'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import { Stage } from './Board.tsx'
import { continueTournament, onBoardClick, rematch, syncArrows } from './controller.ts'
import { DetailColumn, DetailSheet } from './Detail.tsx'
import { ChainBar, Hud, Phases } from './Hud.tsx'
import { computeMarks } from './prompt.ts'
import type { Marks } from './prompt.ts'
import { PromptPanel, PromptWindow } from './Prompts.tsx'
import { duel } from './state.ts'
import { duelistName } from './perspective.ts'
import { Viewer } from './Viewer.tsx'
import { AttackDeclaration } from './AttackDeclaration.tsx'
import { t, tx } from '../../i18n.ts'
import { loadSummonAssets } from './summonAssets.ts'
import { PileTooltip } from './PileTooltip.tsx'
import { SandboxNavigation } from './SandboxNavigation.tsx'
import { layoutCardNotices } from './reveal.ts'
import { KeyboardHelp } from './keyboard.tsx'

function Result({ v }: { v: DuelView }): JSX.Element | null {
  if (v.winner === null || store.screen === 'replay' || duel.finale) return null
  const foeSeat: Seat = v.you === 0 ? 1 : 0
  const kind = v.winner === 'draw' ? 'draw' : v.watching ? 'win' : v.winner === v.you ? 'win' : 'lose'
  return (
    <div class={`result ${kind}`}>
      <div class="result-in">
        <h1>{kind === 'draw' ? t('duel.draw') : kind === 'win' ? t('duel.win') : t('duel.lose')}</h1>
        {v.watching && v.winner !== 'draw' && <p>{t('duel.winsDuel', { name: duelistName(duel.names, v.winner as Seat) })}</p>}
        <p>
          {v.players[v.you].lp} LP <span>{t('duel.vs')}</span> {v.players[foeSeat].lp} LP
        </p>
        <div class="result-actions">
          {duel.matchId && <Button icon="download" act="save-replay" disabled={store.replaySavingId !== null || store.replaySavedIds.has(duel.matchId)} onClick={requestReplay}>{t(store.replaySavedIds.has(duel.matchId) ? 'replay.savedButton' : store.replaySavingId ? 'replay.saving' : 'replay.save')}</Button>}
          {store.room?.tournament && <Button variant="primary" act="tournament-continue" onClick={continueTournament}>{t('tournament.continue')}</Button>}
          {!store.room?.tournament && (!v.watching || store.room?.mode === 'aivai') && (
            <Button variant="primary" act="rematch" onClick={rematch}>
              {t('duel.rematch')}
            </Button>
          )}
          {!store.room?.tournament && <Button act="leave" onClick={leaveRoom}>
            {t('duel.quit')}
          </Button>}
        </div>
      </div>
    </div>
  )
}

/** Le plateau et ses colonnes (rendu dans #app). */
export function DuelScreen(): JSX.Element | null {
  useEffect(() => { void loadSummonAssets() }, [])
  const v = duel.view
  // Après chaque rendu : les flèches de visée suivent l'état (elles vivent dans le calque d'effets).
  useLayoutEffect(syncArrows)
  if (!v) return null
  const marks = computeMarks()
  const foeSeat: Seat = v.you === 0 ? 1 : 0
  const selected = (duel.pinned || duel.sheet) && duel.focusId !== null && store.cards.has(duel.focusId)
  return (
    <>
      <div class={cx('duel', selected && 'has-card-detail', v.extraZones && 'emz', duel.busy && 'presenting', duel.pinned && 'pinned', duel.handLocked && 'hand-locked', marks.mode === 'pick' && 'selecting-cards')} onClick={onBoardClick}>
        <aside class="left" key="card-detail" aria-hidden={!selected}>{selected && <DetailColumn />}</aside>
        <section key="arena" class={cx('arena', marks.aiming && 'aiming', marks.mode === 'direct' && 'aim-direct')} id="arena">
          <ChainBar v={v} />
          {/* Reconstruit à chaque nouvel état : les animations y laissent des traces qu'il faut effacer. */}
          <Stage key={duel.version} v={v} marks={marks} />
          <div class={cx('hint', marks.hint && 'show', marks.waiting && 'wait')} id="hint">
            {marks.hint}
          </div>
        </section>
        <aside class="right" key="duel-hud">
          <Hud v={v} p={v.players[foeSeat]} side="foe" name={v.watching ? duelistName(duel.names, foeSeat) : tx(duel.names[foeSeat] ?? t('duel.foe'))} online={duel.connected[foeSeat] !== false} />
          <Phases v={v} />
          <Hud v={v} p={v.players[v.you]} side="me" name={v.watching ? duelistName(duel.names, v.you) : tx(duel.names[v.you] ?? t('duel.me'))} online />
        </aside>
      </div>
      <Result v={v} />
    </>
  )
}

/** Ce qui se pose par-dessus le plateau et ses effets (rendu dans #ui) : questions, fenêtres, fiche. */
export function DuelOverlays(): JSX.Element | null {
  useLayoutEffect(layoutCardNotices)
  const v = duel.view
  if (!v) return null
  const marks: Marks = computeMarks()
  return (
    <>
      <PromptPanel mode={marks.mode} />
      <PileTooltip />
      <SandboxNavigation />
      <AttackDeclaration />
      <PromptWindow mode={marks.mode} />
      <Viewer v={v} marks={marks} />
      <DetailSheet />
      <KeyboardHelp />
    </>
  )
}

export const RotateHint = (): JSX.Element => (
  <div class="rotate-hint">
    <Icon name="rotate" />
    <p>{t('duel.rotate')}</p>
  </div>
)
