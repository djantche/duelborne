// L'ordinateur qui réfléchit (planner.ts), sur des situations construites : il n'attaque pas quand c'est contre lui,
// attaque quand c'est gagnant, et ne gaspille pas une Magie. Ces tests ont besoin des données du moteur (npm run fetch-ocg).
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { Answer, Prompt } from '../../shared/protocol.ts'
import { loadData, missingData } from '../ocg/data.ts'
import type { DeckList } from '../ocg/decks.ts'
import { Duel } from '../ocg/duel.ts'
import { Computer } from './computer.ts'

const skip = missingData() ?? false

const C = { warwolf: 69247929, celtic: 91152256, darkHole: 53129443 }
const deck = (code: number): DeckList => ({ id: 't', name: 't', series: 't', cover: code, mainCount: 20, extraCount: 0, main: Array<number>(20).fill(code), extra: [] })

/** Réponses du joueur scripté : ses actions de Main Phase dans l'ordre, et des réponses neutres au reste. */
function scripted(plan: string[]): (p: Prompt) => Answer | undefined {
  return (p) => {
    if (p.kind === 'idle' || p.kind === 'battle') {
      const action = plan.shift() ?? 'toEnd'
      return (p.options.find((o) => o.action === action) ?? p.options.find((o) => o.action === 'toEnd') ?? p.options.find((o) => o.action === 'toMain2'))?.id
    }
    if (p.kind === 'chain') return p.forced ? (p.options[0]?.id ?? null) : null
    if (p.kind === 'cards') return Array.from({ length: Math.max(1, p.min) }, (_, i) => i)
    return 0
  }
}

/** Joue jusqu'au début du tour `until` : l'ordinateur tient la place `ai`, l'autre place suit son script. */
async function play(duel: Duel, ai: number, script: (p: Prompt) => Answer | undefined, until: number): Promise<void> {
  const computer = new Computer('normal')
  for (let n = 0, attempts = 0; n < 300 && !duel.finished; n++) {
    const w = duel.waiting
    if (!w || duel.currentView(0).turn >= until) return
    const value = w.seat === ai ? await computer.choose(duel, w.seat, attempts) : script(w.prompt)
    assert.notEqual(value, undefined, `pas de réponse à ${w.prompt.kind}`)
    const r = duel.answer(w.seat, w.prompt.id, value as Answer)
    attempts = typeof r === 'string' ? attempts + 1 : 0
  }
}

describe('ordinateur qui réfléchit', { skip }, () => {
  before(() => {
    loadData()
  })

  it('n’attaque pas un monstre plus fort que le sien', async () => {
    const duel = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 1n, hands: [[C.warwolf], [C.celtic]] })
    duel.start()
    await play(duel, 1, scripted(['summon', 'toEnd']), 3)
    const view = duel.currentView(1)
    assert.equal(view.players[1].lp, 8000, 'Celtic Guardian (1400) n’a pas foncé sur Gene-Warped Warwolf (2000)')
    assert.equal(view.players[0].monsters.filter(Boolean).length, 1)
    duel.destroy()
  })

  it('attaque quand le combat est gagnant', async () => {
    const duel = await Duel.create([deck(C.celtic), deck(C.warwolf)], 0, { seed: 2n, hands: [[C.celtic], [C.warwolf]] })
    duel.start()
    await play(duel, 1, scripted(['summon', 'toEnd']), 3)
    const view = duel.currentView(1)
    assert.equal(view.players[0].lp, 7400, 'Warwolf (2000) détruit Celtic Guardian (1400) : 600 points de dommages')
    assert.equal(view.players[0].monsters.filter(Boolean).length, 0)
    duel.destroy()
  })

  it('finit son tour sans passer par la Battle Phase quand aucune attaque ne vaut la peine', async () => {
    const duel = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 4n, hands: [[C.warwolf], [C.celtic]] })
    duel.start()
    const computer = new Computer('normal')
    const chosen: string[] = []
    const script = scripted(['summon', 'toEnd'])
    for (let n = 0, attempts = 0; n < 300 && !duel.finished; n++) {
      const w = duel.waiting
      if (!w || duel.currentView(0).turn >= 3) break
      const value = w.seat === 1 ? await computer.choose(duel, w.seat, attempts) : script(w.prompt)
      if (w.seat === 1 && (w.prompt.kind === 'idle' || w.prompt.kind === 'battle')) chosen.push(w.prompt.options.find((o) => o.id === value)?.action ?? '?')
      const r = duel.answer(w.seat, w.prompt.id, value as Answer)
      attempts = typeof r === 'string' ? attempts + 1 : 0
    }
    // Celtic Guardian (1400) face à Warwolf (2000) : ni Battle Phase, ni Main Phase 2 ; on termine directement.
    assert.ok(!chosen.includes('toBattle') && !chosen.includes('toMain2') && !chosen.includes('attack'), chosen.join(', '))
    assert.equal(chosen[chosen.length - 1], 'toEnd')
    duel.destroy()
  })

  it('garde Trou Noir quand il ne détruirait que ses propres monstres', async () => {
    const duel = await Duel.create([deck(C.warwolf), deck(C.celtic)], 0, { seed: 3n, hands: [[C.warwolf, C.darkHole], []] })
    duel.start()
    await play(duel, 0, scripted([]), 2)
    const me = duel.currentView(0).players[0]
    assert.ok(me.hand.some((c) => c.cardId === C.darkHole), 'Trou Noir est resté en main')
    assert.equal(me.monsters.filter(Boolean).length, 1, 'Warwolf est sur le terrain')
    duel.destroy()
  })
})
