// Regarder un duel IA contre IA d'un tournoi solo, depuis le tableau.
//
// (variante de tournament-solo.mjs) Tournoi solo de bout en bout, dans le navigateur : créer, commencer, jouer son match contre l'ordinateur (puis abandonner pour aller vite),
// revenir au tableau et vérifier que le résultat y apparaît.
//
//   node tools/visual/tournament-solo.mjs [largeur] [hauteur] [desktop|mobile]
import { PORT, openPage, sleep, startChrome, startServer } from './cdp.mjs'
import { has, passToss, tap } from './lib.mjs'

const [w = 1280, h = 800, kind = 'desktop'] = process.argv.slice(2)
await startServer()
await startChrome()
const base = `http://localhost:${PORT}`
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json()
const account = await post('/api/auth/register', { username: 'solo' + Date.now().toString(36), password: 'motdepasse-solide-1' })
const p = await openPage(`${base}/`, Number(w), Number(h))
if (kind === 'mobile') { await p.cmd('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 2, mobile: true }); await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); p.touch = true }
await p.eval(`localStorage.setItem('auth', ${JSON.stringify(account.token)}); localStorage.setItem('tournament-mode','solo'); localStorage.removeItem('tournament-open'); location.hash = '#tournaments'; location.reload()`)
await sleep(2000)
const step = async (name) => { await p.shot(`tsolo-${name}.png`); console.log('·', name) }
const wait = async (sel, ms = 15000) => { for (let i = 0; i < ms / 200; i++) { if (await has(p, sel)) return true; await sleep(200) } console.log('✗ introuvable :', sel); await step('echec'); return false }

await wait('[data-act=tournament-new]')
await step('liste')
await tap(p, '[data-act=tournament-new]')
if (!(await wait('input[name=tournament-name]'))) process.exit(1)
await p.eval(`(()=>{const i=document.querySelector('input[name=tournament-name]'); i.value='Coupe test'; i.dispatchEvent(new Event('input',{bubbles:true}))})()`)
await step('creation')
await p.eval("document.querySelector('[data-act=tournament-create]')?.scrollIntoView({ block: 'center' })"); await sleep(250)
await tap(p, '[data-act=tournament-create]')
if (!(await wait('[data-act=tournament-start]'))) process.exit(1)
await step('inscriptions')
await tap(p, '[data-act=tournament-start]')
if (!(await wait('[data-act=tournament-play]'))) process.exit(1)
await step('match-pret')
await sleep(1500)
const t0 = Date.now()
if (!(await wait('[data-act=tournament-watch]', 60000))) process.exit(1)
console.log('bouton après', Date.now() - t0, 'ms')
await step('regarder-bouton')
await tap(p, '[data-act=tournament-watch]')
if (!(await wait('.duel', 20000))) process.exit(1)
await sleep(6000)
await step('regarder-duel')
console.log('actions:', await p.eval(`[...document.querySelectorAll('.duel [data-act]')].map((e) => e.dataset.act).join(',')`))
console.log('journal/état:', await p.eval(`document.querySelector('.duel')?.innerText.slice(0, 200)`))
await tap(p, '[data-act=surrender]')
await sleep(800)
await step('regarder-sortie')
console.log(await p.eval(`location.hash + ' | ' + !!document.querySelector('[data-act=tournament-play]')`))
if (p.logs.length) console.log('Console :', p.logs.slice(0, 8).join('\n'))
process.exit(0)
