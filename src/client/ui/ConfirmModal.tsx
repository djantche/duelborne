// Fenêtre de confirmation du jeu : remplace confirm() du navigateur, qui sort de l'interface et bloque tout.
import { t } from '../i18n.ts'
import type { JSX } from 'preact'
import { closeAsk } from '../app/render.ts'
import { store } from '../app/store.ts'
import { Button } from './Button.tsx'
import { useDialog } from './useDialog.ts'

export function ConfirmModal(): JSX.Element | null {
  const q = store.ask
  return q ? <Confirmation q={q} /> : null
}

function Confirmation({ q }: { q: NonNullable<typeof store.ask> }): JSX.Element {
  const ref = useDialog(closeAsk)
  return (
    <div class="dk-overlay" style="z-index:90" onClick={(ev) => ev.target === ev.currentTarget && closeAsk()}>
      <div class="dk-dialog glass" role="alertdialog" aria-modal="true" tabIndex={-1} aria-label={q.title} ref={ref}>
        <header>
          <h2>{q.title}</h2>
        </header>
        <p>{q.text}</p>
        <div class="dk-actions">
          <Button
            variant={q.danger ? 'danger' : 'primary'}
            act="confirm-ok"
            onClick={() => {
              const run = q.run
              closeAsk()
              run()
            }}
          >
            {q.ok}
          </Button>
          <Button act="confirm-cancel" onClick={closeAsk}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
