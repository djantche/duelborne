// Un nombre d'ATK ou de DEF qui s'anime quand il change : il défile de l'ancienne à la nouvelle valeur et clignote
// (vert quand il monte, rouge quand il baisse). La valeur précédente est gardée par carte (uid) hors du composant :
// le terrain est reconstruit à chaque état, un état local serait perdu.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { stat } from './cardview.ts'

const last = new Map<string, number | null>()
const DURATION = 650

export function Stat({ id, value, class: cls }: { id: string; value: number | null; class?: string }): JSX.Element {
  // Valeur affichée : on part de la précédente connue de cette carte.
  const before = last.get(id)
  const [shown, setShown] = useState<number | null>(before ?? value)
  const [dir, setDir] = useState<'up' | 'down' | ''>('')
  const timer = useRef(0)
  useEffect(() => {
    const from = last.get(id)
    last.set(id, value)
    cancelAnimationFrame(timer.current)
    if (from === undefined || from === null || value === null || from === value) {
      setShown(value)
      return
    }
    const rising = value > from
    setDir(rising ? 'up' : 'down')
    const start = performance.now()
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / DURATION)
      const eased = 1 - (1 - t) ** 3
      setShown(Math.round(from + (value - from) * eased))
      if (t < 1) timer.current = requestAnimationFrame(tick)
      else window.setTimeout(() => setDir(''), 250)
    }
    timer.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(timer.current)
  }, [value, id])
  return <span class={`stat-num ${cls ?? ''} ${dir ? `bump-${dir}` : ''}`}>{stat(shown)}</span>
}
