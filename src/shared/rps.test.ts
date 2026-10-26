import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Hand } from './protocol.ts'
import { HANDS, PAPER, ROCK, SCISSORS, beaten, handFromCore, handFromOption, optionOfHand, rpsWinner } from './rps.ts'

describe('pierre-feuille-ciseaux', () => {
  it('la feuille bat la pierre, la pierre les ciseaux, les ciseaux la feuille', () => {
    assert.equal(rpsWinner(PAPER, ROCK), 'a')
    assert.equal(rpsWinner(ROCK, SCISSORS), 'a')
    assert.equal(rpsWinner(SCISSORS, PAPER), 'a')
    assert.equal(rpsWinner(ROCK, PAPER), 'b')
    assert.equal(rpsWinner(SCISSORS, ROCK), 'b')
    assert.equal(rpsWinner(PAPER, SCISSORS), 'b')
  })

  it('une main identique est une égalité', () => {
    for (const h of HANDS) assert.equal(rpsWinner(h, h), null)
  })

  it('chaque main bat exactement une autre et perd contre une seule', () => {
    for (const h of HANDS) {
      assert.equal(rpsWinner(h, beaten(h)), 'a')
      assert.equal(HANDS.filter((o) => rpsWinner(h, o) === 'a').length, 1)
      assert.equal(HANDS.filter((o) => rpsWinner(h, o) === 'b').length, 1)
    }
  })

  it('traduit les valeurs du moteur (1 ciseaux, 2 pierre, 3 feuille) et ses rangs de question', () => {
    assert.deepEqual([1, 2, 3].map(handFromCore), [SCISSORS, ROCK, PAPER])
    // La question du moteur propose : ciseaux, pierre, feuille.
    assert.deepEqual([0, 1, 2].map(handFromOption), [SCISSORS, ROCK, PAPER])
    for (const h of HANDS as readonly Hand[]) assert.equal(handFromOption(optionOfHand(h)), h)
  })
})
