import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import type { DuelView, MonsterView, Prompt, PromptCard } from '../../shared/protocol.ts'
import { loadData } from '../ocg/data.ts'
import { Bot } from './bot.ts'
import { evaluate } from './planner.ts'
import { blindSuspicion } from './suspicion.ts'
import { cardSelections, cardWorth, combatPotential, selectionScore } from './tactics.ts'
import { blueEyes } from './playbooks/blue-eyes.ts'

before(() => loadData())
const monster = (id: number, atk: number, def = 0, position: 'atk' | 'def' = 'atk'): MonsterView => ({ card: { uid: id, cardId: id }, atk, def, position, faceUp: true, materials: 0 })
function view(): DuelView {
  const player = () => ({ lp: 8000, deckCount: 30, hand: [], monsters: Array(7).fill(null), spellTraps: Array(5).fill(null), fieldZone: null, graveyard: [], banished: [], extra: [] })
  return { you: 0, players: [player(), player()], turn: 2, turnPlayer: 0, phase: 'main1', winner: null, log: [], prompt: null, waitingFor: 0, disabled: [], chain: [], spectating: false, startLp: 8000, extraZones: true, unknownCards: {} }
}
const card = (id: number, zone: PromptCard['zone'] = 'monster'): PromptCard => ({ uid: id, cardId: id, seat: 0, zone })
const prompt = (cards: PromptCard[], extra: Partial<Extract<Prompt, { kind: 'cards' }>> = {}): Extract<Prompt, { kind: 'cards' }> => ({ id: 1, kind: 'cards', text: '', hint: 500, min: 1, max: 1, cancelable: false, mode: 'multi', finishable: false, cards, ...extra })

test('les sélections par somme peuvent utiliser une carte située après la douzième', () => {
  const p = prompt(Array.from({ length: 14 }, (_, i) => card(i + 1)), { max: 14, sum: { target: 1, amounts: Array.from({ length: 14 }, (_, i) => [i === 13 ? 1 : 3]) } })
  assert.deepEqual(cardSelections(p, () => -100)[0], [13])
})

test('les sacrifices doubles respectent la borne maximale et épargnent le boss', () => {
  const p = prompt([card(1), card(2), card(3)], { min: 2, max: 2, weights: [1, 2, 1] })
  const picks = cardSelections(p, (c) => c.cardId === 2 ? -100 : -1500)[0]!
  assert.deepEqual(picks, [1])
  assert.equal(picks.reduce((n, i) => n + p.weights![i]!, 0), 2)
})

test('les niveaux alternatifs et matériaux imposés sont comptés une seule fois', () => {
  const p = prompt([{ ...card(1), selected: true }, card(2), card(3)], { min: 1, max: 2, mustCount: 1, sum: { target: 7, fixed: 3, amounts: [[], [2, 4], [1]] } })
  assert.deepEqual(cardSelections(p, () => -100)[0], [1])
})

test('les choix facultatifs prennent plusieurs gains et le minimum de coûts', () => {
  const p = prompt([card(1), card(2), card(3)], { max: 3 })
  assert.equal(cardSelections(p, () => 100)[0]!.length, 3)
  assert.equal(cardSelections(p, () => -100)[0]!.length, 1)
})

test('une pierre et Maiden se défaussent avant une interruption', () => {
  const v = view()
  const p = prompt([card(71039903, 'hand'), card(17947697, 'hand'), card(14558127, 'hand')], { hint: 501 })
  const picks = cardSelections(p, (c) => selectionScore(v, 0, p, c, null))
  assert.notDeepEqual(picks[0], [2])
})

test('le Débutant garde Ash en main et pose les Jeu-Rapides utiles', () => {
  const v = view()
  v.players[0].hand = [{ uid: 1, cardId: 14558127 }, { uid: 2, cardId: 24224830 }]
  v.prompt = { id: 1, kind: 'idle', options: [{ id: 1, uid: 1, cardId: 14558127, zone: 'hand', action: 'summon' }, { id: 2, uid: 2, cardId: 24224830, zone: 'hand', action: 'sset' }, { id: 3, uid: null, cardId: null, zone: null, action: 'toEnd' }] }
  assert.equal(new Bot(0).choose(v), 2)
})

test('le petit attaquant ouvre le chemin à la grosse attaque directe', () => {
  const v = view()
  const small = monster(1, 2000), big = monster(2, 3000), wall = monster(3, 1000, 1800, 'def')
  v.players[1].monsters[0] = wall
  assert.equal(combatPotential(v, 0, [big, small]), cardWorth(wall.card.cardId, wall) + 3000)
})

test('un monstre invulnérable de Yubel ne compte pas comme une destruction gratuite', () => {
  const v = view()
  v.players[1].monsters[0] = monster(78371393, 0)
  assert.equal(combatPotential(v, 0, [monster(89631139, 3000)]), 0)
})

test('une carte piochée dans le futur simulé ne révèle pas son utilité au script', () => {
  const a = view(), b = view()
  a.players[0].hand = [{ uid: 123, cardId: 89631139 }]
  b.players[0].hand = [{ uid: 123, cardId: 14558127 }]
  const k = { seat: 0 as const, hidden: new Set<number>(), drawn: new Set([123]), suspect: blindSuspicion(a, 0), playbook: blueEyes }
  assert.equal(evaluate(a, k, null), evaluate(b, k, null))
})

test('une carte adverse cachée au départ reste inconnue pendant le jugement', () => {
  const a = view(), b = view()
  a.players[1].monsters[0] = { ...monster(89631139, 3000), card: { uid: 123, cardId: 89631139 } }
  b.players[1].monsters[0] = { ...monster(78371393, 0), card: { uid: 123, cardId: 78371393 } }
  const k = { seat: 0 as const, hidden: new Set([123]), suspect: blindSuspicion(a, 0) }
  assert.equal(evaluate(a, k, null), evaluate(b, k, null))
})

test('poser Infinite Impermanence avec un terrain occupé améliore la défense du tour adverse', () => {
  const hand = view(), set = view()
  hand.players[0].monsters[0] = monster(89631139, 3000)
  set.players[0].monsters[0] = hand.players[0].monsters[0]
  hand.players[0].hand = [{ uid: 1, cardId: 10045474 }]
  set.players[0].spellTraps[0] = { card: { uid: 1, cardId: 10045474 }, faceUp: false, scale: null }
  const k = { seat: 0 as const, hidden: new Set<number>(), suspect: blindSuspicion(hand, 0), playbook: blueEyes }
  assert.ok(evaluate(set, k, null) > evaluate(hand, k, null))
})
