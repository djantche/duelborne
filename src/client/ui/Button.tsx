// Boutons de l'application. Tous passent par ici : même apparence, même son, mêmes états partout.
import type { ComponentChildren, JSX } from 'preact'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './Icon.tsx'

type Native = Omit<JSX.IntrinsicElements['button'], 'icon' | 'size'>

export interface ButtonProps extends Native {
  /** primary : action principale (dorée) · danger : action à risque (rouge au survol). */
  variant?: 'primary' | 'danger'
  small?: boolean
  /** Icône placée avant le texte. */
  icon?: IconName
  /** Nom stable du bouton (attribut data-act), pour le retrouver dans les tests visuels. */
  act?: string
  children?: ComponentChildren
}

export function Button({ variant, small, icon, act, class: cls, children, ...rest }: ButtonProps): JSX.Element {
  return (
    <button type="button" {...rest} class={cx('btn', variant, small && 'small', cls as string | undefined)} data-act={act}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

export interface IconButtonProps extends Native {
  icon: IconName
  /** Texte de l'infobulle, lu aussi par les lecteurs d'écran. */
  label: string
  variant?: 'danger'
  act?: string
}

/** Bouton carré qui ne montre qu'une icône. */
export function IconButton({ icon, label, variant, act, class: cls, ...rest }: IconButtonProps): JSX.Element {
  return (
    <button type="button" {...rest} class={cx('btn icon', variant, cls as string | undefined)} data-act={act} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  )
}
