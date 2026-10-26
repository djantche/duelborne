// La salle, vue par de faux joueurs : le pierre-feuille-ciseaux d'avant-duel (cartes secrètes jusqu'à la révélation,
// égalité rejouée, choix du gagnant) jusqu'au début du duel.
process.env.BOT_DELAY = '10'
process.env.RPS_REVEAL = '40'
process.env.WATCH_PATIENCE = '600'

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { ClientMessage, RoomInfo, ServerMessage, TossInfo } from '../shared/protocol.ts'
import { rpsWinner } from '../shared/rps.ts'
import { loadData, missingData } from './ocg/data.ts'
import { loadDecks } from './ocg/decks.ts'
import { Session } from './session.ts'

const skip = missingData() ?? false
const { Room } = await import('./room.ts')

class Fake extends Session {
  sent: ServerMessage[] = []
  override send(m: ServerMessage): void {
    this.sent.push(m)
  }
  tosses(): TossInfo[] {
    return this.sent.flatMap((m) => (m.t === 'toss' ? [m.toss] : []))
  }
}

async function until(test: () => boolean, what: string, ms = 8000): Promise<void> {
  const t0 = Date.now()
  while (!test()) {
    if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('pierre-feuille-ciseaux avant le duel', { skip }, () => {
  before(() => loadData())
  const rooms: InstanceType<typeof Room>[] = []
  after(() => rooms.forEach((r) => r.close()))

  async function start(): Promise<{ room: InstanceType<typeof Room>; me: Fake }> {
    const decks = loadDecks()
    const room = new Room('ai', decks, () => {})
    rooms.push(room)
    const me = new Fake('t', 'David', false)
    room.add(me)
    const say = (m: ClientMessage): void => room.handle(me, m)
    say({ t: 'deck', deck: [...decks.keys()][0] as string })
    say({ t: 'settings', settings: { first: 'rps' } })
    say({ t: 'ready', ready: true })
    return { room, me }
  }

  it('garde les cartes secrètes, révèle les deux ensemble, rejoue les égalités, puis laisse le gagnant choisir', async () => {
    const { room, me } = await start()
    let sawFirstPick = false
    for (let round = 1; round <= 30; round++) {
      await until(() => me.tosses().some((t) => t.rps?.round === round && t.rps.phase === 'pick'), `manche ${round} à jouer`)
      const first = me.tosses().find((t) => t.rps?.round === round && t.rps.phase === 'pick') as TossInfo
      assert.equal(first.kind, 'rps')
      assert.equal(first.rps?.plays, true)
      assert.equal(first.rps?.picked, false)
      assert.equal(first.rps?.picks, null, 'aucune carte dévoilée avant le choix')
      sawFirstPick = true
      const mine = (round % 3) as 0 | 1 | 2
      room.handle(me, { t: 'rps', hand: mine })
      await until(() => me.tosses().some((t) => t.rps?.round === round && t.rps.phase === 'reveal'), `révélation de la manche ${round}`)
      // Tant que les deux n'avaient pas choisi, la main de l'autre n'était jamais envoyée.
      for (const t of me.tosses().filter((x) => x.rps?.round === round && x.rps.phase === 'pick')) assert.equal(t.rps?.picks, null)
      const reveal = me.tosses().find((t) => t.rps?.round === round && t.rps.phase === 'reveal') as TossInfo
      const picks = reveal.rps?.picks as [0 | 1 | 2, 0 | 1 | 2]
      assert.equal(picks[0], mine)
      const w = rpsWinner(picks[0], picks[1])
      assert.equal(reveal.rps?.outcome, w === null ? 'draw' : w === 'a' ? 0 : 1)
      if (w === null) continue // égalité : la manche suivante est proposée
      await until(() => me.tosses().some((t) => t.rps?.phase === 'won'), 'manche tranchée')
      const won = me.tosses().find((t) => t.rps?.phase === 'won') as TossInfo
      assert.equal(won.winner, w === 'a' ? 0 : 1)
      // Gagnant humain : il choisit. Gagnant ordinateur : il choisit seul.
      if (won.choose) room.handle(me, { t: 'toss', first: true })
      await until(() => me.sent.some((m) => m.t === 'state'), 'le duel démarre', 15_000)
      const started = me.sent.find((m) => m.t === 'state')
      assert.ok(started)
      return
    }
    assert.ok(sawFirstPick)
    assert.fail('trente égalités de suite')
  })

  it('ne tient pas compte d’une carte jouée par quelqu’un d’autre ou hors manche', async () => {
    const { room, me } = await start()
    await until(() => me.tosses().some((t) => t.rps?.phase === 'pick'), 'première manche')
    const stranger = new Fake('x', 'Intrus', false)
    room.handle(stranger, { t: 'rps', hand: 0 })
    room.handle(me, { t: 'toss', first: true }) // pas encore de gagnant : sans effet
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(!me.sent.some((m) => m.t === 'state'))
  })
})

describe('IA contre IA', { skip }, () => {
  before(() => loadData())
  const rooms: InstanceType<typeof Room>[] = []
  after(() => rooms.forEach((r) => r.close()))

  const lobbies = (me: Fake): RoomInfo[] => me.sent.flatMap((m) => (m.t === 'lobby' ? [m.room] : []))
  const states = (me: Fake): number => me.sent.filter((m) => m.t === 'state').length

  function open(): { room: InstanceType<typeof Room>; me: Fake } {
    const room = new Room('aivai', loadDecks(), () => {})
    rooms.push(room)
    const me = new Fake('t', 'David', false)
    assert.ok(room.add(me))
    return { room, me }
  }

  it('ouvre un salon à deux ordinateurs dont on règle le niveau et le deck', () => {
    const { room, me } = open()
    const first = lobbies(me).at(-1) as RoomInfo
    assert.equal(first.mode, 'aivai')
    assert.equal(first.you, -1, 'le spectateur n’a pas de place')
    assert.deepEqual(first.seats.map((s) => s?.bot), [true, true])
    room.handle(me, { t: 'aiLevel', level: 'hard', seat: 0 })
    room.handle(me, { t: 'aiLevel', level: 'easy', seat: 1 })
    const deck = [...loadDecks().keys()][0] as string
    room.handle(me, { t: 'aiDeck', deck, seat: 1 })
    const now = lobbies(me).at(-1) as RoomInfo
    assert.deepEqual(now.seats.map((s) => s?.level), ['hard', 'easy'])
    assert.equal(now.seats[1]?.deck, deck)
    // Chacun se reconnaît à son numéro et à son niveau.
    assert.deepEqual(now.seats.map((s) => s?.name), ['@srv.cpu|{"n":1,"level":"@level.hard"}', '@srv.cpu|{"n":2,"level":"@level.easy"}'])
    assert.equal(room.add(new Fake('x', 'Intrus', false)), false, 'une seule personne regarde')
  })

  it('les fait jouer, mais attend que l’écran du spectateur soit à jour', async () => {
    const { room, me } = open()
    room.handle(me, { t: 'aiLevel', level: 'easy', seat: 0 })
    room.handle(me, { t: 'aiLevel', level: 'easy', seat: 1 })
    room.handle(me, { t: 'ready', ready: true })
    await until(() => states(me) > 0, 'le duel démarre', 15_000)
    const view = (me.sent.find((m) => m.t === 'state') as Extract<ServerMessage, { t: 'state' }>).view
    assert.equal(view.watching, true)
    // Tant qu'il n'a pas dit être à jour, rien d'autre n'arrive (la patience est de 600 ms).
    await new Promise((r) => setTimeout(r, 250))
    const waiting = states(me)
    await new Promise((r) => setTimeout(r, 150))
    assert.equal(states(me), waiting, 'les ordinateurs ont joué sans attendre le spectateur')
    // Dès qu'il est à jour, ils reprennent ; et ils continuent tant qu'il suit.
    for (let i = 0; i < 400 && states(me) < waiting + 25; i++) {
      room.handle(me, { t: 'idle' })
      await new Promise((r) => setTimeout(r, 15))
    }
    assert.ok(states(me) >= waiting + 25, 'les ordinateurs n’avancent pas')
    // Le duel fini, le spectateur peut en relancer un : retour au salon, où l'on règle de nouveau decks et niveaux.
    const inside = room as unknown as { duel: { finished: boolean; surrender(seat: number): unknown }; sendSteps(steps: unknown): void }
    room.handle(me, { t: 'rematch' })
    assert.equal(inside.duel.finished, false, 'on ne relance pas un duel en cours')
    inside.sendSteps(inside.duel.surrender(0))
    room.handle(me, { t: 'rematch' })
    const back = me.sent.at(-1)
    assert.equal(back?.t, 'lobby')
    assert.equal(back?.t === 'lobby' && back.room.mode, 'aivai')
    // Quitter ferme la salle : plus personne ne regarde.
    room.remove(me)
    assert.equal(me.sent.at(-1)?.t, 'home')
  })
})
