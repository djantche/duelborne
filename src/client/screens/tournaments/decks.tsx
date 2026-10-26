import type { JSX } from 'preact'
import type { FormatId } from '../../../shared/formats.ts'
import { store } from '../../app/store.ts'
import { DeckCombobox } from '../../ui/DeckCombobox.tsx'

/** Choix d'un deck : une combobox avec recherche, vignettes et groupes par série. */
export function DeckChoice({ value, onChange, random }: { value: string; onChange: (id: string) => void; random?: boolean }): JSX.Element {
  return <DeckCombobox value={value} onChange={onChange} {...(random ? { random: true } : {})} />
}

export function defaultDeck(format: FormatId): string {
  const remembered = store.user?.prefs.activeDecks?.[format]
  return remembered && store.decks.some((d) => d.id === remembered) ? remembered : (store.decks[0]?.id ?? '')
}
