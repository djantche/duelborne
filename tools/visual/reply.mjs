// Réponse en chaîne avec une carte à plusieurs effets (Véritable Lumière posée, puis activée au tour adverse).
//   node tools/visual/reply.mjs [largeur] [hauteur] [desktop|mobile] [préfixe]
import { SHOTS } from './cdp.mjs'
import { act, answerQuestions, enter, has, idle, open, passToss, setup, sleep, tap } from './lib.mjs'

// Mains imposées : le Piège et deux Dragons Blancs pour nous, un monstre pour l'ordinateur.
if (!process.env.TEST_HANDS) process.env.TEST_HANDS = '[[62089826,89631139,89631139],[89631139]]'
await setup()
const [W, H, MOBILE, TAG] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile', process.argv[5] ?? 'r']
const p = await open({ w: W, h: H, mobile: MOBILE })
await enter(p, 'David', 'ai', 'blue-eyes')
// On commence, pour poser le Piège avant le tour de l'ordinateur.
await p.eval(`(()=>{const s=document.querySelector('select[data-key="first"]'); s.value='0'; s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
await sleep(300)
await tap(p, '[data-act="ready"]')
await passToss(p)
await sleep(3500); await idle(p)
console.log('piège posé :', await act(p, '.hand.me .card.can', 'Poser'))
await answerQuestions(p)
for (let i = 0; i < 5 && (await has(p, '.phases.mine')); i++) { await idle(p); await tap(p, '.phases .end:not([disabled])'); await sleep(500) }
// Tour adverse : on attend les fenêtres de réponse. La première n'offre que l'activation de la carte ;
// une fois le Piège face recto, les suivantes proposent ses deux effets.
// Pendant que l'ordinateur réfléchit, le message d'attente doit s'afficher en haut de l'écran.
let wait = null
for (let round = 1; round <= 4; round++) {
  for (let i = 0; i < 80 && !(await has(p, '.modal.reply')); i++) {
    await sleep(120)
    if (!wait) {
      wait = await p.eval(`(()=>{const h=document.querySelector('#hint.show.wait'); if(!h) return null; const r=h.getBoundingClientRect(); return h.textContent+' — à '+Math.round(r.top)+' px du haut (écran de '+innerHeight+' px)'})()`)
      if (wait) await p.shot(`${TAG}-0-waiting.png`)
    }
    await idle(p)
    // « Activer l'effet à l'activation ? » : non, pour garder les deux effets disponibles ensuite.
    await tap(p, '#ui .panel [data-act="answer"][data-value="0"]')
  }
  if (!(await has(p, '.modal.reply'))) break
  console.log(`fenêtre ${round} — vignettes :`, await p.eval(`JSON.stringify([...document.querySelectorAll('.modal.reply .choice')].map((e) => e.innerText.trim().replace(/\\n/g, ' / ')))`))
  await tap(p, '.modal.reply .choice')
  const effects = await p.eval(`JSON.stringify([...document.querySelectorAll('.modal.reply [data-act="effect"]')].map((e) => e.innerText.replace(/\\n/g, ' : ')))`)
  if (effects === '[]') {
    await p.shot(`${TAG}-${round}-one-effect.png`)
    await tap(p, '.modal.reply [data-act="send-pick"]')
    await sleep(1200); await idle(p)
    continue
  }
  await p.shot(`${TAG}-${round}-card-picked.png`)
  console.log('effets proposés :', effects)
  console.log('Valider grisé avant de choisir l’effet :', await p.eval(`document.querySelector('.modal.reply [data-act="send-pick"]').disabled`))
  await tap(p, '.modal.reply [data-act="effect"]:nth-child(2)')
  await p.shot(`${TAG}-${round}-effect-picked.png`)
  console.log('Valider actif après le choix :', await p.eval(`!document.querySelector('.modal.reply [data-act="send-pick"]').disabled`))
  // Échap renonce au choix sans rien activer.
  await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(200)
  console.log('après Échap, fenêtre toujours là et rien de coché :', await p.eval(`!!document.querySelector('.modal.reply') && !document.querySelector('.modal.reply .choice.on')`))
  await tap(p, '.modal.reply .choice')
  await tap(p, '.modal.reply [data-act="effect"]:nth-child(1)')
  await tap(p, '.modal.reply [data-act="send-pick"]')
  break
}
console.log('message d’attente :', wait)
await sleep(1500); await idle(p)
await p.shot(`${TAG}-4-after.png`)
console.log(await p.eval(`(document.getElementById('log')?.innerText ?? '').split('\\n').slice(-5).join(' | ')`))
console.log('captures dans', SHOTS, 'erreurs', p.logs.slice(0, 4))
process.exit(0)
