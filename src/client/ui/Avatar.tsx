// Avatar d'un duelliste : l'illustration d'une carte choisie, l'icône d'ordinateur pour l'IA, sinon son initiale.
import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { imgUrl } from './cardview.ts'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'

export interface AvatarProps {
  /** Carte dont l'illustration sert d'avatar ; null : aucune. */
  card: number | null
  /** Nom du duelliste : son initiale remplace l'illustration absente. */
  name: string
  bot?: boolean
  class?: string
}

/** Décoratif : le nom du duelliste est toujours écrit à côté. */
export function Avatar({ card, name, bot, class: cls }: AvatarProps): JSX.Element {
  const [broken, setBroken] = useState<number | null>(null)
  const art = !bot && card !== null && broken !== card
  return (
    <span class={cx('avatar', bot && 'bot', cls)} aria-hidden="true">
      {bot ? <Icon name="computer" />
        : art ? <img src={imgUrl(card)} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(card)} />
          : <b>{[...name.trim()][0]?.toUpperCase() ?? '?'}</b>}
    </span>
  )
}
