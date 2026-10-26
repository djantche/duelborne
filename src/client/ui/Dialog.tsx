// Fenêtre posée par-dessus l'écran : un titre, une croix, du contenu qui défile (même présentation que l'éditeur de deck).
import type { ComponentChildren, JSX } from 'preact'
import { t } from '../i18n.ts'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'
import { useDialog } from './useDialog.ts'

export function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ComponentChildren }): JSX.Element {
  const ref = useDialog(onClose)
  return (
    <div class="dk-overlay" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div class={cx('dk-dialog glass', wide && 'wide')} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="btn icon" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div class="dk-dialog-body">{children}</div>
      </div>
    </div>
  )
}
