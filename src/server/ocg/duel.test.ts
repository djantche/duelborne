// Tests du duel conduit par ocgcore. Ils ont besoin des données du moteur (npm run fetch-ocg) et
// sont ignorés si elles sont absentes.
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { GameEvent, Prompt, Seat } from '../../shared/protocol.ts'
import { Bot } from '../ai/bot.ts'
import { effectNumber, loadData, missingData } from './data.ts'
import { loadDecks } from './decks.ts'
import type { DeckList } from './decks.ts'
import { Duel } from './duel.ts'
import type { Step } from './duel.ts'

const skip = missingData() ?? false

const C = {
  potOfGreed: 55144522,
  scapegoat: 73915051,
  gracefulDice: 74137509,
  mirrorForce: 44095762,
  stargazer: 94415058,
  timegazer: 20409757,
  oddEyes: 16178681,
  celticGuardian: 91152256,
  mysticalElf: 15025844,
}

const deck = (code: number): DeckList => ({ id: 't', name: 't', series: 't', cover: code, mainCount: 20, extraCount: 0, main: Array<number>(20).fill(code), extra: [] })

type Choice = (p: Prompt) => number | number[] | null | undefined

/** Fait avancer le duel : `choose` répond aux questions, undefined = arrêter là. */
function drive(duel: Duel, steps: Step[], choose: (seat: Seat, p: Prompt) => number | number[] | null | undefined, max = 400): GameEvent[] {
  // Les événements du siège 0 : seules les cartes révélées diffèrent d'un siège à l'autre.
  const events = steps.flatMap((s) => s.events[0] ?? [])
  for (let i = 0; i < max && !duel.finished; i++) {
    const last = steps[steps.length - 1] as Step
    const seat = last.views[0]?.waitingFor ?? null
    if (seat === null) break
    const prompt = last.views[seat]?.prompt as Prompt
    const value = choose(seat, prompt)
    if (value === undefined) break
    const next = duel.answer(seat, prompt.id, value)
    assert.ok(typeof next !== 'string', `réponse refusée (${prompt.kind}) : ${String(next)} · valeur ${JSON.stringify(value)} · ${JSON.stringify({ ...prompt, cards: 'cards' in prompt ? prompt.cards.length : undefined })}`)
    steps = next
    events.push(...steps.flatMap((s) => s.events[0] ?? []))
  }
  return events
}

/** Réponses par défaut aux questions secondaires (cible, position, chaîne refusée...). */
const fallback: Choice = (p) => {
  switch (p.kind) {
    case 'chain':
      return p.forced ? (p.options[0]?.id ?? null) : null
    case 'yesno':
      return 1
    case 'cards':
      if (p.mode === 'multi') return Array.from({ length: Math.min(p.cards.length, Math.max(1, p.min)) }, (_, i) => i)
      // Carte par carte : on s'arrête dès que c'est permis, sinon on prend la première carte libre.
      if (p.finishable && p.cards.some((c) => c.selected)) return null
      return p.cards.some((c) => !c.selected) ? p.cards.findIndex((c) => !c.selected) : null
    case 'option':
    case 'number':
    case 'position':
    case 'place':
      return 0
    default:
      return undefined
  }
}

describe('duel ocgcore', { skip }, () => {
  before(() => {
    loadData()
  })

  it('joue Magie, Pendule, dé, Piège en chaîne et Jetons', async () => {
    const duel = await Duel.create([deck(C.mysticalElf), deck(C.celticGuardian)], 0, {
      seed: 1n,
      hands: [[C.potOfGreed, C.stargazer, C.timegazer, C.oddEyes, C.gracefulDice, C.mirrorForce, C.scapegoat], [C.celticGuardian]],
    })
    // Ce que chaque joueur fait quand le moteur lui demande une action, dans l'ordre.
    const plan: [string, number?][][] = [
      [
        ['activate', C.potOfGreed],
        ['activate', C.stargazer],
        ['activate', C.timegazer],
        ['spsummon'],
        ['activate', C.gracefulDice],
        ['sset', C.mirrorForce],
        ['toEnd'],
        ['activate', C.scapegoat],
        ['toEnd'],
      ],
      [['summon', C.celticGuardian], ['toBattle'], ['attack'], ['toEnd']],
    ]
    const done: string[] = []
    const events = drive(duel, duel.start(), (seat, p) => {
      if (p.kind === 'chain') return p.options.find((o) => o.cardId === C.mirrorForce)?.id ?? fallback(p)
      if (p.kind !== 'idle' && p.kind !== 'battle') return fallback(p)
      const step = plan[seat]?.shift()
      if (!step) return undefined
      const [action, cardId] = step
      const option = p.options.find((o) => o.action === action && (cardId === undefined || o.cardId === cardId))
      assert.ok(option, `action impossible pour le joueur ${seat} : ${action} ${cardId ?? ''} — proposé : ${p.options.map((o) => `${o.action}:${o.cardId}`).join(' ')}`)
      done.push(action)
      return option.id
    })

    const has = (pred: (e: GameEvent) => boolean): boolean => events.some(pred)
    assert.ok(has((e) => e.type === 'draw' && e.player === 0 && e.count === 2), 'Pot of Greed fait piocher 2 cartes')
    // Régression du correctif de vendor/ocgcore : sans la bonne échelle droite, pas d'Invocation Pendule.
    assert.ok(has((e) => e.type === 'summon' && e.mode === 'special' && e.cardId === C.oddEyes), 'Invocation Pendule d’Odd-Eyes')
    assert.ok(has((e) => e.type === 'dice' && e.results.length === 1), 'Graceful Dice lance un dé')
    assert.ok(has((e) => e.type === 'chain' && e.cardId === C.mirrorForce), 'Mirror Force s’active en chaîne')
    assert.ok(has((e) => e.type === 'destroy' && e.player === 1 && e.cardId === C.celticGuardian), 'l’attaquant est détruit')
    assert.equal(events.filter((e) => e.type === 'summon' && e.mode === 'special' && e.player === 0).length, 5, 'Odd-Eyes + 4 Jetons')

    const view = duel.currentView(1)
    assert.equal(view.players[0].monsters.filter(Boolean).length, 5)
    assert.equal(view.players[1].monsters.filter(Boolean).length, 0)
    assert.equal(view.players[0].lp, 8000)
    duel.destroy()
  })

  it('ne révèle jamais une carte cachée à l’adversaire', async () => {
    const duel = await Duel.create([deck(C.mysticalElf), deck(C.celticGuardian)], 0, { seed: 3n, hands: [[C.mysticalElf, C.mirrorForce], []] })
    const plan = ['set', 'sset', 'toEnd']
    drive(duel, duel.start(), (seat, p) => {
      if (p.kind !== 'idle') return fallback(p)
      const action = seat === 0 ? plan.shift() : undefined
      return action ? p.options.find((o) => o.action === action)?.id : undefined
    })
    const mine = duel.currentView(0).players[0]
    const seenByFoe = duel.currentView(1).players[0]
    assert.equal(mine.monsters[0]?.card.cardId, C.mysticalElf, 'je connais mon monstre posé')
    assert.equal(seenByFoe.monsters[0]?.card.cardId, null, 'l’adversaire ne le connaît pas')
    assert.equal(seenByFoe.monsters[0]?.atk, null)
    assert.equal(seenByFoe.spellTraps.find(Boolean)?.card.cardId, null)
    assert.ok(seenByFoe.hand.every((c) => c.cardId === null))
    duel.destroy()
  })

  it('indique que le Pendule détruit rejoint son Extra Deck face recto', async () => {
    const raigeki = 12580477
    const duel = await Duel.create([deck(C.mysticalElf), deck(C.celticGuardian)], 0, {
      seed: 1n,
      hands: [[C.stargazer, C.timegazer, C.oddEyes], [raigeki]],
    })
    try {
      const plan: [string, number?][][] = [
        [['activate', C.stargazer], ['activate', C.timegazer], ['spsummon'], ['toEnd']],
        [['activate', raigeki], ['toEnd']],
      ]
      const events = drive(duel, duel.start(), (seat, p) => {
        if (p.kind !== 'idle' && p.kind !== 'battle') return fallback(p)
        const next = plan[seat]?.shift()
        if (!next) return undefined
        const option = p.options.find((o) => o.action === next[0] && (next[1] === undefined || o.cardId === next[1]))
        assert.ok(option, `${next[0]} doit être proposé`)
        return option.id
      })
      const destroyed = events.find((e) => e.type === 'destroy' && e.cardId === C.oddEyes)
      assert.ok(destroyed?.type === 'destroy', 'Raigeki détruit le monstre Pendule')
      assert.equal(destroyed.to, 'extra')
      assert.equal(destroyed.faceUp, true)
    } finally {
      duel.destroy()
    }
  })

  it('l’ordinateur joue des duels entiers contre lui-même, avec tous les decks', async () => {
    const decks = [...loadDecks().values()]
    for (let d = 0; d < decks.length; d++) {
      const duel = await Duel.create([decks[d] as DeckList, decks[(d + 3) % decks.length] as DeckList], (d % 2) as Seat, { seed: BigInt(d + 1) })
      const bots = [new Bot(0), new Bot(1)]
      let attempt = 0
      let steps = duel.start()
      for (let i = 0; i < 4000 && !duel.finished; i++) {
        const waiting = duel.waiting
        if (!waiting) break
        const refused = duel.refused
        const value = (bots[waiting.seat] as Bot).choose(duel.currentView(waiting.seat), attempt)
        if (value === undefined) {
          steps = duel.surrender(waiting.seat)
          break
        }
        const next = duel.answer(waiting.seat, waiting.prompt.id, value)
        attempt = typeof next === 'string' || duel.refused > refused ? attempt + 1 : 0
        if (typeof next !== 'string') steps = next
      }
      assert.ok(duel.finished, `duel ${(decks[d] as DeckList).id} terminé (tour ${steps.at(-1)?.views[0]?.turn})`)
      duel.destroy()
    }
  })

  it('joue un duel par équipes (2 contre 2) : les coéquipiers alternent', async () => {
    const decks = [...loadDecks().values()].slice(0, 4)
    const duel = await Duel.create(decks, 0, { seed: 7n })
    const bots = [0, 1, 2, 3].map((place) => new Bot((place % 2) as Seat))
    const answered = new Set<number>()
    let attempt = 0
    let steps = duel.start()
    assert.equal(steps.at(-1)?.views.length, 4, 'une vue par place')
    for (let i = 0; i < 6000 && !duel.finished; i++) {
      const waiting = duel.waiting
      if (!waiting) break
      // Celui qui ne joue pas regarde, sans question.
      const partner = (waiting.seat + 2) % 4
      assert.equal(duel.currentView(partner).prompt, null)
      assert.equal(duel.currentView(partner).spectating, true)
      assert.equal(duel.currentView(waiting.seat).spectating, false)
      answered.add(waiting.seat)
      const refused = duel.refused
      const value = (bots[waiting.seat] as Bot).choose(duel.currentView(waiting.seat), attempt)
      if (value === undefined) {
        steps = duel.surrender(waiting.seat)
        break
      }
      const next = duel.answer(waiting.seat, waiting.prompt.id, value)
      attempt = typeof next === 'string' || duel.refused > refused ? attempt + 1 : 0
      if (typeof next !== 'string') steps = next
    }
    assert.ok(duel.finished, `duel terminé (tour ${steps.at(-1)?.views[0]?.turn})`)
    assert.deepEqual([...answered].sort(), [0, 1, 2, 3], 'les quatre duellistes ont joué')
    duel.destroy()
  })

  it('mélange les Decks : mains de départ différentes d’un duel à l’autre, identiques à graine égale', async () => {
    const deck = loadDecks().get('yubel') as DeckList
    const opening = async (seed?: bigint): Promise<number[]> => {
      const duel = await Duel.create([deck, deck], 0, seed === undefined ? undefined : { seed })
      duel.start()
      const hand = duel.currentView(0).players[0].hand.map((c) => c.cardId as number)
      duel.destroy()
      return hand
    }
    const tail = deck.main.slice(-5).sort().join()
    const hands = await Promise.all([opening(), opening(), opening(), opening(), opening(), opening()])
    assert.equal(hands[0]?.length, 5)
    // Sans mélange, chacun piochait les 5 dernières cartes de sa liste, à chaque duel.
    assert.ok(hands.filter((h) => [...h].sort().join() === tail).length <= 1, 'la main n’est pas la fin de la liste')
    assert.ok(new Set(hands.map((h) => [...h].sort().join())).size >= 5, 'les mains varient')
    assert.deepEqual(await opening(42n), await opening(42n), 'même graine, même main')
    assert.notDeepEqual(await opening(42n), await opening(43n))
    // Les deux joueurs ont le même Deck mais pas le même mélange.
    const duel = await Duel.create([deck, deck], 0, { seed: 5n })
    duel.start()
    assert.notDeepEqual(duel.currentView(0).players[0].hand.map((c) => c.cardId), duel.currentView(1).players[1].hand.map((c) => c.cardId))
    duel.destroy()
  })

  it('permet d’annuler une invocation tant que la zone n’est pas choisie, sans rien montrer à l’adversaire', async () => {
    const deck = loadDecks().get('yubel') as DeckList
    // On cherche une main de départ qui permet une Invocation Normale.
    for (let seed = 1n; seed < 30n; seed++) {
      const duel = await Duel.create([deck, deck], 0, { seed })
      duel.start()
      const idle = duel.waiting as { seat: number; prompt: Prompt }
      const summon = idle.prompt.kind === 'idle' ? idle.prompt.options.find((o) => o.action === 'summon') : undefined
      if (!summon) {
        duel.destroy()
        continue
      }
      const before = JSON.stringify(duel.currentView(0))
      const foeBefore = JSON.stringify(duel.currentView(1))

      // « Invoquer » : le moteur demande la zone. Rien n'a bougé : c'est annulable, et l'adversaire ne voit rien.
      const steps = duel.answer(0, idle.prompt.id, summon.id) as Step[]
      const place = duel.currentView(0).prompt
      assert.equal(place?.kind, 'place')
      assert.equal(place?.undoable, true)
      assert.ok(steps.every((st) => st.events[1]?.length === 0), 'aucun événement pour l’adversaire')
      assert.equal(JSON.stringify(duel.currentView(1)), foeBefore, 'la vue de l’adversaire n’a pas changé')
      assert.equal(typeof duel.undo(1), 'string', 'l’adversaire ne peut pas annuler à ma place')

      // Annulation : retour exact à la décision précédente.
      assert.ok(Array.isArray(duel.undo(0)))
      assert.equal(JSON.stringify(duel.currentView(0)), before, 'état identique à avant')
      assert.equal(typeof duel.undo(0), 'string', 'rien à annuler deux fois')

      // Cette fois on va au bout : une fois la carte posée, plus d'annulation possible.
      const again = duel.waiting as { seat: number; prompt: Prompt }
      duel.answer(0, again.prompt.id, summon.id)
      const zone = duel.currentView(0).prompt as Prompt
      duel.answer(0, zone.id, 0)
      assert.ok(duel.currentView(1).players[0].monsters.some((m) => m), 'le monstre est sur le terrain')
      assert.equal(typeof duel.undo(0), 'string', 'une carte posée ne se reprend pas')
      duel.destroy()
      return
    }
    assert.fail('aucune graine ne donne une Invocation Normale')
  })

  it('applique les paramètres de la partie (points de vie, main de départ, decks non mélangés)', async () => {
    const deck = loadDecks().get('yugi') as DeckList
    const duel = await Duel.create([deck, deck], 0, undefined, { startLp: 4000, startHand: 6, drawPerTurn: 2, shuffle: false })
    duel.start()
    const view = duel.currentView(0)
    assert.equal(view.startLp, 4000)
    assert.equal(view.players[0].lp, 4000)
    assert.equal(view.players[1].lp, 4000)
    assert.equal(view.players[0].hand.length, 6)
    // Sans mélange, on pioche la fin de la liste : c'est le mode « test » des paramètres.
    assert.deepEqual(view.players[0].hand.map((c) => c.cardId).sort(), deck.main.slice(-6).sort())
    duel.destroy()
  })

  it('un abandon donne la victoire à l’adversaire', async () => {
    const duel = await Duel.create([deck(C.mysticalElf), deck(C.celticGuardian)], 0)
    duel.start()
    const steps = duel.surrender(1)
    assert.equal(duel.winner, 0)
    assert.ok(steps[0]?.events[0]?.some((e) => e.type === 'win' && e.winner === 0))
    assert.equal(typeof duel.answer(0, 1, 0), 'string', 'plus aucune réponse acceptée')
    duel.destroy()
  })

  it('tient des duels entiers joués au hasard avec les vrais decks', async () => {
    // Des decks de base : joués au hasard, les decks à gros effets (Exodia, boucles) peuvent ne jamais finir dans la limite de pas.
    const BASE = ['yugi', 'kaiba', 'joey', 'pegasus', 'jaden', 'syrus', 'yuya', 'hero', 'dark-magician', 'sky-striker', 'salamangreat', 'swordsoul', 'tenpai', 'branded', 'yubel', 'blue-eyes', 'sd-albaz', 'sd-crimson-king']
    const decks = [...loadDecks().values()].filter((d) => BASE.includes(d.id))
    let rng = 12345
    const rand = (n: number): number => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff), rng % n)
    for (let d = 0; d < 6; d++) {
      const duel = await Duel.create([decks[rand(decks.length)] as DeckList, decks[rand(decks.length)] as DeckList], rand(2) as Seat, { seed: BigInt(d + 1) })
      drive(
        duel,
        duel.start(),
        (_seat, p) => {
          if (p.kind === 'idle' || p.kind === 'battle') {
            const acts = p.options.filter((o) => !o.action.startsWith('to'))
            const ends = p.options.filter((o) => o.action.startsWith('to'))
            const pool = acts.length && rand(100) < 70 ? acts : ends.length ? ends : acts
            return (pool[rand(pool.length)] as { id: number }).id
          }
          if (p.kind === 'chain') return p.forced || rand(2) ? (p.options[rand(p.options.length)] as { id: number }).id : null
          if (p.kind === 'yesno') return rand(2)
          if (p.kind === 'cards' && p.mode === 'multi') return Array.from({ length: Math.min(p.cards.length, p.min + rand(Math.max(1, p.max - p.min + 1))) }, (_, i) => i)
          if (p.kind === 'place') return rand(p.zones.length)
          return fallback(p)
        },
        6000,
      )
      assert.ok(duel.finished, `duel ${d} terminé`)
      assert.notEqual(duel.winner, null)
      duel.destroy()
    }
  })
  it('numérote les effets d’une carte dans l’ordre de son script', () => {
    // Véritable Lumière : l'activation de la carte n'a pas de description, ses deux effets portent les textes 1 et 2.
    const trueLight = 62089826n
    assert.equal(effectNumber((trueLight << 20n) | 1n), 1)
    assert.equal(effectNumber((trueLight << 20n) | 2n), 2)
    assert.equal(effectNumber((trueLight << 20n) | 0n), null)
    // Une description du système (aucune carte) n'a pas de numéro.
    assert.equal(effectNumber(1n), null)
  })
})
