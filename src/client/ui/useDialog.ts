// Une fenêtre garde son focus pendant les mises à jour ; seul le dialogue au premier plan reçoit Échap et Tab.
import { useLayoutEffect, useRef } from 'preact/hooks'

const dialogs: HTMLElement[] = []
const visible = (el: HTMLElement): boolean => el.isConnected && el.getClientRects().length > 0
const topDialog = (): HTMLElement | undefined => dialogs.filter(visible).sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).at(-1)
// Une barre d'outils de navigation explicitement marquée reste accessible avec le dialogue ouvert.
const focusables = (el: HTMLElement, includeTools: boolean): HTMLElement[] => [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'), ...(includeTools ? document.querySelectorAll<HTMLElement>('[data-dialog-tools] button:not(:disabled)') : [])].filter(visible)

export function useDialog(onClose?: () => void, nonmodal = false, includeTools = true) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || nonmodal) return
    const previous = document.activeElement as HTMLElement | null
    dialogs.push(el)
    const key = (ev: KeyboardEvent): void => {
      if (topDialog() !== el) return
      if (ev.key === 'Escape') {
        ev.preventDefault()
        ev.stopImmediatePropagation()
        close.current?.()
      } else if (ev.key === 'Tab') {
        const items = focusables(el, includeTools)
        const at = items.indexOf(document.activeElement as HTMLElement)
        if (!items.length || at < 0 || ev.shiftKey && at === 0 || !ev.shiftKey && at === items.length - 1) {
          ev.preventDefault()
          const next = (ev.shiftKey ? items.at(-1) : items[0]) ?? el
          next.focus({ preventScroll: true })
        }
      }
    }
    document.addEventListener('keydown', key, true)
    if (topDialog() === el) (focusables(el, includeTools)[0] ?? el).focus({ preventScroll: true })
    return () => {
      dialogs.splice(dialogs.indexOf(el), 1)
      document.removeEventListener('keydown', key, true)
      if (previous && visible(previous) && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) previous.focus({ preventScroll: true })
    }
  }, [nonmodal, includeTools])
  return ref
}
