// Essai de la Console du bac à sable sur le vrai moteur : suit un parcours de menus et affiche ce qui se passe.
//   node tools/audit/console.ts "Ajouter une carte" "Pour moi" 70781052 "Sur le terrain"
// Chaque argument répond à la question suivante : un texte (début d'un choix de menu), un nombre (valeur à déclarer
// ou identifiant de carte) ou « #n » (rang d'une carte proposée, à partir de 0).
import { Bot } from '../../src/server/ai/bot.ts'
import { CONSOLE_CODE } from '../../src/server/ocg/sandbox.ts'
import { loadData } from '../../src/server/ocg/data.ts'
import { loadDecks } from '../../src/server/ocg/decks.ts'
import { Duel } from '../../src/server/ocg/duel.ts'
import type { DeckList } from '../../src/server/ocg/decks.ts'
import type { Answer, DuelView, Prompt } from '../../src/shared/protocol.ts'

loadData()
Duel.trace = (m) => { if (m.type === 23) console.log('   [SELECT_SUM select_max =', (m as { select_max: number }).select_max, 'min', (m as { min: number }).min, 'max', (m as { max: number }).max, ']') }
const decks = [...loadDecks().values()]
const plan = process.argv.slice(2)
const duel = await Duel.create([decks.find((d) => d.id === 'yubel') as DeckList, decks[0] as DeckList], 0, { seed: 5n }, { sandbox: true })
const foe = new Bot(1, { passive: true })
const log: string[] = []
const show = (v: DuelView): string => {
  const p = v.players[0]
  const f = v.players[1]
  return `main ${p.hand.length} | monstres ${p.monsters.filter(Boolean).length} | S/T ${p.spellTraps.filter(Boolean).length} (+terrain ${p.fieldZone ? 1 : 0}) | cimetière ${p.graveyard.length} | bannies ${p.banished.length} | deck ${p.deckCount} | LP ${p.lp}/${f.lp} | adverse: main ${f.hand.length} monstres ${f.monsters.filter(Boolean).length} deck ${f.deckCount}`
}
let steps = duel.start()
const events: string[] = []
const collect = (list: typeof steps): void => {
  for (const s of list) for (const e of s.events[0] ?? []) events.push(e.type === 'move' ? `move:${e.how}:${e.from}>${e.to}` : e.type === 'summon' ? `summon:${e.mode}` : e.type)
}
collect(steps)
let consoleStarted = false
for (let i = 0; i < 200 && !duel.finished; i++) {
  const w = duel.waiting
  if (!w) break
  const view = duel.currentView(w.seat)
  const prompt = view.prompt as Prompt
  let value: Answer | undefined
  if (w.seat === 1) value = foe.choose(view)
  else if (prompt.kind === 'idle' || prompt.kind === 'battle') {
    if (plan[0]?.startsWith('@') && (prompt.kind === 'idle' || prompt.kind === 'battle')) {
      // « @summon:89631139 » : choisir cette action de Main Phase pour cette carte.
      const [action, card] = (plan.shift() as string).slice(1).split(':')
      const o = prompt.options.find((o) => o.action === action && String(o.cardId) === card)
      if (!o) { console.log('Action introuvable :', action, card, JSON.stringify(prompt.options.map((o) => `${o.action}:${o.cardId}`))); break }
      value = o.id
    } else if ((!consoleStarted || plan[0] === '--') && prompt.kind === 'idle') {
      if (plan[0] === '--') plan.shift()
      const o = prompt.options.find((o) => o.action === 'activate' && o.cardId === CONSOLE_CODE)
      if (!o) { console.log('Console introuvable dans', JSON.stringify(prompt.options.map((o) => `${o.action}:${o.cardId}`))); break }
      consoleStarted = true
      value = o.id
    } else if (plan.length) { console.log('Parcours non terminé, il reste :', plan); break }
    else if (process.env.ENDTURN) {
      // Après le parcours : on passe le tour, puis on regarde la carte piochée au tour suivant.
      if (view.turn >= 3 && prompt.kind === 'idle') { console.log('Main au tour', view.turn, ':', view.players[0].hand.map((c) => c.cardId).join(' ')); break }
      value = (prompt.options.find((o) => o.action === 'toEnd') ?? prompt.options.find((o) => o.action === 'toMain2') ?? prompt.options[0])?.id
    } else break
  } else if (!plan.length) { console.log('Question sans réponse prévue :', JSON.stringify(prompt).slice(0, 400)); break }
  else {
    const next = plan.shift() as string
    console.log(`— ${prompt.kind}: ${'text' in prompt ? prompt.text : ''}`)
    if (prompt.kind === 'option') { console.log('   ', prompt.options.map((o, k) => `${k}=${o}`).join(' | ')); const k = /^#\d+$/.test(next) ? Number(next.slice(1)) : prompt.options.findIndex((o) => o.startsWith(next)); value = prompt.pick ? [k] : k }
    else if (prompt.kind === 'number') { console.log('   ', prompt.options.join(' ')); value = prompt.options.indexOf(Number(next)); if (value < 0) value = 0 }
    else if (prompt.kind === 'announce') { console.log(`    ${prompt.cards.length} cartes permises`); value = Number(next) }
    else if (prompt.kind === 'cards') { console.log('   ', prompt.cards.map((c, k) => `${k}=${c.cardId}/${c.zone}${c.index ?? ''}`).join(' | '), `min ${prompt.min} max ${prompt.max}`, prompt.weights ? `[poids ${prompt.weights}]` : '', prompt.ordered ? '[ordonner]' : '', prompt.sum ? `[somme ${prompt.sum.target} fixe ${prompt.sum.fixed ?? 0} ${JSON.stringify(prompt.sum.amounts)}]` : ''); value = prompt.mode === 'step' ? Number(next.replace('#', '')) : next.split(',').map((n) => Number(n.replace('#', ''))) }
    else if (prompt.kind === 'counters') { console.log('   ', JSON.stringify(prompt.cards.map((c) => c.max)), 'total', prompt.total); value = next.split(',').map(Number) }
    else if (prompt.kind === 'place') { console.log('   ', prompt.zones.map((z, k) => `${k}=${z.seat}:${z.zone}${z.index}`).join(' ')); value = prompt.count > 1 ? next.split(',').map(Number) : Number(next.replace('#', '')) }
    else if (prompt.kind === 'yesno') { console.log('   ', next); value = next === 'oui' }
    else if (prompt.kind === 'position') { value = Number(next.replace('#', '')) }
    else { console.log('   (non géré par ce script)', prompt.kind); break }
  }
  if (value === undefined) break
  const before = duel.refused
  const out = duel.answer(w.seat, w.prompt.id, value)
  if (typeof out === 'string') { console.log('refusé :', out); break }
  if (duel.refused > before) console.log('   ! le moteur a refusé cette réponse (RETRY)')
  collect(out)
}
console.log('\nÉtat :', show(duel.currentView(0)), '| zones désactivées', JSON.stringify(duel.currentView(0).disabled))
console.log('Événements :', events.filter((e) => !['draw', 'turn', 'phase', 'start', 'shuffle'].includes(e)).join(' '))
duel.destroy()
