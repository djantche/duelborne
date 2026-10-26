// Choix d'un deck, pour soi ou pour un ordinateur : une fenêtre avec les illustrations, une recherche, des filtres par série,
// et « Au hasard » pour l'ordinateur. Elle s'ouvre depuis le salon (la vignette de deck d'une place).
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { DeckInfo } from '../../shared/protocol.ts'
import { send } from '../app/net.ts'
import { redraw } from '../app/render.ts'
import { store } from '../app/store.ts'
import { has, t, tx } from '../i18n.ts'
import { sfx } from './audio.ts'
import { IconButton } from './Button.tsx'
import { imgUrl, nameOf } from './cardview.ts'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'

/** Ordre d'affichage des séries de decks (les autres suivent, dans l'ordre où elles arrivent). */
export const SERIES = ['Moderne', 'Structure Deck', 'Duel Monsters', 'GX', "5D's", 'ARC-V', 'VRAINS', 'Mes decks', 'Deck personnel']

export const seriesLabel = (s: string): string => (has(`lobby.series.${s}`) ? t(`lobby.series.${s}`) : s)
export const deckOf = (id: string | null | undefined): DeckInfo | undefined => store.decks.find((d) => d.id === id)

/** Texte sans majuscules ni accents, pour chercher. */
const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function openDeckPicker(seat: number, bot: boolean, current: string | null, who: string, currentSeries?: string): void {
  sfx('menu', { volume: 0.5 })
  store.deckPicker = { seat, bot, current, who, ...(currentSeries ? { currentSeries } : {}) }
  redraw()
}

export function closeDeckPicker(): void {
  store.deckPicker = null
  redraw()
}

function choose(id: string | null, series?: string): void {
  const p = store.deckPicker
  if (!p) return
  sfx('cardpick')
  if (p.bot) send({ t: 'aiDeck', deck: id, seat: p.seat, ...(id === null && series ? { series } : {}) })
  else if (id) send({ t: 'deck', deck: id })
  closeDeckPicker()
}

/** Vignette d'un deck : illustration de sa carte emblème, nom, nombre de cartes, carte emblème. */
export function DeckTile({ d, on, onPick }: { d: DeckInfo; on: boolean; onPick: () => void }): JSX.Element {
  const cover = store.cards.get(d.cover)
  return (
    <button type="button" class={cx('deck', on && 'on')} data-act="pick" data-deck={d.id} onClick={onPick}>
      <span class="deck-art" style={{ backgroundImage: `url(${imgUrl(d.cover)})` }} />
      <b>{d.name}</b>
      <small>
        {t('lobby.cards', { n: d.mainCount })}
        {d.extraCount ? ` + ${d.extraCount} ${t('lobby.extra')}` : ''}
      </small>
      <em>{cover ? nameOf(cover) : ''}</em>
      {on && <Icon name="check" />}
    </button>
  )
}

export function DeckPicker(): JSX.Element | null {
  const p = store.deckPicker
  const [query, setQuery] = useState('')
  const [series, setSeries] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const key = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      ev.stopPropagation()
      closeDeckPicker()
    }
    window.addEventListener('keydown', key, true)
    // Sur ordinateur, on peut taper tout de suite le nom cherché.
    if (!matchMedia('(pointer: coarse)').matches) search.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  if (!p) return null
  const all = [...new Set([...SERIES, ...store.decks.map((d) => d.series)])].filter((s) => store.decks.some((d) => d.series === s))
  const q = plain(query.trim())
  const matches = (d: DeckInfo): boolean => {
    if (series && d.series !== series) return false
    if (!q) return true
    const cover = store.cards.get(d.cover)
    return plain(d.name).includes(q) || (cover ? plain(nameOf(cover)).includes(q) : false)
  }
  const groups = all.map((s) => ({ s, decks: store.decks.filter((d) => d.series === s && matches(d)) })).filter((g) => g.decks.length)
  const count = groups.reduce((n, g) => n + g.decks.length, 0)
  return (
    <div class="picker-back" onClick={(ev) => ev.target === ev.currentTarget && closeDeckPicker()}>
      <div class="picker glass" role="dialog" aria-label={t('picker.title')}>
        <header>
          <div class="picker-title">
            <small>{p.bot ? t('picker.forAi', { name: tx(p.who) }) : t('picker.forYou')}</small>
            <h2>{t('picker.title')}</h2>
          </div>
          <label class="picker-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
            <input ref={search} type="search" value={query} placeholder={t('picker.search')} autocomplete="off" onInput={(ev) => setQuery(ev.currentTarget.value)} />
          </label>
          <IconButton icon="close" label={t('common.close')} act="picker-close" onClick={closeDeckPicker} />
        </header>
        <div class="picker-filters" role="tablist">
          <button type="button" class={cx('chip', series === null && 'on')} data-act="series" data-series="" onClick={() => setSeries(null)}>
            {t('picker.all')} <i>{store.decks.length}</i>
          </button>
          {all.map((s) => (
            <button type="button" key={s} class={cx('chip', series === s && 'on')} data-act="series" data-series={s} onClick={() => setSeries(series === s ? null : s)}>
              {seriesLabel(s)} <i>{store.decks.filter((d) => d.series === s).length}</i>
            </button>
          ))}
        </div>
        <div class="picker-list">
          {p.bot && !q && (
            <button type="button" class={cx('deck random', p.current === null && (p.currentSeries ?? null) === series && 'on')} data-act="pick" data-deck="" data-series={series ?? ''} onClick={() => choose(null, series ?? undefined)}>
              <span class="deck-art dice" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <b>{series ? t('picker.randomIn', { series: seriesLabel(series) }) : t('lobby.randomDeck')}</b>
              <small>{series ? t('picker.randomInText', { n: store.decks.filter((d) => d.series === series).length }) : t('picker.randomText')}</small>
              {p.current === null && (p.currentSeries ?? null) === series && <Icon name="check" />}
            </button>
          )}
          {groups.map((g) => (
            <section key={g.s}>
              <h3>{seriesLabel(g.s)}</h3>
              <div class="decks">
                {g.decks.map((d) => (
                  <DeckTile key={d.id} d={d} on={p.current === d.id} onPick={() => choose(d.id)} />
                ))}
              </div>
            </section>
          ))}
          {count === 0 && <p class="picker-empty">{t('picker.none')}</p>}
        </div>
      </div>
    </div>
  )
}
