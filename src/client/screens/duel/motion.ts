import type { MoveKind } from '../../../shared/protocol.ts'

export type MotionKind = MoveKind | 'draw' | 'deal' | 'summon' | 'set' | 'transfer' | 'control' | 'detach'

/** Une signature de vol par action : durée, hauteur, inclinaison et courbure latérale. */
export const MOTION: Record<MotionKind, { color: string; duration: number; lift: number; bank: number; bend: number }> = {
  draw:     { color: '#8fd8ff', duration: 520, lift: 0.14, bank: 7, bend: 0.04 },
  deal:     { color: '#c9eaff', duration: 440, lift: 0.10, bank: 4, bend: 0.02 },
  summon:   { color: '#ffd76a', duration: 680, lift: 0.28, bank: 8, bend: 0.06 },
  set:      { color: '#9baaff', duration: 580, lift: 0.12, bank: 5, bend: 0.03 },
  discard:  { color: '#ff8b78', duration: 640, lift: 0.12, bank: 19, bend: 0.10 },
  mill:     { color: '#c9a6ff', duration: 500, lift: 0.08, bank: 10, bend: 0.03 },
  toGrave:  { color: '#c4cfee', duration: 660, lift: 0.18, bank: 6, bend: 0.05 },
  banish:   { color: '#be98ff', duration: 680, lift: 0.24, bank: 24, bend: 0.13 },
  toHand:   { color: '#8fd0ff', duration: 650, lift: 0.25, bank: -9, bend: -0.08 },
  toDeck:   { color: '#ffe08a', duration: 620, lift: 0.16, bank: -13, bend: -0.07 },
  toExtra:  { color: '#b9acff', duration: 680, lift: 0.22, bank: 13, bend: 0.09 },
  material: { color: '#ffd76a', duration: 580, lift: 0.20, bank: 28, bend: 0.18 },
  detach:   { color: '#ffe9a8', duration: 660, lift: 0.24, bank: -18, bend: -0.12 },
  toField:  { color: '#9af0d2', duration: 660, lift: 0.26, bank: -7, bend: -0.06 },
  create:   { color: '#9fe8ff', duration: 560, lift: 0.20, bank: 0, bend: 0 },
  transfer: { color: '#b9d6ff', duration: 580, lift: 0.12, bank: 5, bend: 0.03 },
  control:  { color: '#d3a4ff', duration: 760, lift: 0.30, bank: -15, bend: -0.15 },
}

export interface FlightPoint {
  offset: number
  x: number
  y: number
  scale: number
  angle: number
  height: number
}

/** Coordonnées relatives à l'arrivée ; les deux extrémités gardent exactement leur place et leur orientation. */
export function flightPath(dx: number, dy: number, scale: number, kind: MotionKind, lift: number, fromAngle = 0, toAngle = 0, impact = false): FlightPoint[] {
  const style = MOTION[kind]
  const distance = Math.hypot(dx, dy)
  const direction = dx < 0 ? -1 : 1
  const bend = Math.min(80, distance * Math.abs(style.bend)) * Math.sign(style.bend)
  const steps = [[0, 0], [0.14, 0.08], [0.44, 0.44], [0.76, 0.85], [0.91, 0.98], [0.96, 1], [1, 1]] as const
  const progressAt = (t: number): number => {
    let i = 0
    while (i < steps.length - 2 && t > steps[i + 1]![0]) i++
    const [x0, y0] = steps[i]!, [x1, y1] = steps[i + 1]!
    const left = steps[Math.max(0, i - 1)]!, right = steps[Math.min(steps.length - 1, i + 2)]!
    const span = x1 - x0, u = (t - x0) / span
    const m0 = (y1 - left[1]) / (x1 - left[0]), m1 = (right[1] - y0) / (right[0] - x0)
    return Math.max(0, Math.min(1, (2*u*u*u - 3*u*u + 1)*y0 + (u*u*u - 2*u*u + u)*span*m0 + (-2*u*u*u + 3*u*u)*y1 + (u*u*u - u*u)*span*m1))
  }
  return Array.from({ length: 61 }, (_, i) => {
    const offset = i / 60, progress = progressAt(offset)
    const arc = progress === 0 || progress === 1 ? 0 : Math.sin(Math.PI * progress)
    return {
      offset,
      x: (dx * (1 - progress) + (distance ? -dy / distance * bend * arc : 0)) || 0,
      y: (dy * (1 - progress) - lift * arc + (distance ? dx / distance * bend * arc : 0)) || 0,
      scale: scale + (1 - scale) * progress + arc * 0.10 - (impact ? .035 : .012) * (offset > .91 ? Math.sin(Math.PI * Math.min(1, (offset - .91) / .09)) ** 2 : 0),
      angle: fromAngle + (toAngle - fromAngle) * progress + style.bank * direction * arc,
      height: lift * arc,
    }
  })
}
