// Prépare une base de démonstration pour l'écran des tournois : un compte « demo » avec des tournois solo et entre amis, en cours et terminés,
// dans les trois formules. Les résultats sont écrits comme le ferait un duel terminé (service de tournoi), sans lancer de duel.
//
//   DUEL_SAVE_DIR=/tmp/demo node tools/visual/seed-tournaments.ts      (puis démarrer le serveur sur le même dossier)
import { loadData } from '../../src/server/ocg/data.ts'
import { loadDecks } from '../../src/server/ocg/decks.ts'
import { FormatCatalog } from '../../src/server/formats/catalog.ts'
import { openStorage } from '../../src/server/store/index.ts'
import { createServices } from '../../src/server/services.ts'
import type { TournamentKind } from '../../src/shared/tournament.ts'

loadData()
const provided = loadDecks()
const storage = openStorage()
const services = createServices(storage, provided, new FormatCatalog().load())
const t = services.tournaments
const register = async (name: string): Promise<{ id: string; displayName: string }> => {
  const r = await services.accounts.register({ username: name, displayName: name[0]!.toUpperCase() + name.slice(1), password: 'motdepasse-solide-1' }, 'seed')
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r.user
}
const demo = await register('demo')
const friends = await Promise.all(['amy', 'bob', 'carl', 'dora'].map(register))
const DECK = '5ds-yusei-junk'

/** Joue un match : `wins` est la liste des vainqueurs (côté 0 = a, 1 = b) de chaque duel. */
function play(id: string, matchId: string, wins: (0 | 1)[]): void {
  const m = storage.tournaments.matchById(matchId)!
  const players = storage.tournaments.players(id)
  const info = (uid: string | null): { userId: string | null; bot: boolean } => ({ userId: players.find((p) => p.userId === uid)?.aiLevel ? null : uid, bot: !!players.find((p) => p.userId === uid)?.aiLevel })
  for (const w of wins) {
    t.onDuelFinished({ id: 'd' + Math.random(), startedAt: 0, endedAt: 1, mode: 'ai', winner: w, meta: {} as never, record: {} as never,
      players: [{ place: 0, team: 0, ...info(m.a), name: '', deckName: '', result: w === 0 ? 'win' : 'loss' }, { place: 1, team: 1, ...info(m.b), name: '', deckName: '', result: w === 1 ? 'win' : 'loss' }],
      tournament: { id, matchId: matchId } } as never)
  }
}
/** Joue tous les matchs prêts qui ne mettent pas le joueur humain en jeu (ou tous, si `human` est vrai), au hasard mais de façon reproductible. */
function playAll(id: string, human: boolean, bestOf: number, maxRounds = 99): void {
  let seed = 7
  const rnd = (): number => { seed = (seed * 48271) % 2147483647; return seed / 2147483647 }
  const player = storage.tournaments.players(id).find((p) => !p.aiLevel)?.userId
  for (let guard = 0; guard < 200; guard++) {
    const m = storage.tournaments.matches(id).find((x) => x.state === 'ready' && x.a && x.b && x.round <= maxRounds && (human || (x.a !== player && x.b !== player)))
    if (!m) return
    const need = Math.floor(bestOf / 2) + 1
    const wins: (0 | 1)[] = []
    let a = 0, b = 0
    while (a < need && b < need) { const w: 0 | 1 = rnd() < 0.5 ? 0 : 1; wins.push(w); w === 0 ? a++ : b++ }
    play(id, m.id, wins)
  }
}
const solo = (name: string, kind: TournamentKind, size: number, bestOf: number, level = 'normal'): string => {
  const r = t.create(demo.id, { name, kind, format: 'casual', maxPlayers: size, settings: {}, mode: 'solo', deck: DECK, aiLevel: level, aiDeck: '', bestOf })
  if (!r.ok) throw new Error(JSON.stringify(r))
  const s = t.start(demo.id, r.id)
  if (!s.ok) throw new Error(JSON.stringify(s))
  return r.id
}

// 1. Élimination directe à 8, meilleur des 3 : le premier tour est joué, le joueur attend son match du tour 2.
const a = solo('Coupe des Légendes', 'single', 8, 3)
playAll(a, true, 3, 1)
playAll(a, false, 3, 2)
// 2. Ronde suisse à 6, terminée.
const b = solo('Open de Domino', 'swiss', 6, 1, 'easy')
playAll(b, true, 1)
// 3. Championnat à 6, en cours.
const c = solo('Ligue des Ombres', 'robin', 6, 1, 'hard')
playAll(c, false, 1)
for (let i = 0; i < 3; i++) { const m = storage.tournaments.matches(c).find((x) => x.state === 'ready' && x.a && x.b && (x.a === demo.id || x.b === demo.id)); if (m) play(c, m.id, [m.a === demo.id ? 0 : 1]) }
// 4. Élimination directe à 4 terminée (la championne est le joueur).
const d = solo('Mini-tournoi', 'single', 4, 1)
playAll(d, true, 1)
// 5. Entre amis : un tournoi ouvert (inscriptions) et un en cours (ronde suisse à 4).
const open = t.create(demo.id, { name: 'Soirée du vendredi', kind: 'robin', format: 'casual', maxPlayers: 6, settings: {}, bestOf: 3 })
if (!open.ok) throw new Error(JSON.stringify(open))
t.join(demo, open.id, DECK); t.join(friends[0]!, open.id, DECK); t.join(friends[1]!, open.id, DECK)
const live = t.create(demo.id, { name: 'Tournoi du club', kind: 'swiss', format: 'casual', maxPlayers: 4, settings: {}, bestOf: 1 })
if (!live.ok) throw new Error(JSON.stringify(live))
for (const u of [demo, friends[0]!, friends[1]!, friends[2]!]) t.join(u, live.id, DECK)
t.start(demo.id, live.id)
console.log('ok', JSON.stringify({ a, b, c, d, open: open.id, live: live.id }))
process.exit(0)
