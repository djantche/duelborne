import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { duel, effectOfCard, trackEffect } from './state.ts'

afterEach(() => trackEffect({ type: 'start', firstPlayer: 0 }))

test('les deux cartes gardent leur effet repéré pendant une réponse en chaîne', () => {
  trackEffect({ type: 'chain', player: 0, uid: 10, cardId: 100, index: 1, effect: 2 })
  trackEffect({ type: 'chain', player: 1, uid: 20, cardId: 200, index: 2, effect: 1 })
  assert.equal(effectOfCard(100, 10)?.n, 2)
  assert.equal(effectOfCard(200, 20)?.n, 1)
  assert.equal(effectOfCard(100, 11), null)
  assert.equal(effectOfCard(100, null)?.n, 2)
})

test('une résolution garde son repère durant les décisions de résolution', () => {
  trackEffect({ type: 'chain', player: 0, uid: 10, cardId: 100, index: 1, label: 'Piochez' })
  trackEffect({ type: 'chainResolve', index: 1 })
  assert.equal(duel.pendingEffects.length, 0)
  assert.equal(effectOfCard(100, 10)?.label, 'Piochez')
  trackEffect({ type: 'turn', player: 1, turn: 2 })
  assert.equal(effectOfCard(100, 10), null)
})

test('une annulation et une nouvelle chaîne enlèvent les anciens repères', () => {
  trackEffect({ type: 'chain', player: 0, uid: 10, cardId: 100, index: 1 })
  trackEffect({ type: 'chainNegated', index: 1 })
  assert.equal(effectOfCard(100, 10), null)
  trackEffect({ type: 'chain', player: 0, uid: 10, cardId: 100, index: 1 })
  trackEffect({ type: 'chain', player: 1, uid: 20, cardId: 200, index: 1 })
  assert.equal(effectOfCard(100, 10), null)
  assert.equal(effectOfCard(200, 20)?.n, 0)
})
