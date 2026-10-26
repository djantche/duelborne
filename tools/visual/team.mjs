// Duel par équipes : un joueur, trois ordinateurs (un coéquipier, deux adversaires).
//   node tools/visual/team.mjs [largeur] [hauteur] [desktop|mobile] [préfixe]
import { SHOTS } from './cdp.mjs'
import { answerQuestions, enter, idle, open, passToss, playTurn, setup, sleep, tap, turnInfo, pickDeck } from './lib.mjs'

const [W, H, MOBILE, TAG] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile', process.argv[5] ?? 't']
await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
await enter(p, 'David', 'team', null)
await p.shot(`${TAG}-01-team-lobby-empty.png`)
// Paramètres : 2 minutes par coup, 4000 LP.
await p.eval(`(()=>{const d=document.querySelector('details.settings'); d.open=true; for (const [k,v] of [['turnTime','120'],['startLp','4000']]) { const s=document.querySelector('select[data-key="'+k+'"]'); s.value=v; s.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
await sleep(400)
for (let i = 0; i < 3; i++) await tap(p, '[data-act="bot-add"]')
await pickDeck(p, 'kaiba')
await p.shot(`${TAG}-02-team-lobby-ready.png`)
await tap(p, '[data-act="ready"]')
console.log('pile ou face :', await passToss(p, true, () => p.shot(`${TAG}-02b-team-toss.png`)))
await sleep(3500)
await idle(p)
await p.shot(`${TAG}-03-team-board.png`)

const seen = new Set()
let turns = 0
let watched = false
const t0 = Date.now()
while (Date.now() - t0 < 200_000) {
  const info = await turnInfo(p)
  if (info.won || !info.duel) break
  const label = await p.eval(`document.querySelector('.turn-label b')?.textContent ?? ''`)
  if (!watched && label.includes('coéquipier')) {
    watched = true
    await p.shot(`${TAG}-04-partner-playing.png`)
  }
  const mine = await p.eval(`!!document.querySelector('.phases.mine') && !document.querySelector('.turn-label b')?.textContent.includes('coéquipier')`)
  if (mine) {
    await playTurn(p, [p], seen, null)
    turns++
  } else {
    await sleep(400)
    await answerQuestions(p, seen, null)
  }
}
await sleep(1200)
await p.shot(`${TAG}-05-team-end.png`)
console.log('captures dans', SHOTS)
console.log(TAG, 'fin', JSON.stringify(await turnInfo(p)), 'tours joués', turns, 'coéquipier vu en train de jouer', watched, 'erreurs', p.logs.slice(0, 4))
console.log(await p.eval(`(document.getElementById('log')?.innerText ?? '').split('\\n').slice(-7).join(' | ')`))
process.exit(0)
