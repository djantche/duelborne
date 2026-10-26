// Scènes de victoire du bac à sable, de bout en bout : Console → « Scène de victoire » → Exodia (ou dégâts fatals) → la fin du duel jouée par le moteur.
//   node tools/visual/sandbox-victory.mjs [exodia|effect] [largeur] [hauteur]
import { act, has, idle, open, setup, sleep, tap, openMode, pickDeck } from './lib.mjs'

const [which = 'exodia', W = 1280, H = 720] = process.argv.slice(2)
await setup()
const p = await open({ w: Number(W), h: Number(H) })
const text = (sel) => p.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`)
async function pick(label, within = '.panel .btn') {
  const i = await p.eval(`[...document.querySelectorAll(${JSON.stringify(within)})].findIndex(b => b.innerText.trim().toLowerCase().startsWith(${JSON.stringify(label.toLowerCase())}))`)
  if (i < 0) throw new Error(`bouton introuvable : ${label} (il y a : ${await text(within)})`)
  const pos = await p.eval(`(()=>{const r=[...document.querySelectorAll(${JSON.stringify(within)})][${i}].getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await p.click(pos.x, pos.y)
  await sleep(450)
  await idle(p)
}
const waitPrompt = async () => { for (let i = 0; i < 60 && !(await has(p, '.panel .btn, .modal.chooser, .zone.placeable')); i++) await sleep(150) }
await p.eval(`localStorage.clear(); location.hash = '#home'; location.reload()`); await sleep(2500)
await p.eval(`(()=>{const i=document.querySelector('input[name=name]'); i.value='David'; i.dispatchEvent(new Event('change',{bubbles:true}))})()`)
await openMode(p, 'sandbox')
await pickDeck(p, 'yubel')
await tap(p, '[data-act="ready"]')
for (let i = 0; i < 80 && !(await has(p, '.duel')); i++) await sleep(150)
await sleep(5000); await idle(p)
await idle(p); if (!(await act(p, '.mat .card[data-card="3900000001"][data-side="me"]', 'Activer'))) throw new Error('Console introuvable')
await waitPrompt()
console.log('menu :', await text('.panel .btn'))
await pick('Scène de victoire')
console.log('victoires :', await text('.panel .btn'))
await pick(which === 'exodia' ? 'Victoire d’Exodia' : 'Dégâts fatals')
// La scène : le terrain se vide, les cartes se posent, puis l'écran de résultat.
let shots = 0
for (let i = 0; i < 90; i++) {
  await sleep(200)
  // Les monstres créés demandent leur zone : on touche la première proposée.
  if (await has(p, '.zone.placeable')) { await tap(p, '.zone.placeable'); continue }
  const state = await p.eval(`JSON.stringify({ finale: document.querySelectorAll('.finale-card').length, result: !!document.querySelector('.result') })`)
  const s = JSON.parse(state)
  if (s.finale >= 2 && shots === 0) { await p.shot(`sbv-${which}-scene.png`); shots = 1; console.log('scène :', s.finale, 'cartes, écran de résultat :', s.result) }
  if (s.result) { await sleep(600); await p.shot(`sbv-${which}-result.png`); console.log('écran de résultat affiché après la scène :', shots === 1); break }
}
console.log('erreurs de la page :', p.logs.slice(0, 5))
process.exit(0)
