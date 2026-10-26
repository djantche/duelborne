// Accueil, salon, puis un duel complet contre l'ordinateur.
//   node tools/visual/ai.mjs [largeur] [hauteur] [desktop|mobile] [préfixe] [deck] [deck de l'IA]
//   ex. téléphone : node tools/visual/ai.mjs 844 390 mobile m yubel blue-eyes
import { SHOTS } from './cdp.mjs'
import { answerQuestions, enter, idle, open, passToss, playTurn, setup, sleep, tap, turnInfo, pickDeck } from './lib.mjs'

await setup()
const [W, H, MOBILE, TAG, DECK, AIDECK] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile', process.argv[5] ?? 'a', process.argv[6] ?? 'yugi', process.argv[7] ?? '']
const p = await open({ w: W, h: H, mobile: MOBILE })
await p.shot(`${TAG}-01-home.png`)
await enter(p, 'David', 'ai', DECK)
if (AIDECK) await pickDeck(p, AIDECK, 1)
await p.shot(`${TAG}-02-lobby.png`)
await tap(p, '[data-act="ready"]')
await sleep(900)
await p.shot(`${TAG}-02b-toss-spin.png`)
console.log('pile ou face :', await passToss(p, true, () => p.shot(`${TAG}-02c-toss.png`)))
await sleep(900)
await p.shot(`${TAG}-02d-toss-first.png`)
await sleep(3500); await idle(p)
await p.shot(`${TAG}-03-board.png`)
console.log('chronomètre affiché :', JSON.stringify(await p.eval(`[...document.querySelectorAll('.phase-clock')].map((e) => e.className + '=' + e.textContent)`)))
const seen = new Set(); let n = 0
const shot = async (q, kind) => { if (n < 10) await q.shot(`${TAG}-q${String(++n).padStart(2, '0')}-${kind.replace(/[^a-zA-Zéèà]+/g, '-').slice(0, 18)}.png`) }
let turns = 0
let mid = false
const t0 = Date.now()
// On joue jusqu'à la fin du duel (ou 5 minutes) : à notre tour on invoque et on attaque, sinon on répond aux questions.
while (Date.now() - t0 < 300_000) {
  const info = await turnInfo(p)
  if (info.won || !info.duel) break
  if (info.mine) {
    await playTurn(p, [p], seen, shot)
    turns++
  } else {
    await sleep(400)
    await answerQuestions(p, seen, (k) => shot(p, k))
  }
  if (turns >= 3 && !mid && (await p.pos('.pile.gy .card'))) {
    mid = true
    await idle(p)
    await p.shot(`${TAG}-04-mid.png`)
    // Cimetière ouvert, puis une carte touchée : sa fiche doit s'afficher par-dessus la fenêtre.
    await tap(p, '.pile.gy:has(.card)')
    await p.shot(`${TAG}-04b-graveyard.png`)
    const card = await p.pos('.modal.viewer .card')
    if (card) {
      await p.click(card.x, card.y)
      await sleep(300)
      await p.shot(`${TAG}-04c-graveyard-card.png`)
      console.log('fiche lisible par-dessus le Cimetière :', await p.eval(`(()=>{const d=document.getElementById('detail'); const r=d.getBoundingClientRect(); const top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return r.width > 50 && !!top?.closest('.left')})()`))
    }
    await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
    await sleep(200)
  }
}
await sleep(1500)
await p.shot(`${TAG}-05-end.png`)
console.log('captures dans', SHOTS)
console.log(TAG, 'fin', JSON.stringify(await turnInfo(p)), 'tours joués', turns, 'questions', [...seen], 'erreurs', p.logs.slice(0, 4))
console.log(await p.eval(`(document.getElementById('log')?.innerText ?? '').split('\\n').slice(-6).join(' | ')`))
process.exit(0)
