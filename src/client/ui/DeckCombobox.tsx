// Choix d'un deck dans une combobox : vignette de la carte emblème, nom, nombre de cartes, regroupé par série (mes decks d'abord).
// Pour l'ordinateur, des entrées « au hasard » (parmi tous les decks, ou parmi une série) viennent en tête de liste.
import type { JSX } from 'preact'
import { store } from '../app/store.ts'
import { t } from '../i18n.ts'
import { Combobox } from './Combobox.tsx'
import type { ComboOption } from './Combobox.tsx'
import { imgUrl } from './cardview.ts'
import { SERIES, seriesLabel } from './DeckPicker.tsx'

/** Valeur d'une entrée « au hasard parmi cette série ». */
export const RANDOM_IN = (series: string): string => `series:${series}`

const MINE = 'Mes decks'

/** Les decks disponibles, en options de combobox. */
export function deckOptions(random: boolean): ComboOption[] {
  const series = [...new Set([...SERIES, ...store.decks.map((d) => d.series)])].filter((s) => store.decks.some((d) => d.series === s))
  const own = (d: { id: string }): boolean => d.id.startsWith('user-')
  // Les decks personnels d'abord, puis les séries du jeu dans leur ordre habituel.
  const groups = [...series.filter((s) => s === MINE || store.decks.some((d) => d.series === s && own(d))), ...series.filter((s) => !(s === MINE || store.decks.some((d) => d.series === s && own(d))))]
  const out: ComboOption[] = []
  if (random) {
    out.push({ value: '', label: t('lobby.randomDeck'), hint: t('picker.randomText'), icon: 'shuffle', group: t('combo.random'), keywords: 'hasard random aléatoire' })
    for (const s of series.filter((x) => store.decks.some((d) => d.series === x && !own(d)))) {
      out.push({ value: RANDOM_IN(s), label: t('picker.randomIn', { series: seriesLabel(s) }), hint: t('picker.randomInText', { n: store.decks.filter((d) => d.series === s).length }), icon: 'shuffle', group: t('combo.random'), keywords: `hasard random ${seriesLabel(s)}` })
    }
  }
  for (const s of groups) {
    for (const d of store.decks.filter((x) => x.series === s)) {
      out.push({ value: d.id, label: d.name, hint: `${t('lobby.cards', { n: d.mainCount })}${d.extraCount ? ` + ${d.extraCount} ${t('lobby.extra')}` : ''}`, image: imgUrl(d.cover), group: seriesLabel(s), keywords: seriesLabel(s) })
    }
  }
  return out
}

export function DeckCombobox({ value, onChange, random, disabled, label }: { value: string; onChange: (id: string) => void; /** Propose « au hasard » (et au hasard par série) : pour les decks de l'ordinateur. */ random?: boolean; disabled?: boolean; label?: string }): JSX.Element {
  const options = deckOptions(!!random)
  return <Combobox value={value} options={options} onChange={onChange} disabled={disabled} label={label ?? t('tournament.myDeck')} placeholder={t('tournament.noDeck')} searchPlaceholder={t('combo.searchDeck')} emptyText={t('combo.noneDeck')} class="cb-deck" />
}
