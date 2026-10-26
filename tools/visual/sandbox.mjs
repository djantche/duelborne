// Bac à sable de bout en bout : accueil → bac à sable → Console → ajouter une carte, jetons, dés, ordre, compteurs...
//   node tools/visual/sandbox.mjs [largeur] [hauteur] [desktop|mobile]
import { act, has, idle, open, setup, sleep, tap, openMode, pickDeck } from './lib.mjs'

await setup()
const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const tag = MOBILE ? 'sm' : 'sd'
const p = await open({ w: W, h: H, mobile: MOBILE })
const shot = (n) => p.shot(`${tag}-${n}.png`)
const text = (sel) => p.eval(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => e.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`)
/** Touche le bouton du panneau de question dont le texte commence par `label`. */
async function pick(label, within = '.panel .btn') {
  const i = await p.eval(`[...document.querySelectorAll(${JSON.stringify(within)})].findIndex(b => b.innerText.trim().toLowerCase().startsWith(${JSON.stringify(label.toLowerCase())}))`)
  if (i < 0) throw new Error(`bouton introuvable : ${label} (il y a : ${await text(within)})`)
  const pos = await p.eval(`(()=>{const r=[...document.querySelectorAll(${JSON.stringify(within)})][${i}].getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`)
  await p.click(pos.x, pos.y)
  await sleep(450)
  await idle(p)
}
const waitPrompt = async () => { for (let i = 0; i < 60 && !(await has(p, '.panel .btn, .modal.chooser, .zone.placeable')); i++) await sleep(150) }
const consoleOpen = async () => { await idle(p); if (!(await act(p, '.mat .card[data-card="3900000001"][data-side="me"]', 'Activer'))) throw new Error('Console introuvable') ; await waitPrompt() }

// ── Accueil → bac à sable → deck → duel ──
await p.eval(`(()=>{const i=document.querySelector('input[name=name]'); i.value='David'; i.dispatchEvent(new Event('change',{bubbles:true}))})()`)
await shot('01-home')
await openMode(p, 'sandbox')
await shot('02-lobby')
await pickDeck(p, 'yubel')
await tap(p, '[data-act="ready"]')
for (let i = 0; i < 80 && !(await has(p, '.duel')); i++) await sleep(150)
await sleep(5000); await idle(p)
await shot('03-board')
console.log('Console visible sur le terrain :', await has(p, '.mat .card[data-card="3900000001"]'))

// ── 1. Ajouter une carte : recherche du nom ──
await consoleOpen()
await shot('04-menu')
console.log('menu :', await text('.panel .btn'))
await pick('Ajouter une carte'); await pick('Pour moi')
for (let i = 0; i < 30 && !(await has(p, '.modal.announce')); i++) await sleep(150)
await p.eval(`(()=>{const i=document.querySelector('.search'); i.focus()})()`)
await p.cmd("Input.insertText", { text: "dragon noir aux yeux" }); await sleep(500)
await shot('05-announce')
console.log('résultats :', await text('.modal.announce .choice small'))
await tap(p, '.modal.announce .choice'); await sleep(300)
await shot('06-announce-picked')
await pick('Déclarer', '.modal.announce .btn'); await pick('Sur le terrain')
await waitPrompt(); await shot('07-place')
await tap(p, '.zone.placeable'); await sleep(2500); await idle(p)
await shot('08-added')

// ── 2. Jetons ──
await consoleOpen(); await pick('Créer des jetons'); await pick('Pour moi'); await pick('Jeton Mouton'); await pick('3')
for (let k = 0; k < 3; k++) { await waitPrompt(); await tap(p, '.zone.placeable'); await sleep(1200); await idle(p) }
await shot('09-tokens')

// ── 3. Dés et pièces ──
await consoleOpen(); await pick('Lancer des dés'); 
const rec = p.record(2600, `${tag}-dice-`, 220)
await pick('2'); await rec
await shot('10-dice')

// ── 4. Compteurs : poser sur deux jetons (2 puis 1), puis en retirer 2 ──
const onToken = async (n) => { const pos = await p.eval(`(()=>{const e=[...document.querySelectorAll('.mat .mz .card.pickable')][${n}]; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}})()`); await p.click(pos.x, pos.y); await sleep(400) }
const addCounter = async (n) => {
  await consoleOpen(); await pick('Agir sur une carte')
  await sleep(500); await onToken(n); await pick('Valider')
  await pick('Poser un compteur'); await pick('Compteur Magique'); await sleep(1800); await idle(p)
}
await addCounter(1); await addCounter(1); await addCounter(2)
await shot('12-counters')
console.log('compteurs :', await text('.ctrs'))
await consoleOpen(); await pick('Tests du moteur'); await pick('Retirer 2')
for (let i = 0; i < 30 && !(await has(p, '.modal.counters')); i++) await sleep(150)
await shot('13-remove-counters')
await tap(p, '.counter-pick:nth-child(1) .stepper .btn:last-child'); await tap(p, '.counter-pick:nth-child(2) .stepper .btn:last-child')
await shot('14-remove-counters-set')
console.log('retrait :', await text('.modal.counters .counter-pick'), '| Valider actif :', await p.eval(`!document.querySelector('.modal.counters [data-act="send-pick"]').disabled`))
await tap(p, '.modal.counters [data-act="send-pick"]'); await sleep(2200); await idle(p)
console.log('compteurs après :', await text('.ctrs'))

// ── 5. Ordonner le dessus du Deck ──
await consoleOpen(); await pick('Tests du moteur'); await pick('Ordonner')
for (let i = 0; i < 30 && !(await has(p, '.modal.chooser')); i++) await sleep(150)
await tap(p, '.modal.chooser .choice:nth-child(3)'); await tap(p, '.modal.chooser .choice:nth-child(1)')
await shot('15-sort')
console.log('rangs :', await text('.modal.chooser .rank'), '| Valider actif :', await p.eval(`!document.querySelector('.modal.chooser [data-act="send-pick"]').disabled`))
await tap(p, '.modal.chooser .choice:nth-child(2)')
await tap(p, '.modal.chooser [data-act="send-pick"]'); await sleep(1500); await idle(p)

// ── 6. Désactiver une zone ──
await consoleOpen(); await pick('Tests du moteur'); await pick('Désactiver')
await waitPrompt(); await tap(p, '.zone.placeable'); await sleep(2000); await idle(p)
await shot('16-disabled-zone')
console.log('zones désactivées :', await p.eval(`document.querySelectorAll('.zone.disabled').length`))

// ── 7. Points de vie de l'adversaire ──
await consoleOpen(); await pick('Modifier les points'); await pick('Pour l’adversaire'); await pick('Infliger'); 
const rec2 = p.record(2400, `${tag}-lp-`, 250)
await pick('2000'); await rec2
await shot('17-lp')
console.log('LP :', await text('.hud .lp-num'))

// ── 8. Pierre-feuille-ciseaux ──
await consoleOpen(); await pick('Tests du moteur'); await pick('Pierre-feuille')
await waitPrompt(); await shot('18-rps'); console.log('pierre-feuille-ciseaux :', await text('.panel .btn'))
await pick('Pierre'); await sleep(2000); await idle(p)
console.log('journal :', await p.eval("document.getElementById('log')?.innerText.split(String.fromCharCode(10)).slice(-4).join(' | ') ?? ''"))
console.log('erreurs de la page :', p.logs.slice(0, 5))
process.exit(0)
