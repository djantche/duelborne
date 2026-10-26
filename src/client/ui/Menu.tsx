// Menu d'actions qui s'ouvre au-dessus d'une carte ou d'un bouton.
import type { JSX } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { closeMenu } from '../app/render.ts'
import { store } from '../app/store.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './Icon.tsx'

export interface MenuItem {
  label: string
  icon: IconName
  run: () => void
  /** Numéro de l'effet, quand la carte en propose plusieurs. */
  badge?: string
  /** Le libellé reste visible (menu qui mélange plusieurs cartes) ; sinon seule l'icône s'affiche et le libellé sert d'infobulle. */
  text?: boolean
}

export function Menu(): JSX.Element | null {
  const menu = store.menu
  const ref = useRef<HTMLDivElement>(null)
  // Placé au-dessus de l'ancre s'il y a la place, sinon en dessous ; jamais hors de l'écran.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !menu) return
    const r = menu.anchor
    const half = el.offsetWidth / 2 + 8
    const x = Math.max(half, Math.min(innerWidth - half, r.left + r.width / 2))
    const above = r.top - el.offsetHeight - 12
    el.style.left = `${x}px`
    el.style.top = `${above > 6 ? above : Math.max(6, Math.min(innerHeight - el.offsetHeight - 6, r.bottom + 12))}px`
    // Ouvert au clavier (curseur du duel) : le premier choix prend le focus, les flèches passent d'un choix à l'autre.
    if (document.body.classList.contains('kbd-nav') && !el.contains(document.activeElement)) el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  })
  const arrows = (ev: KeyboardEvent): void => {
    const step = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    ev.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(at + step + buttons.length) % buttons.length]?.focus({ preventScroll: true })
  }
  if (!menu) return null
  return (
    <div class={`actions${menu.items.some((i) => i.text) ? '' : ' icons'}`} ref={ref} role="menu" onKeyDown={arrows}>
      {menu.items.map((item, i) => (
        <button
          type="button"
          key={i}
          role="menuitem"
          class={`k-${item.icon}`}
          title={item.label}
          aria-label={item.label}
          data-act="menu"
          onClick={() => {
            closeMenu()
            item.run()
          }}
        >
          <Icon name={item.icon} />
          {item.badge && <b class="badge">{item.badge}</b>}
          {(item.text || false) && <span>{item.label}</span>}
        </button>
      ))}
    </div>
  )
}
