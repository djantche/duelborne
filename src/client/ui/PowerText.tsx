// Gros texte « de puissance » : chiffre ou mot épais, doré, extrudé, avec rayons et onde de choc derrière.
// Le composant ne bouge pas seul : screens/duel/throw.tsx lui donne son coup de marteau (slam).
import type { JSX } from 'preact'
import { cx } from './cx.ts'

export type Tint = 'gold' | 'silver' | 'fire'

export function PowerText({ text, tint = 'gold', size, class: cls }: { text: string; tint?: Tint; size?: number; class?: string }): JSX.Element {
  return (
    <div class={cx('power', `tint-${tint}`, cls)} style={size ? `--ps:${size}px` : undefined}>
      <i class="power-rays" />
      <i class="power-ring" />
      <b class="power-text" data-text={text}>
        {text}
      </b>
    </div>
  )
}
