// Les trois cartes du pierre-feuille-ciseaux, sur le gabarit des vraies cartes du jeu (voir Card.tsx et card.css) : la Pierre
// est un monstre (cadre orange, attribut TERRE, quatre étoiles), la Feuille une carte Magie (cadre vert), les Ciseaux une
// carte Piège (cadre violet). Illustrations en SVG (aucune image à charger) ; le dos est celui des cartes du jeu.
import type { JSX } from 'preact'
import type { Hand } from '../../shared/protocol.ts'
import { HANDS } from '../../shared/rps.ts'
import { t } from '../i18n.ts'
import { toDom } from './Card.tsx'
import { cx } from './cx.ts'
import { Icon } from './Icon.tsx'
import type { IconName } from './Icon.tsx'

/** Illustrations (viewBox 100 × 100). Les dégradés ont des noms propres à chaque main : deux copies d'une même carte s'accordent. */
const ART: Record<Hand, JSX.Element> = {
  // Pierre : un poing de roche aux runes ardentes, devant un canyon au couchant.
  0: (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="rps0-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffcf7a" />
          <stop offset="0.5" stop-color="#d0632c" />
          <stop offset="1" stop-color="#3c160c" />
        </linearGradient>
        <radialGradient id="rps0-glow" cx="0.5" cy="0.55" r="0.5">
          <stop offset="0" stop-color="#ffe2a0" stop-opacity="0.95" />
          <stop offset="1" stop-color="#ffb347" stop-opacity="0" />
        </radialGradient>
        <linearGradient id="rps0-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#c9b8a0" />
          <stop offset="0.55" stop-color="#8a7560" />
          <stop offset="1" stop-color="#4a3a2c" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#rps0-sky)" />
      <path d="M0 74 L14 58 L24 66 L40 48 L56 64 L70 52 L86 62 L100 50 V100 H0Z" fill="#5c2814" />
      <path d="M0 86 L20 76 L38 84 L60 74 L80 82 L100 76 V100 H0Z" fill="#2e120a" />
      <circle cx="51" cy="54" r="38" fill="url(#rps0-glow)" />
      <g stroke="#24140a" stroke-width="2" stroke-linejoin="round">
        <path d="M26 72 L28 46 Q30 36 40 36 L68 36 Q77 36 77 46 L77 64 Q76 78 62 81 L40 83 Q28 83 26 72Z" fill="url(#rps0-stone)" />
        <path d="M32 38 Q32 31 38 31 L44 31 Q49 31 49 37 L49 48 L32 48Z" fill="#b9a68c" />
        <path d="M49 37 Q49 30 55 30 L61 30 Q66 30 66 36 L66 48 L49 48Z" fill="#a8957c" />
        <path d="M66 38 Q66 32 71 32 Q76 32 76 38 L76 50 L66 50Z" fill="#94816a" />
        <path d="M26 56 Q16 54 16 64 Q18 74 32 72 L36 62Z" fill="#9c8870" />
        <path d="M44 56 L50 63 L46 70" fill="none" stroke="#3a2614" stroke-width="1.6" />
        <path d="M62 52 L58 60" fill="none" stroke="#3a2614" stroke-width="1.6" />
      </g>
      <path d="M36 72 L44 64 L52 72 L60 64 L68 72" fill="none" stroke="#ffb347" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M36 72 L44 64 L52 72 L60 64 L68 72" fill="none" stroke="#fff3c4" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
      <g fill="#6e5a46" stroke="#24140a" stroke-width="1.2">
        <path d="M12 30 l5 -3 4 4 -3 4 -5 -1z" />
        <path d="M84 24 l4 -2 3 4 -3 3 -4 -1z" />
        <path d="M88 40 l3 -1 2 3 -2 2 -3 -1z" />
      </g>
    </svg>
  ),
  // Feuille : un parchemin de sortilège déroulé sur un cercle de runes vertes.
  1: (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="rps1-bg" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0" stop-color="#3fe6c0" />
          <stop offset="0.45" stop-color="#127a6a" />
          <stop offset="1" stop-color="#062a2a" />
        </radialGradient>
        <linearGradient id="rps1-paper" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e8d8a8" />
          <stop offset="0.5" stop-color="#fff4d0" />
          <stop offset="1" stop-color="#d8c290" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#rps1-bg)" />
      <g fill="none" stroke="#9ffff0" stroke-opacity="0.75">
        <circle cx="50" cy="50" r="40" stroke-width="1.4" />
        <circle cx="50" cy="50" r="33" stroke-width="0.8" stroke-dasharray="3 3" />
        <path d="M50 10 L84 70 L16 70Z" stroke-width="1" />
        <path d="M50 90 L16 30 L84 30Z" stroke-width="1" />
      </g>
      <g transform="rotate(-8 50 52)" stroke="#3a2a12" stroke-width="1.6" stroke-linejoin="round">
        <rect x="30" y="24" width="40" height="56" fill="url(#rps1-paper)" />
        <rect x="26" y="19" width="48" height="8" rx="4" fill="#c9a860" />
        <rect x="26" y="77" width="48" height="8" rx="4" fill="#b8944c" />
        <path d="M37 36 H63 M37 43 H63 M37 50 H55 M37 66 H63 M37 72 H58" stroke="#8a6a3a" stroke-width="1.6" stroke-linecap="round" />
        <path d="M55 52 L58 58 L64 59 L59 63 L60 69 L55 66 L50 69 L51 63 L46 59 L52 58Z" fill="#2fe0b0" stroke="#0c6957" stroke-width="1.2" />
      </g>
      <g fill="#e8fffa">
        <path d="M18 22 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z" />
        <path d="M82 76 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2z" />
        <path d="M80 18 l1 2.4 2.4 1 -2.4 1 -1 2.4 -1 -2.4 -2.4 -1 2.4 -1z" />
      </g>
    </svg>
  ),
  // Ciseaux : deux lames croisées, une aura violette, des éclairs.
  2: (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id="rps2-bg" cx="0.5" cy="0.45" r="0.7">
          <stop offset="0" stop-color="#ff7ad8" />
          <stop offset="0.4" stop-color="#7a1f6a" />
          <stop offset="1" stop-color="#1a0620" />
        </radialGradient>
        <linearGradient id="rps2-blade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="0.5" stop-color="#cfd6e6" />
          <stop offset="1" stop-color="#7a849a" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#rps2-bg)" />
      <g fill="none" stroke="#ffc6f2" stroke-width="1.4" stroke-linejoin="round" stroke-opacity="0.8">
        <path d="M8 20 L18 30 L12 34 L24 46" />
        <path d="M92 18 L82 28 L88 32 L76 44" />
      </g>
      <g stroke="#1c0e22" stroke-width="2" stroke-linejoin="round">
        <path d="M50 52 L20 10 L28 6 L56 46Z" fill="url(#rps2-blade)" />
        <path d="M50 52 L80 10 L72 6 L44 46Z" fill="url(#rps2-blade)" />
        <path d="M50 52 L34 74" stroke-width="5" stroke-linecap="round" />
        <path d="M50 52 L66 74" stroke-width="5" stroke-linecap="round" />
        <circle cx="30" cy="80" r="9" fill="none" stroke="#e8304f" stroke-width="5" />
        <circle cx="70" cy="80" r="9" fill="none" stroke="#e8304f" stroke-width="5" />
        <circle cx="50" cy="51" r="4" fill="#ffd76a" />
      </g>
      <path d="M24 12 L48 46" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
      <path d="M76 12 L52 46" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
    </svg>
  ),
}

/** Le gabarit de chaque main : cadre, orbe d'attribut, étoiles (monstre) ou mention Magie / Piège. */
const KIND: Record<Hand, { frame: string; orb: string; icon: IconName }> = {
  0: { frame: 'effect', orb: 'earth', icon: 'EARTH' },
  1: { frame: 'spell', orb: 'spell', icon: 'spark' },
  2: { frame: 'trap', orb: 'trap', icon: 'trap' },
}
const NAME = { 0: 'rps.rock', 1: 'rps.paper', 2: 'rps.scissors' } as const
const BEATS = { 0: 'rps.rockBeats', 1: 'rps.paperBeats', 2: 'rps.scissorsBeats' } as const

/** Nom d'une main, dans la langue du joueur. */
export const handName = (h: Hand): string => t(NAME[h])

/** La face d'une carte : une vraie carte du jeu (ou « ? » pour une main encore inconnue). */
function Front({ hand }: { hand: Hand | null }): JSX.Element {
  if (hand === null) return <div class="rps-unknown">?</div>
  const k = KIND[hand]
  return (
    <div class={`card md rps-front frame-${k.frame}`}>
      <div class="c-in">
        <div class="c-name">
          <span>{handName(hand)}</span>
          <i class={`orb orb-${k.orb}`}>
            <Icon name={k.icon} />
          </i>
        </div>
        {hand === 0 ? (
          <div class="c-stars">
            {[0, 1, 2, 3].map((i) => (
              <i key={i}>★</i>
            ))}
          </div>
        ) : (
          <div class="c-kind">{hand === 1 ? t('card.spellCard') : t('card.trapCard')}</div>
        )}
        <div class="c-art rps-art">{ART[hand]}</div>
        <div class="c-box">
          <div class="rps-beats">{t(BEATS[hand])}</div>
        </div>
      </div>
    </div>
  )
}

export function RpsCard({ hand, up, side, class: cls }: { hand: Hand | null; up?: boolean; side?: 'me' | 'foe'; class?: string }): JSX.Element {
  return (
    <div class={cx('rps-card', up && 'up', cls)} data-hand={hand ?? '?'} data-side={side}>
      <div class="rps-flip">
        <div class="rps-face front">
          <Front hand={hand} />
        </div>
        <div class="rps-face back">
          <div class="c-back" />
        </div>
      </div>
    </div>
  )
}

/** Une carte, en élément DOM (pour les effets, dessinés hors de l'interface). */
export const rpsCardEl = (h: Hand | null, o: { up?: boolean; side?: 'me' | 'foe'; cls?: string } = {}): HTMLElement => toDom(<RpsCard hand={h} up={o.up} side={o.side} class={o.cls} />)

/** Les trois cartes à choisir. `picked` : celle qu'on a jouée (les autres s'effacent). */
export function RpsChoices({ onPick, picked, disabled, order = HANDS }: { onPick: (h: Hand) => void; picked?: Hand | null; disabled?: boolean; order?: readonly Hand[] }): JSX.Element {
  return (
    <div class="rps-hand">
      {order.map((h) => (
        <button type="button" key={h} class={cx('rps-choice', picked === h && 'on', picked != null && picked !== h && 'off')} data-act="rps" data-hand={h} disabled={disabled} onClick={() => onPick(h)} aria-label={handName(h)}>
          <RpsCard hand={h} up />
        </button>
      ))}
    </div>
  )
}
