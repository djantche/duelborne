// Pierre-feuille-ciseaux : l'écran d'avant-duel (choisir une carte, victoire, défaite, égalité, choix du gagnant) et les
// cartes jouées en plein duel (question à trois cartes, puis entrechoc). États fabriqués, vrais clics ; les messages
// envoyés au serveur sont relevés.
//   node tools/visual/rps.mjs [largeur] [hauteur] [desktop|mobile]
import { open, setup, sleep } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const tag = MOBILE ? 'm' : 'd'
await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
await p.eval(`(async () => {
  WebSocket.prototype.send = function (d) { (window.__sent ??= []).push(JSON.parse(d)) }
  const S = (window.__s = {})
  S.store = (await import('/app/store.ts')).store
  S.render = await import('/app/render.ts')
  S.index = await import('/screens/duel/controller.ts')
  S.state = (await import('/screens/duel/state.ts')).duel
  S.toss = (rps, o = {}) => ({ kind: 'rps', rps: { round: 1, phase: 'pick', plays: true, picked: false, foePicked: false, picks: null, outcome: null, ...rps }, winner: 0, you: 0, names: ['David', 'Ordinateur'], chooser: 'David', choose: false, first: null, ms: 20000, ...o })
  S.show = (t) => { S.store.toss = t; S.render.redraw() }
  let u = 1
  S.card = (id) => ({ uid: u++, cardId: id })
  S.player = (o = {}) => ({ lp: 8000, deckCount: 30, hand: [], monsters: Array(7).fill(null), spellTraps: Array(5).fill(null), fieldZone: null, graveyard: [], banished: [], extra: [], ...o })
  S.view = (me, foe, o = {}) => ({ you: 0, players: [me, foe], turn: 3, turnPlayer: 0, phase: 'main1', winner: null, log: [], prompt: null, waitingFor: 0, chain: [], spectating: false, startLp: 8000, extraZones: false, unknownCards: {}, disabled: [], ...o })
  S.push = async (view, events = []) => { S.index.pushState({ t: 'state', view, events, names: ['David', 'Ordinateur'], connected: [true, true], timer: null }); await new Promise((r) => setTimeout(r, 60)); for (let i = 0; i < 300 && S.state.busy; i++) await new Promise((r) => setTimeout(r, 50)) }
})()`)
const E = (code) => p.eval(`(async () => { const S = window.__s; ${code} })()`)
const sent = () => p.eval(`window.__sent ?? []`)
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? '✓' : '✗', name, extra) }

// ── 1. Choisir une carte ──
await E(`S.show(S.toss({}))`)
await sleep(500)
await p.shot(`${tag}-rps-1-pick.png`)
check('trois cartes proposées', (await p.eval(`document.querySelectorAll('.rps-choice').length`)) === 3)
const rock = await p.pos('.rps-choice[data-hand="1"]')
await p.click(rock.x, rock.y)
await sleep(300)
check('clic sur « Feuille » : message envoyé au serveur', JSON.stringify((await sent()).filter((m) => m.t === 'rps')) === JSON.stringify([{ t: 'rps', hand: 1 }]), JSON.stringify(await sent()))
// le serveur confirme : la carte est posée, l'autre réfléchit
await E(`S.show(S.toss({ picked: true }))`)
await sleep(300)
await p.shot(`${tag}-rps-2-picked.png`)
check('après le choix, les cartes ne se rejouent pas', (await p.eval(`[...document.querySelectorAll('.rps-choice')].every((b) => b.disabled)`)) === true)

// ── 2. Entrechoc : victoire, défaite, égalité ──
for (const [name, picks, outcome] of [['win', [1, 0], 0], ['lose', [0, 1], 1], ['draw', [2, 2], 'draw']]) {
  await E(`S.show(S.toss({ round: ${name === 'draw' ? 2 : 1}, phase: 'pick' }))`)
  await sleep(200)
  const rec = p.record(4600, `${tag}-rps-3-${name}-`, Number(process.env.EVERY ?? 230))
  await E(`S.show(S.toss({ round: ${name === 'draw' ? 2 : 1}, phase: 'reveal', picked: true, foePicked: true, picks: ${JSON.stringify(picks)}, outcome: ${JSON.stringify(outcome)} }))`)
  console.log('images', name, (await rec).length)
  const state = await p.eval(`({ lost: document.querySelectorAll('.rps-card.lost').length, winner: document.querySelectorAll('.rps-card.winner').length, ghosts: document.querySelectorAll('#fx .ghost').length, text: document.querySelector('.rps-status')?.innerText })`)
  check(`entrechoc ${name} : ${outcome === 'draw' ? 'aucune carte détruite' : 'une carte détruite, une gagnante'}`, outcome === 'draw' ? state.lost === 0 : state.lost === 1 && state.winner === 1, JSON.stringify(state))
}
// ── 3. Manche gagnée : on choisit qui commence ──
await E(`S.show(S.toss({ phase: 'won', picked: true, foePicked: true, picks: [1, 0], outcome: 0 }, { winner: 0, choose: true }))`)
await sleep(400)
await p.shot(`${tag}-rps-4-won.png`)
const first = await p.pos('[data-act="toss"][data-first="1"]')
await p.click(first.x, first.y)
await sleep(200)
check('« Je commence » envoie le choix', (await sent()).some((m) => m.t === 'toss' && m.first === true))
await E(`S.show(S.toss({ phase: 'won', picked: true, foePicked: true, picks: [0, 1], outcome: 1 }, { winner: 1, choose: false, chooser: 'Ordinateur' }))`)
await sleep(300)
await p.shot(`${tag}-rps-5-foewon.png`)
await E(`S.store.toss = null; S.render.redraw()`)

// ── 4. En plein duel : question à trois cartes, puis entrechoc ──
const ID = { dm: 46986414, bewd: 89631139 }
await E(`const me = S.player({ hand: [S.card(${ID.dm}), S.card(${ID.bewd})], monsters: [{ card: S.card(${ID.dm}), position: 'atk', faceUp: true, atk: 2500, def: 2000, materials: 0 }, null, null, null, null, null, null] }); const foe = S.player({ hand: [S.card(null)] }); S.me = me; S.foe = foe; await S.push(S.view(me, foe))`)
await E(`await S.push(S.view(S.me, S.foe, { prompt: { id: 77, kind: 'option', text: '@srv.rps', options: ['@srv.scissors', '@srv.rock', '@srv.paper'], rps: true } }))`)
await sleep(400)
await p.shot(`${tag}-rps-6-prompt.png`)
check('question de la carte : trois cartes à jouer', (await p.eval(`document.querySelectorAll('.panel .rps-choice').length`)) === 3)
const paper = await p.pos('.panel .rps-choice[data-hand="1"]')
await p.click(paper.x, paper.y)
await sleep(300)
check('jouer « Feuille » répond 2 au moteur (ciseaux 0, pierre 1, feuille 2)', JSON.stringify((await sent()).filter((m) => m.t === 'answer')) === JSON.stringify([{ t: 'answer', id: 77, value: 2 }]), JSON.stringify((await sent()).filter((m) => m.t === 'answer')))
const rec = p.record(5200, `${tag}-rps-7-duel-`, 260)
await E(`await S.push(S.view(S.me, S.foe), [{ type: 'rps', hands: [1, 0] }])`)
console.log('images du duel', (await rec).length)
check('plus aucun voile ni fantôme après l’entrechoc', (await p.eval(`!document.querySelector('.fx-clash') && !document.querySelector('#fx .ghost')`)) === true)
console.log('erreurs de la page :', p.logs.slice(0, 6))
console.log(results.every(Boolean) ? 'TOUT PASSE' : 'ÉCHECS')
process.exit(results.every(Boolean) && !p.logs.length ? 0 : 1)
