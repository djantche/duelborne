// Petites icônes SVG dessinées pour le projet (viewBox 24×24, couleur = currentColor).
import type { JSX } from 'preact'

/** [style, tracé] : « fill » = forme pleine, « line » = trait. */
const PATHS = {
  sword: ['fill', 'M20.6 2 22 3.4 21.3 8 11.6 17.7l1.6 1.6-1.5 1.5-2.4-2.4-3 3-1.6.2.2-1.6 3-3-2.4-2.4 1.5-1.5 1.6 1.6L18.3 5 16 2.7 20.6 2Z'],
  shield: ['fill', 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 2.2 6 2.2V11c0 3.9-2.5 7.4-6 8.8V4.2Z'],
  rotate: ['line', 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5'],
  cardBack: ['line', 'M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM12 8l3 4-3 4-3-4 3-4Z'],
  cardUp: ['line', 'M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5ZM12 16.5v-8m0 0-3 3m3-3 3 3'],
  summon: ['line', 'M12 20V5m0 0-6 6m6-6 6 6'],
  set: ['line', 'M12 4v15m0 0-6-6m6 6 6-6'],
  flip: ['line', 'M4 8h13l-3-3M20 16H7l3 3'],
  spark: ['fill', 'M12 1.5l2.5 8L22.5 12l-8 2.5-2.5 8-2.5-8-8-2.5 8-2.5 2.5-8Z'],
  target: ['line', 'M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  star: ['fill', 'M12 2l2.9 6.4 7 .8-5.2 4.7 1.4 6.9L12 17.3l-6.1 3.5 1.4-6.9L2.1 9.2l7-.8L12 2Z'],
  fullscreen: ['line', 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'],
  close: ['line', 'M6 6l12 12M18 6 6 18'],
  check: ['line', 'M5 12.5l4.5 4.5L19 7'],
  log: ['line', 'M5 6h14M5 12h14M5 18h9'],
  flag: ['line', 'M5 21V4m0 1h11l-2 4 2 4H5'],
  up: ['line', 'M5 15l7-7 7 7'],
  down: ['line', 'M5 9l7 7 7-7'],
  back: ['line', 'M15 5l-7 7 7 7'],
  next: ['line', 'M9 5l7 7-7 7'],
  keyboard: ['line', 'M3.5 6h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6'],
  info: ['line', 'M12 11v6m0-9.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'],
  computer: ['line', 'M4 3.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1ZM8 21h8m-4-4.5V21M7 8l3 2-3 2m5 0h5'],
  bolt: ['line', 'm13.5 2-9 12h7L10.5 22l9-12h-7l1-8Z'],
  history: ['line', 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2'],
  undo: ['line', 'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6v2'],
  redo: ['line', 'm15 5 6 6-6 6m6-6H10a6 6 0 0 0-6 6v2'],
  search: ['line', 'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5'],
  download: ['line', 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5'],
  shuffle: ['line', 'm17 3 4 4-4 4M3 7h3l12 10h3m-4 4 4-4-4-4M3 17h3l3-3m6-4 3-3h3'],
  image: ['line', 'M3 4h18v16H3Zm0 12 5-5 5 5 3-3 5 5M16 8h.01'],
  play: ['line', 'm8 4 12 8-12 8V4Z'],
  pause: ['line', 'M7 4h3v16H7zm7 0h3v16h-3z'],
  first: ['line', 'M4 5v14m15-14L8 12l11 7V5Z'],
  trash: ['line', 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'],
  filter: ['line', 'M4 7h16M7 12h10M10 17h4'],
  users: ['line', 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6M2.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 14.5c2.7 0 4.9 1.5 5.5 4.5'],
  team: ['line', 'M7 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm10 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 18c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4m1 0c.4-2.6 2.2-4 4.5-4s4.1 1.4 4.5 4M12 4v16'],
  sound: ['line', 'M4 9v6h4l5 4V5L8 9H4Zm12.5 1a3.5 3.5 0 0 1 0 4M18.5 7.5a7 7 0 0 1 0 9'],
  mute: ['line', 'M4 9v6h4l5 4V5L8 9H4ZM16 9.5l5 5m0-5-5 5'],
  gear: ['line', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-2.5a7.6 7.6 0 0 0 0-1l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 1l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z'],
  hand: ['line', 'M6 20V9m4 11V5m4 15V7m4 13V11M6 20h12'],
  grave: ['line', 'M7 21V10a5 5 0 0 1 10 0v11H7Zm5-14v6m-2.5-3h5'],
  banish: ['line', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM6 18 18 6'],
  deck: ['line', 'M7 8h12v12H7zM5 16V4h12'],
  field: ['line', 'M3 6h18v12H3zM3 12h18M9 6v12'],
  trap: ['fill', 'M12 2.5 22.5 21h-21L12 2.5Zm0 5.2L6.3 18h11.4L12 7.7Z'],
  // Attributs de monstre
  DARK: ['fill', 'M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z'],
  FIRE: ['fill', 'M12.5 2c.6 3.6 5 5.6 5 10.6a5.5 5.5 0 0 1-11 0c0-2 .9-3.4 2-4.5.2 1.7.9 2.6 2 3C9.9 8.2 10.8 5 12.5 2Z'],
  WATER: ['fill', 'M12 2.5c3.6 4.6 6 7.7 6 11.1a6 6 0 0 1-12 0c0-3.4 2.4-6.5 6-11.1Z'],
  EARTH: ['fill', 'M1.5 19.5 9 6l4 7 2.6-3.6 6.9 10.1h-21Z'],
  WIND: ['line', 'M3 9h10.5a3 3 0 1 0-3-3M3 14.5h14.5a3 3 0 1 1-3 3M3 11.8h6'],
  DIVINE: ['fill', 'M12 2l2.9 6.4 7 .8-5.2 4.7 1.4 6.9L12 17.3l-6.1 3.5 1.4-6.9L2.1 9.2l7-.8L12 2Z'],
} as const satisfies Record<string, readonly ['fill' | 'line', string]>

export type IconName = keyof typeof PATHS | 'LIGHT'

export const isIcon = (name: string): name is IconName => name === 'LIGHT' || name in PATHS

export function Icon({ name }: { name: IconName }): JSX.Element {
  if (name === 'LIGHT') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="12" r="4.4" />
        <path stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    )
  }
  const [kind, d] = PATHS[name]
  if (kind === 'fill') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={d} />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
