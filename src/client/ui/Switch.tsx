// Interrupteur : un bouton à deux états (activé / coupé), pour les options.
import type { JSX } from 'preact'
import { cx } from './cx.ts'

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }): JSX.Element {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} class={cx('switch', on && 'on')} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}
