// Audit du moteur : joue des duels d'ordinateurs avec tous les decks et recense ce que le moteur demande ou signale,
// pour repérer les messages que le serveur ignore ou auxquels il répond à la place du joueur.
//   node tools/audit/messages.ts [nombre de parties par deck]
import { Bot } from '../../src/server/ai/bot.ts'
import { loadData } from '../../src/server/ocg/data.ts'
import { loadDecks } from '../../src/server/ocg/decks.ts'
import type { DeckList } from '../../src/server/ocg/decks.ts'
import { Duel } from '../../src/server/ocg/duel.ts'
import type { Seat } from '../../src/shared/protocol.ts'
import { OcgMessageType } from '../../vendor/ocgcore/dist/index.js'

loadData()
const names = new Map(Object.entries(OcgMessageType).map(([k, v]) => [v as number, k]))
const seen = new Map<string, number>()
const samples = new Map<string, unknown>()
Duel.trace = (m) => {
  const name = names.get(m.type) ?? String(m.type)
  seen.set(name, (seen.get(name) ?? 0) + 1)
  const interesting = ['SELECT_SUM', 'SELECT_TRIBUTE', 'SELECT_COUNTER', 'SORT_CARD', 'SORT_CHAIN', 'ANNOUNCE_CARD', 'ANNOUNCE_NUMBER', 'ANNOUNCE_RACE', 'ANNOUNCE_ATTRIB', 'SELECT_DISFIELD', 'SELECT_PLACE', 'ROCK_PAPER_SCISSORS', 'SELECT_POSITION', 'SWAP', 'SWAP_GRAVE_DECK', 'REVERSE_DECK', 'DECK_TOP', 'FIELD_DISABLED', 'MISSED_EFFECT', 'TOSS_COIN', 'TOSS_DICE', 'CARD_SELECTED', 'RANDOM_SELECTED']
  if (interesting.includes(name) && !samples.has(name)) samples.set(name, JSON.stringify(m, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)).slice(0, 600))
  if (name === 'SELECT_SUM' && (m as { selects_must: unknown[] }).selects_must.length && !samples.has('SELECT_SUM+must')) samples.set('SELECT_SUM+must', JSON.stringify(m, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)).slice(0, 900))
}

const per = Number(process.argv[2] ?? 1)
const decks = [...loadDecks().values()]
let duels = 0
let refused = 0
for (let d = 0; d < decks.length; d++) {
  for (let k = 0; k < per; k++) {
    const duel = await Duel.create([decks[d] as DeckList, decks[(d + 5 + k) % decks.length] as DeckList], ((d + k) % 2) as Seat, { seed: BigInt(d * 7 + k + 1) })
    const bots = [new Bot(0), new Bot(1)]
    let attempt = 0
    duel.start()
    for (let i = 0; i < 4000 && !duel.finished; i++) {
      const w = duel.waiting
      if (!w) break
      const before = duel.refused
      const value = (bots[w.seat] as Bot).choose(duel.currentView(w.seat), attempt)
      if (value === undefined) break
      const next = duel.answer(w.seat, w.prompt.id, value)
      attempt = typeof next === 'string' || duel.refused > before ? attempt + 1 : 0
    }
    refused += duel.refused
    duels++
    duel.destroy()
  }
}
console.log(`${duels} duels, ${refused} réponses refusées par le moteur`)
console.log([...seen].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '))
for (const [k, v] of samples) console.log(`\n# ${k}\n${v}`)
