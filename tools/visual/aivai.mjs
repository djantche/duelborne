// IA contre IA de bout en bout : depuis l'accueil, on règle le niveau et le deck de chaque ordinateur avec les vrais
// sélecteurs, on lance le duel et on le regarde jouer (le spectateur dit au serveur quand son écran est à jour).
//   node tools/visual/aivai.mjs [largeur] [hauteur] [desktop|mobile]
import { SHOTS } from './cdp.mjs'
import { has, open, openMode, pickDeck, setup, sleep, tap } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const tag = MOBILE ? 'm' : 'd'
await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(ok ? '✓' : '✗', name, extra) }

await p.eval(`(()=>{const i=document.querySelector('input[name=name]'); i.value='David'; i.dispatchEvent(new Event('change',{bubbles:true}))})()`)
await p.clickSel('[data-act="menu"][data-menu="solo"]'); await sleep(500)
check('le sous-menu « Jouer en solo » propose « IA contre IA »', await has(p, '[data-act="play"][data-mode="aivai"]'))
await openMode(p, 'aivai')
await sleep(400)
await p.shot(`${tag}-aivai-1-lobby.png`)
check('le salon montre deux ordinateurs', (await p.eval(`document.querySelectorAll('.seat.on').length`)) === 2)
check('chaque ordinateur a sa vignette de deck et ses boutons de niveau', (await p.eval(`document.querySelectorAll('[data-act="pick-deck"]').length`)) === 2 && (await p.eval(`document.querySelectorAll('[data-act="ai-level"]').length`)) === 6)

async function level(seat, id) {
  await p.clickSel(`[data-act="ai-level"][data-seat="${seat}"][data-level="${id}"]`); await sleep(350)
  return p.eval(`document.querySelector('[data-act="ai-level"][data-seat="${seat}"][data-level="${id}"]').classList.contains('on')`)
}
check('niveau de l’ordinateur 1 : Expert', await level(0, 'hard'))
check('niveau de l’ordinateur 2 : Débutant', await level(1, 'easy'))
await pickDeck(p, 'kaiba', 0)
check('deck de l’ordinateur 1 choisi dans la fenêtre', (await p.eval(`document.querySelector('[data-act="pick-deck"][data-seat="0"] .slot-text b')?.textContent`)) === 'Kaiba', await p.eval(`document.querySelector('[data-act="pick-deck"][data-seat="0"] .slot-text b')?.textContent`))
const names = await p.eval(`[...document.querySelectorAll('.seat.on .seat-name')].map((b) => b.textContent)`)
check('chacun porte son numéro et son niveau', names[0] === 'IA 1 (Expert)' && names[1] === 'IA 2 (Débutant)', JSON.stringify(names))
check('« pile ou face » n’est pas proposé (personne ne tire au sort)', !(await p.eval(`document.body.innerText.includes('Pile ou face')`)))
await p.shot(`${tag}-aivai-2-levels.png`)

await tap(p, '[data-act="ready"]')
for (let i = 0; i < 100 && !(await has(p, '.duel')); i++) await sleep(150)
check('le duel s’ouvre', await has(p, '.duel'))
await sleep(3500)
await p.shot(`${tag}-aivai-3-duel.png`)
const hud = await p.eval(`[...document.querySelectorAll('.hud b, .hud .name')].map((e) => e.textContent).filter(Boolean).slice(0, 4)`)
console.log('en-têtes :', JSON.stringify(hud))
// Ils jouent seuls : le journal grossit et les tours avancent, sans qu'on touche à rien.
const log0 = await p.eval(`document.querySelectorAll('#log .line, #log > *').length`)
await sleep(26000)
const log1 = await p.eval(`document.querySelectorAll('#log .line, #log > *').length`)
const turn = await p.eval(`document.querySelector('.phases')?.parentElement?.innerText.match(/Tour\\s*(\\d+)/i)?.[1] ?? null`)
check('les ordinateurs jouent tout seuls', log1 > log0, `(journal : ${log0} → ${log1} lignes, tour ${turn})`)
await p.shot(`${tag}-aivai-4-later.png`)
check('aucune action possible pour le spectateur (pas de question)', !(await has(p, '.panel')) && !(await has(p, '.modal.reply')))

// Quitter ferme la salle et ramène à l'accueil.
await p.eval(`document.querySelector('[data-act="surrender"], .tools [data-act]')?.click()`)
console.log('erreurs de la page :', p.logs.slice(0, 5), '| captures dans', SHOTS)
process.exit(results.every(Boolean) && !p.logs.length ? 0 : 1)
