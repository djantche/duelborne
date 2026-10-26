// Deux joueurs en réseau local, avec des decks modernes (Zones Monstre Extra, choix de zone, piles).
//   node tools/visual/lan.mjs [largeur] [hauteur] [desktop|mobile] [préfixe] [deck 1] [deck 2]
import { SHOTS } from './cdp.mjs'
import { answerQuestions, enter, has, idle, open, passToss, playTurn, setup, sleep, tap, turnInfo } from './lib.mjs'

const [W, H, MOBILE, TAG, D1, D2] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile', process.argv[5] ?? 'l', process.argv[6] ?? 'yubel', process.argv[7] ?? 'blue-eyes']
await setup()
const a = await open({ w: W, h: H, mobile: MOBILE })
const b = await open({ w: W, h: H, mobile: MOBILE, host: '127.0.0.1' })
await enter(a, 'David', 'lan', D1)
await enter(b, 'Petit frère', 'lan', D2)
await a.shot(`${TAG}-01-lobby.png`)
await tap(a, '[data-act="ready"]')
await tap(b, '[data-act="ready"]')
// Pile ou face : le joueur désigné choisit de jouer en second, l'autre attend.
console.log('pile ou face, joueur 1 :', await passToss(a, false, () => a.shot(`${TAG}-01b-toss-a.png`)))
console.log('pile ou face, joueur 2 :', await passToss(b, false, () => b.shot(`${TAG}-01c-toss-b.png`)))
await sleep(900)
await a.shot(`${TAG}-01d-toss-first.png`)
await sleep(3500)
await idle(a)
await idle(b)
const pages = [a, b]
const seen = new Set()
let n = 0
const shot = async (q, kind) => {
  if (n < 14) await q.shot(`${TAG}-q${String(++n).padStart(2, '0')}-${kind.replace(/[^a-zA-Zéèà]+/g, '-').slice(0, 18)}.png`)
}
await a.shot(`${TAG}-02-board.png`)

// Piles : Extra Deck, puis Cimetière avec une carte touchée (la fiche doit passer au-dessus de la fenêtre).
await tap(a, '.pile.extra[data-side="me"]')
await a.shot(`${TAG}-03-extra.png`)
const first = await a.pos('.modal.viewer .card')
if (first) {
  await a.click(first.x, first.y)
  await sleep(300)
  await a.shot(`${TAG}-04-extra-card-tapped.png`)
  console.log('fiche au-dessus de la fenêtre :', await a.eval(`(()=>{const d=document.querySelector('.left'); const r=d.getBoundingClientRect(); const top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return getComputedStyle(d).display + ' · élément au premier plan dans la fiche : ' + !!top?.closest('.left')})()`))
}
await a.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
await sleep(200)

let turns = 0
const t0 = Date.now()
while (Date.now() - t0 < 240_000 && turns < 14) {
  const ia = await turnInfo(a)
  if (ia.won || !ia.duel) break
  const p = ia.mine ? a : b
  // Tour moderne : tout ce qui s'active ou s'invoque spécialement, puis le tour simple habituel.
  for (let k = 0; k < 6; k++) {
    for (const q of pages) await answerQuestions(q, seen, (kind) => shot(q, kind))
    const { act } = await import('./lib.mjs')
    if (!(await act(p, '.hand.me .card.can', 'Activer')) && !(await act(p, '.hand.me .card.can', 'Invocation Spéciale'))) break
  }
  await playTurn(p, pages, seen, shot)
  turns++
  if (turns === 2 || turns === 5) await p.shot(`${TAG}-05-turn${turns}.png`)
}
await sleep(1000)
await a.shot(`${TAG}-06-end.png`)
console.log('captures dans', SHOTS)
console.log(TAG, 'fin', JSON.stringify(await turnInfo(a)), 'tours', turns, 'questions', [...seen], 'erreurs', a.logs.slice(0, 4), b.logs.slice(0, 4))
console.log(await a.eval(`(document.getElementById('log')?.innerText ?? '').split('\\n').slice(-10).join(' | ')`))
console.log('zones extra affichées :', await has(a, '.duel.emz .zone.emz'))
process.exit(0)
