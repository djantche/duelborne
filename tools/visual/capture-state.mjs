// Fige un état de duel IA contre IA (vue publique) dans native/godot/reference/duel-state.json.
// Le même état sert de référence au client web (tools/visual/reference-web.mjs) et au client Godot (--demo=…).
//   node tools/visual/capture-state.mjs [cartes-minimum-sur-le-terrain]
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { WebSocket } from 'ws'
import { PORT, sleep, startServer } from './cdp.mjs'

const want = Number(process.argv[2] ?? 7)
await startServer()
const ws = new WebSocket(`ws://localhost:${PORT}/ws`)
await new Promise((r) => ws.on('open', r))
const send = (m) => ws.send(JSON.stringify(m))
let best = null
let bestScore = -1
const score = (m) => m.view.players.reduce((n, p) => n + p.monsters.filter(Boolean).length + p.spellTraps.filter(Boolean).length + (p.fieldZone ? 1 : 0) + Math.min(3, p.graveyard?.length ?? 0), 0)
ws.on('message', (d) => {
  const m = JSON.parse(d)
  if (m.t === 'lobby') send({ t: 'ready', ready: true })
  if (m.t === 'state' && m.view?.players) {
    const s = score(m)
    if (s > bestScore) { best = m; bestScore = s }
  }
})
send({ t: 'hello', name: 'Reference' })
await sleep(500)
send({ t: 'play', mode: 'aivai' })
for (let i = 0; i < 240 && bestScore < want; i++) await sleep(500)
console.log('score', bestScore)
if (best) {
  best.events = []
  best.timer = null
  const file = path.resolve(import.meta.dirname, '../../native/godot/reference/duel-state.json')
  writeFileSync(file, JSON.stringify(best))
  console.log('écrit', file, JSON.stringify(best).length, 'octets')
}
process.exit(best ? 0 : 1)
