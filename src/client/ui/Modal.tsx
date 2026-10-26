// Fenêtre posée par-dessus l'écran : en-tête (titre, compteur, boutons) puis contenu.
import type { ComponentChildren, JSX } from 'preact'
import { cx } from './cx.ts'
import { useId } from 'preact/hooks'
import { useDialog } from './useDialog.ts'

export interface ModalProps {
  /** Classes de variante : « viewer » (consultation), « chooser » (choix de cartes), « reply » (réponse en chaîne). */
  kind: string
  /** Choix ancré : laisse le terrain et la fiche accessibles au clavier et au pointeur. */
  nonmodal?: boolean
  title: ComponentChildren
  /** Précision à côté du titre (« 3 carte(s) », « 1 / 2 »). */
  count?: ComponentChildren
  /** Boutons de l'en-tête. */
  actions?: ComponentChildren
  /** Clic sur le fond (hors de la fenêtre). */
  onBackdrop?: () => void
  onClick?: (ev: MouseEvent) => void
  children?: ComponentChildren
}

export function Modal({ kind, title, count, actions, onBackdrop, onClick, children, nonmodal }: ModalProps): JSX.Element {
  const ref = useDialog(onBackdrop, nonmodal)
  const titleId = useId()
  return (
    <div
      class={cx('modal', kind)}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onBackdrop?.()
        onClick?.(ev)
      }}
    >
      <div class="modal-in glass" role="dialog" aria-modal={nonmodal ? undefined : "true"} aria-labelledby={titleId} tabIndex={-1} ref={ref}>
        <header>
          <h2 id={titleId}>{title}</h2>
          {count !== undefined && <span class="chooser-count">{count}</span>}
          <div class="panel-row chooser-buttons">{actions}</div>
        </header>
        {children}
      </div>
    </div>
  )
}
