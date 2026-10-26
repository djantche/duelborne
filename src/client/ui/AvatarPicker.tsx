// Choix d'un avatar : l'illustration d'une carte du catalogue, trouvée par son nom (les emblèmes des decks sont proposés d'abord).
import type { JSX } from 'preact'
import { createPortal } from 'preact/compat'
import { useMemo, useState } from 'preact/hooks'
import { store } from '../app/store.ts'
import { t } from '../i18n.ts'
import { Avatar } from './Avatar.tsx'
import { Button, IconButton } from './Button.tsx'
import { imgUrl, nameOf } from './cardview.ts'
import type { ClientCard } from './cardview.ts'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'
import { Modal } from './Modal.tsx'

const LIMIT = 48
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Cartes dont le nom contient le texte (ceux qui commencent par lui d'abord) ; sans texte, les emblèmes des decks du joueur. */
function candidates(query: string): ClientCard[] {
  const q = fold(query.trim())
  if (q.length < 2) {
    const covers = [...new Set(store.decks.map((d) => d.cover))]
    return covers.flatMap((id) => store.cards.get(id) ?? []).slice(0, LIMIT)
  }
  const found: { card: ClientCard; first: boolean }[] = []
  for (const card of store.cards.values()) {
    const names = `${fold(nameOf(card))}\n${fold(card.name.en)}`
    if (names.includes(q)) found.push({ card, first: names.startsWith(q) || names.includes(`\n${q}`) })
  }
  found.sort((a, b) => Number(b.first) - Number(a.first) || nameOf(a.card).localeCompare(nameOf(b.card)))
  return found.slice(0, LIMIT).map((f) => f.card)
}

export interface AvatarPickerProps {
  current: number | null
  name: string
  onPick: (card: number | null) => void
  onClose: () => void
}

export function AvatarPicker({ current, name, onPick, onClose }: AvatarPickerProps): JSX.Element {
  const [query, setQuery] = useState('')
  const list = useMemo(() => candidates(query), [query, store.cards.size, store.decks])
  const pick = (card: number | null): void => {
    onPick(card)
    onClose()
  }
  return createPortal(
    <Modal kind="avatar-picker" title={t('avatar.title')} onBackdrop={onClose} actions={<IconButton icon="close" label={t('common.close')} onClick={onClose} />}>
      <div class="avatar-picker-tools">
        <Avatar card={current} name={name} class="avatar-current" />
        <label class="journal-search">
          <Icon name="search" />
          <input type="search" value={query} placeholder={t('avatar.search')} aria-label={t('avatar.search')} autocomplete="off" onInput={(e) => setQuery(e.currentTarget.value)} />
        </label>
        <Button small act="avatar-none" disabled={current === null} onClick={() => pick(null)}>{t('avatar.none')}</Button>
      </div>
      <p class="avatar-picker-hint" role="status">{list.length ? (query.trim().length < 2 ? t('avatar.suggested') : '') : query.trim().length < 2 ? t('avatar.hint') : t('avatar.empty')}</p>
      <div class="avatar-grid" role="list">
        {list.map((card) => (
          <div role="listitem" key={card.id}>
            <button type="button" class={cx('avatar-choice', card.id === current && 'on')} aria-pressed={card.id === current} aria-label={nameOf(card)} title={nameOf(card)} onClick={() => pick(card.id)}>
              <img src={imgUrl(card.id)} alt="" loading="lazy" decoding="async" draggable={false} />
            </button>
          </div>
        ))}
      </div>
    </Modal>,
    document.body,
  )
}
