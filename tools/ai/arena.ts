// Fait s'affronter deux niveaux de l'ordinateur et compte les victoires (chacun commence une partie sur deux).
//   node tools/ai/arena.ts [niveau A] [niveau B] [parties] [deck A] [deck B]
//   ex. node tools/ai/arena.ts normal easy 10 joey kaiba
// ARENA_SCRIPTS=A|B|AB retire les scripts de deck (src/server/ai/playbooks) à A, à B ou aux deux, pour mesurer ce qu'ils apportent :
//   ARENA_SCRIPTS=B node tools/ai/arena.ts normal normal 8 yubel yubel
// Sans decks : chaque partie prend deux decks parmi ceux importés par le joueur (decks/user/, page Mon Deck), plus
// complexes que les decks de base ; s'il n'y en a pas, parmi ceux du dossier decks/.
import type { AiLevel } from '../../src/shared/protocol.ts'
import { Computer } from '../../src/server/ai/computer.ts'
import { loadData } from '../../src/server/ocg/data.ts'
import { loadDecks } from '../../src/server/ocg/decks.ts'
import { Duel } from '../../src/server/ocg/duel.ts'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [levelA = 'normal', levelB = 'easy', count = '6', deckA, deckB] = process.argv.slice(2)
if (![levelA, levelB].every((l) => ['easy', 'normal', 'hard'].includes(l)) || !Number.isInteger(Number(count)) || Number(count) < 1) throw new Error('Niveaux : easy, normal, hard ; nombre de parties entier positif.')
loadData()
const decks = loadDecks()
for (const id of [deckA, deckB]) if (id && !decks.has(id)) throw new Error(`Deck inconnu : ${id}`)
// Une ancienne version copiée hors dépôt peut tenir B, avec exactement les mêmes graines et le même moteur.
const Reference: typeof Computer = process.env.ARENA_REFERENCE ? (await import(pathToFileURL(process.env.ARENA_REFERENCE).href)).Computer : Computer
const seed = BigInt(process.env.ARENA_SEED ?? '20261016')
const maxDecisions = Number(process.env.ARENA_MAX_DECISIONS ?? 1600)
const results: object[] = []
const imported = [...decks.keys()].filter((id) => id.startsWith('user-'))
const ids = imported.length >= 2 ? imported : [...decks.keys()]
/**
 * Équité : chaque paire de decks se joue 4 fois — chaque niveau avec chacun des deux decks, et chacun commence une fois.
 * ARENA_FROM=n commence à la n-ième partie (pour lancer plusieurs arènes en parallèle sur des paires différentes).
 */
const pairs = ids.flatMap((x, i) => ids.slice(i + 1).map((y) => [x, y] as const))
const from = Number(process.env.ARENA_FROM ?? 0)
const pick = (id: string | undefined, i: number, side: 0 | 1): string => {
  if (id) return id
  const pair = pairs[Math.floor(i / 4) % pairs.length] as readonly [string, string]
  return pair[(side + i) % 2] as string
}

const without = process.env.ARENA_SCRIPTS ?? ''
const score = { A: 0, B: 0, nul: 0 }
let decisions = 0
let thinking = 0
let slowest = 0
for (let g = from; g < from + Number(count); g++) {
  const a = pick(deckA, g, 0)
  const b = pick(deckB, g, 1)
  // Avec deux decks nommés, inverser qui commence à graine égale ; sinon, cycle équilibré sur quatre parties.
  const aPlace = deckA && deckB ? g % 2 : Math.floor(g / 2) % 2
  const players = [new Computer(levelA as AiLevel, { scripts: !without.includes('A') }), new Reference(levelB as AiLevel, { scripts: !without.includes('B') })]
  const byPlace = aPlace === 0 ? players : [players[1], players[0]]
  const lists = aPlace === 0 ? [decks.get(a), decks.get(b)] : [decks.get(b), decks.get(a)]
  const gameSeed = seed + BigInt(Math.floor(g / (deckA && deckB ? 2 : 4))) * 104729n + (deckA && deckB ? 0n : BigInt(g % 2) * 8191n)
  const duel = await Duel.create(lists as never, 0, { seed: gameSeed })
  duel.start()
  let attempts = 0
  for (let n = 0; n < maxDecisions && !duel.finished; n++) {
    const w = duel.waiting
    if (!w) break
    const who = byPlace[w.seat] as Computer
    const t = performance.now()
    const value = await who.choose(duel, w.seat, attempts)
    const dt = performance.now() - t
    if (who === players[0]) {
      decisions++
      thinking += dt
      slowest = Math.max(slowest, dt)
    }
    if (value === undefined) {
      duel.surrender(w.seat)
      break
    }
    const r = duel.answer(w.seat, w.prompt.id, value)
    attempts = typeof r === 'string' ? attempts + 1 : 0
    if (attempts > 30) {
      duel.surrender(w.seat)
      break
    }
  }
  const view = duel.currentView(0)
  const aWon = duel.winner === aPlace
  if (duel.winner === null || duel.winner === 'draw') score.nul++
  else if (aWon) score.A++
  else score.B++
  console.log(`partie ${g + 1} : A ${levelA} (${a}) contre B ${levelB} (${b}) → ${duel.winner === null ? 'inachevée' : duel.winner === 'draw' ? 'nul' : aWon ? 'A' : 'B'} au tour ${view.turn} · LP ${view.players[aPlace as 0 | 1].lp} / ${view.players[(1 - aPlace) as 0 | 1].lp}`)
  results.push({ game: g + 1, seed: String(gameSeed), deckA: a, deckB: b, aPlace, winner: duel.winner === null ? 'unfinished' : duel.winner === 'draw' ? 'draw' : aWon ? 'A' : 'B', turns: view.turn, refused: duel.refused, decisions: duel.answers })
  if (process.env.ARENA_JSON) writeFileSync(process.env.ARENA_JSON, JSON.stringify({ levelA, levelB, reference: process.env.ARENA_REFERENCE ?? null, score, results, decisions, meanMs: thinking / Math.max(1, decisions), maxMs: slowest }, null, 2))
  duel.destroy()
}
console.log(`\nA (${levelA}) ${score.A} · B (${levelB}) ${score.B} · nuls ou inachevées ${score.nul}`)
console.log(`réflexion de ${levelA} : ${decisions} décisions, ${(thinking / Math.max(1, decisions)).toFixed(0)} ms en moyenne, ${slowest.toFixed(0)} ms au plus`)
process.exit(0)
