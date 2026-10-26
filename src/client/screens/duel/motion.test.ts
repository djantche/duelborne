import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flightPath, MOTION } from './motion.ts'
import type { MotionKind } from './motion.ts'

test('tous les mouvements partent et arrivent exactement aux places et orientations demandées', () => {
  for (const kind of Object.keys(MOTION) as MotionKind[]) {
    for (const [dx, dy, scale, fromAngle, toAngle] of [[340, -270, 0.55, 90, 0], [-610, 250, 1.8, -8, 90], [0, 0, 1, 90, 90]]) {
      const path = flightPath(dx!, dy!, scale!, kind, 80, fromAngle!, toAngle!, true)
      const first = path[0]!
      const last = path.at(-1)!
      assert.deepEqual([first.x, first.y, first.scale, first.angle], [dx, dy, scale, fromAngle], kind)
      assert.deepEqual([last.x, last.y, last.scale, last.angle], [0, 0, 1, toAngle], kind)
      assert.ok(path.every((p) => p.scale > 0 && [p.x, p.y, p.angle, p.height].every(Number.isFinite)), kind)
      assert.ok(path.every((p, i) => i === 0 || p.offset > path[i - 1]!.offset), kind)
    }
  }
})

test('les vols courts sur la même pile restent visibles sans sauter à une autre pile', () => {
  const path = flightPath(0, 0, 1, 'banish', 32)
  assert.ok(path.some((p) => p.y < -25))
  assert.ok(path.every((p) => p.x === 0))
  assert.equal(path.at(-1)!.y, 0)
})

test('la défense est atteinte progressivement pendant le trajet', () => {
  const path = flightPath(-300, 100, 1, 'set', 50, 0, 90)
  assert.ok(path.some((p) => p.angle > 20 && p.angle < 75))
  assert.equal(path.at(-1)!.angle, 90)
})
