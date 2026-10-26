// Liste déroulante moderne avec recherche (combobox) : un bouton affiche le choix, un panneau s'ouvre avec un champ de recherche, des groupes,
// des vignettes et une aide à droite. Au clavier : ↑ ↓ Début Fin pour se déplacer, Entrée pour choisir, Échap pour fermer, et on tape pour filtrer.
// Sur téléphone, le panneau est une feuille qui monte du bas de l'écran. Le panneau est posé dans <body> : aucun « overflow » ne le coupe.
// Un seul composant pour toute l'application ; ui/DeckCombobox.tsx l'habille pour choisir un deck.
import type { JSX } from 'preact'
import { render } from 'preact'
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks'
import { t } from '../i18n.ts'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'

export interface ComboOption {
  value: string
  label: string
  /** Ligne secondaire sous le libellé. */
  hint?: string
  /** Groupe d'appartenance : un titre est posé quand il change. */
  group?: string
  /** Vignette (adresse d'une image). */
  image?: string
  /** Pictogramme à la place d'une vignette. */
  icon?: 'shuffle' | 'deck' | 'users' | 'computer'
  /** Petit texte à droite (nombre de cartes, par exemple). */
  badge?: string
  /** Mots en plus du libellé pour la recherche. */
  keywords?: string
}

export interface ComboboxProps {
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  class?: string
  /** Libellé accessible du bouton et du panneau. */
  label?: string
}

/** Texte sans majuscules ni accents, pour chercher. */
const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const SHEET = '(max-width: 700px), (max-height: 520px)'

function Thumb({ o }: { o: ComboOption }): JSX.Element | null {
  if (o.image) return <span class="cb-thumb" style={{ backgroundImage: `url(${o.image})` }} aria-hidden="true" />
  if (o.icon) return <span class="cb-thumb icon" aria-hidden="true"><Icon name={o.icon} /></span>
  return null
}

function Panel({ rect, sheet, options, value, label, searchPlaceholder, emptyText, onPick, onClose }: { rect: DOMRect; sheet: boolean; options: ComboOption[]; value: string; label: string; searchPlaceholder: string; emptyText: string; onPick: (v: string) => void; onClose: () => void }): JSX.Element {
  const [query, setQuery] = useState('')
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const q = plain(query.trim())
  const shown = useMemo(() => {
    if (!q) return options
    const rank = (o: ComboOption): number => {
      const l = plain(o.label)
      return l.startsWith(q) ? 0 : l.includes(q) ? 1 : plain(`${o.hint ?? ''} ${o.group ?? ''} ${o.keywords ?? ''}`).includes(q) ? 2 : 3
    }
    return options.filter((o) => rank(o) < 3).sort((a, b) => rank(a) - rank(b))
  }, [q, options])
  const [active, setActive] = useState(() => Math.max(0, shown.findIndex((o) => o.value === value)))
  useEffect(() => setActive(q ? 0 : Math.max(0, shown.findIndex((o) => o.value === value))), [q])
  useEffect(() => { input.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, shown])
  const move = (to: number): void => setActive(Math.max(0, Math.min(shown.length - 1, to)))
  const key = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') onClose()
    else if (ev.key === 'ArrowDown') move(active + 1)
    else if (ev.key === 'ArrowUp') move(active - 1)
    else if (ev.key === 'PageDown') move(active + 6)
    else if (ev.key === 'PageUp') move(active - 6)
    else if (ev.key === 'Home' && !query) move(0)
    else if (ev.key === 'End' && !query) move(shown.length - 1)
    else if (ev.key === 'Enter') { const o = shown[active]; if (o) onPick(o.value) }
    else if (ev.key === 'Tab') return onClose()
    else return
    ev.preventDefault()
    ev.stopPropagation()
  }
  const width = sheet ? innerWidth : Math.min(Math.max(rect.width, 340), innerWidth - 16)
  const left = sheet ? 0 : Math.min(Math.max(8, rect.left), innerWidth - width - 8)
  const below = innerHeight - rect.bottom - 12
  const above = rect.top - 12
  const down = below >= 260 || below >= above
  const max = sheet ? undefined : Math.min(440, Math.max(200, down ? below : above))
  const style = sheet ? undefined : { left: `${left}px`, width: `${width}px`, maxHeight: `${max}px`, ...(down ? { top: `${rect.bottom + 6}px` } : { bottom: `${innerHeight - rect.top + 6}px` }) }
  let lastGroup: string | undefined
  return (
    <>
      {sheet && <div class="cb-backdrop" onClick={onClose} />}
      <div class={cx('cb-panel', sheet && 'sheet')} style={style} role="dialog" aria-label={label} onKeyDown={key}>
        <label class="cb-search">
          <Icon name="search" />
          <input
            ref={input}
            type="text"
            {...({ role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-activedescendant': shown[active] ? `${listId}-${active}` : undefined, 'aria-autocomplete': 'list' } as object)}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            placeholder={searchPlaceholder}
            aria-label={label}
            value={query}
            onInput={(ev) => setQuery(ev.currentTarget.value)}
          />
          <span class="cb-count" aria-live="polite">{shown.length}</span>
        </label>
        <div class="cb-list" role="listbox" id={listId} ref={list} aria-label={label}>
          {shown.length === 0 && <p class="cb-empty">{emptyText}</p>}
          {shown.map((o, i) => {
            const head = o.group && o.group !== lastGroup && !q ? o.group : null
            lastGroup = o.group
            return (
              <div key={o.value}>
                {head && <h4 class="cb-group" role="presentation">{head}</h4>}
                <div id={`${listId}-${i}`} role="option" data-i={i} aria-selected={o.value === value} class={cx('cb-option', o.value === value && 'on', i === active && 'hot')} onPointerEnter={() => setActive(i)} onClick={() => onPick(o.value)}>
                  <Thumb o={o} />
                  <span class="cb-text">
                    <b>{o.label}</b>
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                  {o.badge && <em class="cb-badge">{o.badge}</em>}
                  {o.value === value && <Icon name="check" />}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export function Combobox({ value, options, onChange, placeholder, searchPlaceholder, emptyText, disabled, id, class: cls, label }: ComboboxProps): JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const name = label ?? placeholder ?? ''
  useEffect(() => {
    // Une page montée mais cachée ne garde pas de panneau flottant.
    if (open && !button.current?.getClientRects().length) setOpen(false)
  })
  useEffect(() => {
    if (!open || !button.current) return
    const root = document.createElement('div')
    root.className = 'cb-layer'
    document.body.appendChild(root)
    const close = (): void => { setOpen(false); button.current?.focus({ preventScroll: true }) }
    const pick = (v: string): void => { setOpen(false); if (v !== value) onChange(v); button.current?.focus({ preventScroll: true }) }
    const paint = (): void => {
      if (!button.current?.getClientRects().length) return setOpen(false)
      render(<Panel rect={button.current.getBoundingClientRect()} sheet={matchMedia(SHEET).matches} options={options} value={value} label={name} searchPlaceholder={searchPlaceholder ?? t('combo.search')} emptyText={emptyText ?? t('combo.none')} onPick={pick} onClose={close} />, root)
    }
    paint()
    const outside = (ev: PointerEvent): void => {
      const target = ev.target as Element
      if (!target.closest('.cb-panel') && !button.current?.contains(target as Node)) setOpen(false)
    }
    const away = (ev: Event): void => { if (!(ev.target as Element).closest?.('.cb-panel')) paint() }
    addEventListener('pointerdown', outside, true)
    addEventListener('scroll', away, true)
    addEventListener('resize', away)
    return () => {
      removeEventListener('pointerdown', outside, true)
      removeEventListener('scroll', away, true)
      removeEventListener('resize', away)
      render(null, root)
      root.remove()
    }
  }, [open])
  return (
    <button
      type="button"
      ref={button}
      id={id}
      disabled={disabled}
      class={cx('cb', open && 'open', !current && 'empty', cls)}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={name || undefined}
      data-value={value}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(ev) => { if (!open && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) { ev.preventDefault(); setOpen(true) } }}
    >
      {current ? <Thumb o={current} /> : null}
      <span class="cb-text">
        <b>{current?.label ?? placeholder ?? ''}</b>
        {current?.hint && <small>{current.hint}</small>}
      </span>
      <Icon name="down" />
    </button>
  )
}
