// Dé et pièce en 3D, faits de HTML et de CSS (transformations 3D) : aucun fichier image.
//
//   <Die value={5} />        un dé posé, montrant la face 5
//   <Coin heads />           une pièce posée, côté Face (heads) ou Pile
//
// Ils ne bougent pas d'eux-mêmes : screens/duel/throw.tsx les lance (animation du cube autour de ses axes).
// La taille se règle avec --s (en pixels) sur le parent ou la prop `size`.
import type { JSX } from 'preact'
import { cx } from './cx.ts'
import { t } from '../i18n.ts'

/** Places des points sur une grille de 3×3 (0 = haut gauche, 8 = bas droite). */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

/** Face tournée vers le joueur → rotation du cube (X puis Y, en degrés). Faces opposées : 1-6, 2-5, 3-4. */
const FACING: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  2: { x: 0, y: -90 },
  5: { x: 0, y: 90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
}

/** Inclinaison au repos : le dé montre trois de ses faces, comme posé sur une table vu de haut. */
export const DIE_TILT = 'rotateX(-24deg) rotateY(-30deg)'

/**
 * Transformation du cube pour montrer `value`, avec des tours en plus (`spin`) pour un départ de lancer.
 * `flat` : vu de dessus (la face montrée est tournée droit vers l'œil), sans l'inclinaison de repos.
 */
export function dieTransform(value: number, spin = { x: 0, y: 0, z: 0 }, flat = false): string {
  const f = FACING[value] ?? FACING[1]!
  return `${flat ? '' : `${DIE_TILT} `}rotateX(${f.x + spin.x}deg) rotateY(${f.y + spin.y}deg) rotateZ(${spin.z}deg)`
}

export function Die({ value, size, class: cls, tilt = true }: { value: number; size?: number; class?: string; tilt?: boolean }): JSX.Element {
  const faces: [number, string][] = [
    [1, 'front'],
    [6, 'back'],
    [2, 'right'],
    [5, 'left'],
    [3, 'top'],
    [4, 'bottom'],
  ]
  return (
    <div class={cx('die3d', cls)} style={size ? `--s:${size}px` : undefined} role="img" aria-label={t('fx.dieLabel', { n: value })}>
      <div class="die-cube" style={`transform:${dieTransform(value, undefined, !tilt)}`}>
        {faces.map(([n, side]) => (
          <div key={n} class={`die-face ${side}`}>
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} class={PIPS[n]?.includes(i) ? 'on' : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Orientation de la pièce : Face (heads) = 0°, Pile = 180° autour de l'axe horizontal. Vue de face, sans inclinaison. */
export const coinTransform = (heads: boolean, spin = 0, flat = false): string => `${flat ? '' : 'rotateY(-20deg) '}rotateX(${(heads ? 0 : 180) + spin}deg)`

/** Nombre de lamelles qui forment la tranche de la pièce. */
const EDGE = 30

/**
 * Dessin du revers (« Pile ») : un blason original, des anneaux et une étoile à huit branches.
 * Le droit (« Face ») est l'illustration du Kuriboh, lue dans les données du joueur (data/, hors dépôt) par le CSS.
 */
function Emblem(): JSX.Element {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg class="coin-emblem" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="2.4" />
      <circle cx="50" cy="50" r="39" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.6 3.2" />
      {rays.map((a) => (
        <path key={a} d={a % 90 === 0 ? 'M50 50 44 31 50 8 56 31Z' : 'M50 50 46.5 36 50 24 53.5 36Z'} transform={`rotate(${a} 50 50)`} fill="currentColor" opacity={a % 90 === 0 ? 1 : 0.75} />
      ))}
      <circle cx="50" cy="50" r="9" fill="none" stroke="currentColor" stroke-width="3" />
      <circle cx="50" cy="50" r="3.6" fill="currentColor" />
    </svg>
  )
}

export function Coin({ heads, size, class: cls }: { heads: boolean; size?: number; class?: string }): JSX.Element {
  return (
    <div class={cx('coin3d', cls)} style={size ? `--s:${size}px` : undefined} role="img" aria-label={heads ? t('fx.coinHeads') : t('fx.coinTails')}>
      <div class="coin-body" style={`transform:${coinTransform(heads)}`}>
        <div class="coin-side heads">
          <b class="coin-art" />
        </div>
        <div class="coin-side tails">
          <Emblem />
        </div>
        {Array.from({ length: EDGE }, (_, i) => (
          <i key={i} class="coin-edge" style={`--a:${(i * 360) / EDGE}deg`} />
        ))}
      </div>
    </div>
  )
}
