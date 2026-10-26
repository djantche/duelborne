// Les soupçons de l'ordinateur (suspicion.ts) et le contenu du deck établi avant la distribution
// (Duel.deckOf) : le pont invisible se réduit au fil des révélations, une carte vue reste vue, une carte
// piochée reste ignorée, et le deck connu ne dit jamais l'ordre de pioche. Ces tests ont besoin des
// données du moteur (npm run fetch-ocg).
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { CardView, DuelView, MonsterView, Seat } from '../../shared/protocol.ts'
import { loadData, missingData } from '../ocg/data.ts'
import type { DeckList } from '../ocg/decks.ts'
import { Duel } from '../ocg/duel.ts'
import { Suspects } from './suspicion.ts'

const skip = missingData() ?? false

const C = { warwolf: 69247929, celtic: 91152256, mirrorForce: 44095762, gracefulDice: 74137509 }
const deck = (code: number): DeckList => ({ id: 't', name: 't', series: 't', cover: code, mainCount: 20, extraCount: 0, main: Array<number>(20).fill(code), extra: [] })

/** Une vue minimale : l'ordinateur n'y voit que ce qu'il peut voir, le reste n'est jamais décrit. */
const theFoe = (seat: Seat, parts: Partial<{ hand: CardView[]; monsters: (MonsterView | null)[]; graveyard: CardView[]; banished: CardView[]; spellTraps: (CardView | null)[] }>): DuelView =>
  ({
    players: [
      seat === 0 ? ({ hand: [], monsters: [], graveyard: [], banished: [], spellTraps: [], fieldZone: null } as never) : ({ hand: parts.hand ?? [], monsters: parts.monsters ?? [], graveyard: parts.graveyard ?? [], banished: parts.banished ?? [], spellTraps: parts.spellTraps ?? [], fieldZone: null } as never),
      seat === 0 ? ({ hand: parts.hand ?? [], monsters: parts.monsters ?? [], graveyard: parts.graveyard ?? [], banished: parts.banished ?? [], spellTraps: parts.spellTraps ?? [], fieldZone: null } as never) : ({ hand: [], monsters: [], graveyard: [], banished: [], spellTraps: [], fieldZone: null } as never),
    ],
    chain: [],
  }) as unknown as DuelView

const monster = (uid: number, cardId: number | null, faceUp = true): MonsterView => ({ card: { uid, cardId }, faceUp, atk: faceUp ? 1400 : null, def: null, position: 'atk', materials: 0 } as unknown as MonsterView)
const card = (uid: number, cardId: number | null): CardView => ({ uid, cardId })

describe('soupçons de l’ordinateur', { skip }, () => {
  before(() => {
    loadData()
  })

  it('l’identité d’une carte piochée n’est jamais lue : seule la main révélée est comptée', () => {
    const s = new Suspects([C.celtic, C.warwolf])
    const view = theFoe(0, { hand: [card(1, null), card(2, null), card(3, C.celtic)] })
    s.remember(view, 0)
    const p = s.profile(view, 0)
    assert.equal(p.unknownHand, 2, 'les deux cartes sans identité')
    assert.equal(p.unseen, 1, 'du pont : un seul exemplaire encore jamais vu (Warwolf)')
  })

  it('le pont invisible se réduit au fil des révélations, cimetière comme terrain', () => {
    const s = new Suspects([C.celtic, C.celtic, C.mirrorForce, C.mirrorForce, C.warwolf])
    s.remember(theFoe(0, { graveyard: [card(10, C.mirrorForce)], monsters: [monster(11, C.celtic)] }), 0)
    const p = s.profile(theFoe(0, { hand: [], monsters: [], graveyard: [] }), 0)
    assert.equal(p.unseen, 3, 'restent 1 Celtic Guardian, 1 Miroir de la Force et 1 Warwolf')
    assert.equal(p.trapDensity, 1 / 3, 'une part sur trois de pièges')
    assert.equal(p.loomingAtk, 2000, 'le Warwolf jamais vu est la meilleure attaque à venir')
  })

  it('une carte vue l’est pour de bon, même si elle disparaît de la vue', () => {
    const s = new Suspects([C.celtic, C.celtic])
    s.remember(theFoe(0, { monsters: [monster(1, C.celtic)] }), 0)
    // Elle est détruite et n'apparaît plus nulle part : le souvenir reste.
    const p = s.profile(theFoe(0, { monsters: [], graveyard: [] }), 0)
    assert.equal(p.unseen, 1, 'un seul exemplaire jamais vu')
  })

  it('chaque exemplaire vu compte une fois, où qu’il apparaisse dans la vue', () => {
    const s = new Suspects([C.celtic, C.celtic])
    s.remember(theFoe(0, { monsters: [monster(1, C.celtic)], graveyard: [card(2, C.celtic)], banished: [card(3, C.celtic)] }), 0)
    const p = s.profile(theFoe(0, { monsters: [], graveyard: [] }), 0)
    assert.equal(p.unseen, 0, 'deux exemplaires au plus, jamais trois')
  })

  it('les Magies Jeu-Rapides jamais vues pèsent comme des réponses possibles depuis la main', () => {
    const s = new Suspects([C.gracefulDice, C.celtic])
    const p = s.profile(theFoe(0, { hand: [card(1, null), card(2, null)] }), 0)
    assert.equal(p.handHazard, 0.5, 'une chance sur deux que l’une des cartes inconnues réponde depuis la main')
  })
})

describe('le deck établi avant la distribution', { skip }, () => {
  before(() => {
    loadData()
  })

  it('contient le Deck, l’Extra et la main de départ d’une équipe, sans rien dire de l’ordre de pioche', async () => {
    const duel = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 9n, hands: [[C.gracefulDice, C.celtic], []] })
    const of0 = duel.deckOf(0)
    const of1 = duel.deckOf(1)
    const sorted = (a: DeckList, extra: number[] = []): number[] => [...a.main, ...a.extra, ...extra].sort((x, y) => x - y)
    assert.deepEqual(of0, sorted(deck(C.warwolf), [C.gracefulDice, C.celtic]), 'les cartes de la première équipe, cartes en main comprises')
    assert.deepEqual(of1, sorted(deck(C.celtic)), 'les cartes de la deuxième équipe uniquement')
    assert.deepEqual([...of0].sort((a, b) => a - b), of0, 'trié : l’ordre ne révèle pas le mélange')
    duel.destroy()
  })

  it('ne dépend pas de la graine : deux mélanges différents, un seul contenu connu', async () => {
    const a = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 11n })
    const b = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 12n })
    assert.deepEqual(a.deckOf(1), b.deckOf(1))
    a.destroy()
    b.destroy()
  })
})
