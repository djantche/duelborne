// Fenêtres de consultation : contenu d'une pile (Cimetière et cartes bannies, Extra Deck), journal.
import type { JSX } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import type { CardView, DuelView, LogEntry } from '../../../shared/protocol.ts'
import { store } from '../../app/store.ts'
import { redraw } from '../../app/render.ts'
import { parseMsg } from '../../../shared/msg.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { closeViewer, onViewerClick } from './controller.ts'
import { logCategory, LogLines } from './Hud.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { Select } from '../../ui/Select.tsx'
import type { Marks } from './prompt.ts'
import { duel } from './state.ts'
import { duelistName } from './perspective.ts'
import type { Side } from './state.ts'
import { t, tx } from '../../i18n.ts'

const Close = (): JSX.Element => (
  <Button act="close-modal" onClick={closeViewer}>
    {t('viewer.close')}
  </Button>
)

/**
 * Cartes d'une pile. Elles gardent leur identité (data-uid) : celles qui peuvent agir sont mises
 * en surbrillance comme sur le plateau, et se touchent de la même façon.
 */
function Grid({ list, side, marks, newestFirst = true }: { list: CardView[]; side: Side; marks: Marks; newestFirst?: boolean }): JSX.Element {
  const cards = newestFirst ? [...list].reverse() : list
  return (
    <div class="grid">
      {cards.length === 0 && <p class="muted">{t('viewer.none')}</p>}
      {cards.map((c) => (
        <Card key={c.uid} card={c.cardId === null ? null : (store.cards.get(c.cardId) ?? null)} size="md" uid={c.uid} area="pile" side={side} class={marks.cards.get(c.uid)} />
      ))}
    </div>
  )
}

function LogWindow({ v }: { v: DuelView }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const query = duel.logQuery.trim().toLocaleLowerCase()
  const matches = (line: LogEntry): boolean => (!query || tx(line.text).toLocaleLowerCase().includes(query)) &&
    (duel.logSeat === 'all' || (line.seat === v.you) === (duel.logSeat === 'me') && line.seat !== null) &&
    (!duel.logTurn || line.turn === duel.logTurn) && (duel.logKind === 'all' || logCategory(line.text) === duel.logKind)
  const count = v.log.filter((l) => parseMsg(l.text)?.key !== 'log.turn' && matches(l)).length
  const activeFilters = Number(duel.logSeat !== 'all') + Number(duel.logTurn !== 0) + Number(duel.logKind !== 'all')
  const change = (run: () => void): void => { run(); duel.logScroll = 0; duel.logFollow = false; if (ref.current) ref.current.scrollTop = 0; redraw() }
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = duel.logFollow ? ref.current.scrollHeight : duel.logScroll
  }, [])
  useLayoutEffect(() => {
    if (!duel.logFollow || !ref.current) return
    ref.current.scrollTop = ref.current.scrollHeight
    duel.logReadCount = v.log.length
  }, [v.log.length])
  const latest = (): void => {
    duel.logFollow = true
    duel.logReadCount = v.log.length
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
    redraw()
  }
  const download = (): void => {
    const text = v.log.filter(matches).map((l) => `${t('duel.turn', { n: l.turn })} · ${l.seat === null ? '—' : tx(duel.names[l.seat] ?? '')} · ${tx(l.text).replace(/⟦\d+\|([^⟧]*)⟧/g, '$1')}`).join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'duel-journal.txt'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <Modal kind="viewer journal" title={<><Icon name="log" /> {t('viewer.log')}</>} count={count} actions={<><IconButton icon="download" label={t('ui.exportLog')} onClick={download} /><IconButton icon="close" label={t('common.close')} act="close-modal" onClick={closeViewer} /></>} onBackdrop={closeViewer}>
      <div class="journal-toolbar">
        <label class="journal-search"><Icon name="search" /><input type="search" value={duel.logQuery} placeholder={t('ui.searchLog')} aria-label={t('ui.searchLog')} onInput={(e) => change(() => { duel.logQuery = e.currentTarget.value })} /></label>
        <Button small icon="filter" class={duel.logFilters ? 'filters-on' : ''} aria-expanded={duel.logFilters} aria-controls="journal-filters" onClick={() => { duel.logFilters = !duel.logFilters; redraw() }}>{t('ui.filters')}{activeFilters > 0 && <small class="filter-count">{activeFilters}</small>}</Button>
      </div>
      <div id="journal-filters" class="journal-filters" hidden={!duel.logFilters}>
        <div class="journal-selects">
        <Select value={duel.logSeat} onChange={(s) => change(() => { duel.logSeat = s as typeof duel.logSeat })} choices={['all', 'me', 'foe'].map((s) => ({ value: s, label: v.watching && s !== 'all' ? duelistName(duel.names, s === 'me' ? v.you : v.you === 0 ? 1 : 0) : t(`ui.logSeat.${s}`) }))} />
        <Select value={String(duel.logTurn)} onChange={(s) => change(() => { duel.logTurn = Number(s) })} choices={[{ value: '0', label: t('ui.allTurns') }, ...[...new Set(v.log.map((l) => l.turn))].map((n) => ({ value: String(n), label: t('duel.turn', { n }) }))]} />
        {activeFilters > 0 && <IconButton icon="close" label={t('ui.resetFilters')} onClick={() => change(() => { duel.logSeat = 'all'; duel.logTurn = 0; duel.logKind = 'all' })} />}
        </div>
        <div class="journal-tabs" role="group" aria-label={t('ui.logCategories')}>{(['all', 'effects', 'combat', 'moves'] as const).map((kind) => <button type="button" key={kind} class={duel.logKind === kind ? 'on' : ''} aria-pressed={duel.logKind === kind} onClick={() => change(() => { duel.logKind = kind })}>{t(`ui.logKind.${kind}`)}</button>)}</div>
      </div>
      <div class="log-full rich-log" ref={ref} onScroll={(e) => { const el = e.currentTarget; const follow = el.scrollHeight - el.scrollTop - el.clientHeight < 36; duel.logScroll = el.scrollTop; if (follow) duel.logReadCount = v.log.length; if (follow !== duel.logFollow) { duel.logFollow = follow; redraw() } }}>
        <LogLines v={v} filter={matches} rich />
        {!count && <p class="journal-empty">{t('ui.noLogMatch')}</p>}
      </div>
      <footer class="journal-footer"><span class={duel.logFollow ? 'live' : ''}><i />{t(duel.logFollow ? 'ui.following' : 'ui.reading')}</span><Button small icon="set" onClick={latest}>{!duel.logFollow && v.log.length > duel.logReadCount ? t('ui.newEntries', { n: v.log.length - duel.logReadCount }) : t('ui.latest')}</Button></footer>
    </Modal>
  )
}

export function Viewer({ v, marks }: { v: DuelView; marks: Marks }): JSX.Element | null {
  const open = duel.viewer
  if (!open) return null
  if (open.kind === 'log') return <LogWindow v={v} />
  const side = open.side
  const seat = side === 'me' ? v.you : v.you === 0 ? 1 : 0
  const p = v.players[seat]
  if (open.kind === 'extra') {
    // On ne voit de l'Extra Deck adverse que ses cartes face recto (monstres Pendule).
    const visible = side === 'me' ? p.extra : p.extra.filter((c) => c.cardId !== null)
    const hidden = p.extra.length - visible.length
    // Les monstres qu'on peut Invoquer Spécialement maintenant (Fusion, Synchro, Xyz, Lien...) sont marqués d'un symbole.
    return (
      <Modal kind="viewer" title={v.watching ? t('viewer.extraOf', { name: duelistName(duel.names, seat) }) : side === 'me' ? t('viewer.extra') : t('viewer.extraFoe')} count={t('viewer.cards', { n: p.extra.length })} actions={<Close />} onBackdrop={closeViewer} onClick={onViewerClick}>
        <Grid list={visible} side={side} marks={marks} newestFirst={false} />
        {hidden > 0 && <p class="muted">{t('viewer.hidden', { n: hidden })}</p>}
      </Modal>
    )
  }
  if (open.kind === 'banished') {
    return (
      <Modal kind="viewer" title={v.watching ? t('viewer.banishedOf', { name: duelistName(duel.names, seat) }) : side === 'me' ? t('viewer.banished') : t('viewer.banishedFoe')} count={t('viewer.cards', { n: p.banished.length })} actions={<Close />} onBackdrop={closeViewer} onClick={onViewerClick}>
        <Grid list={p.banished} side={side} marks={marks} />
      </Modal>
    )
  }
  return (
    <Modal kind="viewer" title={v.watching ? t('viewer.graveOf', { name: duelistName(duel.names, seat) }) : side === 'me' ? t('viewer.grave') : t('viewer.graveFoe')} count={t('viewer.cards', { n: p.graveyard.length })} actions={<Close />} onBackdrop={closeViewer} onClick={onViewerClick}>
      <Grid list={p.graveyard} side={side} marks={marks} />
    </Modal>
  )
}
