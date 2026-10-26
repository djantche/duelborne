// Liste déroulante maison (remplace <select>, dont le menu est celui du navigateur). Un bouton affiche le choix en cours ;
// la liste s'ouvre en dessous (ou au-dessus s'il n'y a pas la place), défile, se commande au clavier (↑ ↓ Entrée Échap, lettres)
// et se ferme en touchant ailleurs. Elle est posée dans <body> : aucun panneau à « overflow » ou « backdrop-filter » ne la coupe.
import type { JSX } from 'preact'
import { render } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'

export interface Choice {
  value: string
  label: string
  /** Texte secondaire, à droite du libellé. */
  hint?: string
}

interface Props {
  value: string
  choices: Choice[]
  onChange: (value: string) => void
  class?: string
  /** Attribut data-seat etc. pour les tests visuels. */
  id?: string
  title?: string
  disabled?: boolean
}

interface Anchor {
  left: number
  width: number
  top?: number
  bottom?: number
  max: number
}

/** Où poser la liste par rapport au bouton : dessous si elle tient, sinon dessus, avec une hauteur maximale. */
function place(button: HTMLElement): Anchor {
  const r = button.getBoundingClientRect()
  const below = window.innerHeight - r.bottom - 10
  const above = r.top - 10
  const width = Math.min(Math.max(r.width, 210), window.innerWidth - 16)
  const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
  return below >= 180 || below >= above ? { left, width, top: r.bottom + 4, max: Math.min(300, Math.max(120, below)) } : { left, width, bottom: window.innerHeight - r.top + 4, max: Math.min(300, Math.max(120, above)) }
}

function List({ anchor, choices, value, onPick, onClose }: { anchor: Anchor; choices: Choice[]; value: string; onPick: (v: string) => void; onClose: () => void }): JSX.Element {
  const [active, setActive] = useState(Math.max(0, choices.findIndex((c) => c.value === value)))
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 }).current
  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])
  useEffect(() => {
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === 'Tab') { onClose(); return }
      if (ev.key === 'Escape') onClose()
      else if (ev.key === 'ArrowDown') setActive((i) => Math.min(choices.length - 1, i + 1))
      else if (ev.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
      else if (ev.key === 'Home') setActive(0)
      else if (ev.key === 'End') setActive(choices.length - 1)
      else if (ev.key === 'Enter' || ev.key === ' ') onPick((choices[active] as Choice).value)
      else if (ev.key.length === 1) {
        // Saisie au clavier : on saute au premier libellé qui commence par les lettres tapées.
        const now = Date.now()
        typed.text = (now - typed.at < 700 ? typed.text : '') + ev.key.toLowerCase()
        typed.at = now
        const i = choices.findIndex((c) => c.label.toLowerCase().startsWith(typed.text))
        if (i >= 0) setActive(i)
      } else return
      ev.preventDefault()
      ev.stopPropagation()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [active, choices])
  const style = { left: `${anchor.left}px`, width: `${anchor.width}px`, maxHeight: `${anchor.max}px`, ...(anchor.top !== undefined ? { top: `${anchor.top}px` } : { bottom: `${anchor.bottom}px` }) }
  return (
    <ul class="sel-list" role="listbox" ref={list} style={style}>
      {choices.map((c, i) => (
        <li key={c.value} role="option" aria-selected={c.value === value} class={cx(c.value === value && 'on', i === active && 'hot')} onPointerEnter={() => setActive(i)} onClick={() => onPick(c.value)}>
          <span>{c.label}</span>
          {c.hint && <small>{c.hint}</small>}
          {c.value === value && <Icon name="check" />}
        </li>
      ))}
    </ul>
  )
}

export function Select({ value, choices, onChange, class: cls, id, title, disabled }: Props): JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement | null>(null)
  const current = choices.find((c) => c.value === value) ?? choices[0]
  useEffect(() => {
    // La page peut rester montée mais cachée : son menu flottant ne doit pas rester dans <body>.
    if (open && !button.current?.getClientRects().length) setOpen(false)
  })

  const close = (): void => {
    setOpen(false)
    button.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open || !button.current) return
    const root = document.createElement('div')
    root.className = 'sel-layer'
    document.body.appendChild(root)
    host.current = root
    const pick = (v: string): void => {
      setOpen(false)
      if (v !== value) onChange(v)
      button.current?.focus({ preventScroll: true })
    }
    const position = (): void => {
      if (!button.current?.getClientRects().length) return setOpen(false)
      render(<List anchor={place(button.current)} choices={choices} value={value} onPick={pick} onClose={close} />, root)
    }
    position()
    // Un défilement du journal ou un redimensionnement déplace la liste, sans interrompre le choix.
    const outside = (ev: PointerEvent): void => {
      if (!(ev.target as Element).closest('.sel-list') && !button.current?.contains(ev.target as Node)) setOpen(false)
    }
    const away = (ev: Event): void => {
      if (!(ev.target as Element).closest?.('.sel-list')) position()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
      render(null, root)
      root.remove()
      host.current = null
    }
  }, [open])

  return (
    <button
      type="button"
      ref={button}
      id={id}
      title={title}
      disabled={disabled}
      class={cx('sel', open && 'open', cls)}
      aria-haspopup="listbox"
      aria-expanded={open}
      data-value={value}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(ev) => {
        if (!open && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) {
          ev.preventDefault()
          setOpen(true)
        }
      }}
    >
      <span>{current?.label ?? ''}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  )
}
