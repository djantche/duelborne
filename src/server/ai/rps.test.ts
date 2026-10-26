// Pierre-feuille-ciseaux : l'ordinateur joue au hasard, à tous les niveaux (il jouait toujours « ciseaux »).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DuelView, Prompt } from '../../shared/protocol.ts'
import { Bot } from './bot.ts'

const prompt: Prompt = { id: 1, kind: 'option', text: '@srv.rps', options: ['@srv.scissors', '@srv.rock', '@srv.paper'], rps: true }
const view = { you: 1, turn: 1, prompt, players: [], log: [], chain: [], winner: null } as unknown as DuelView

describe('ordinateur : pierre-feuille-ciseaux', () => {
  it('joue les trois mains, pas toujours la même', () => {
    for (const passive of [false, true]) {
      const bot = new Bot(1, { passive })
      const seen = new Set<unknown>()
      for (let i = 0; i < 200; i++) seen.add(bot.choose(view))
      assert.deepEqual([...seen].sort(), [0, 1, 2])
    }
  })
})
