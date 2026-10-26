// Pierre-feuille-ciseaux de bout en bout : salon contre l'ordinateur, réglage « Qui commence ? », vraies manches jouées
// avec de vrais clics jusqu'au début du duel.
//   node tools/visual/rps-e2e.mjs [largeur] [hauteur] [desktop|mobile]
import { SHOTS } from './cdp.mjs'
import { enter, has, open, setup, sleep, tap } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const tag = MOBILE ? 'm' : 'd'
await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
await enter(p, 'David', 'ai', 'yugi')
// Réglages → « Qui commence ? » → Pierre-feuille-ciseaux, avec de vrais clics.
await p.eval(`document.querySelector('details.settings').open = true; document.querySelector('.settings .sel[data-value="coin"]')?.scrollIntoView({ block: 'center' })`)
await sleep(300)
const first = await p.pos('.settings .sel[data-value="coin"]')
if (first) await p.click(first.x, first.y)
await sleep(250)
const option = await p.eval(`(() => { const li = [...document.querySelectorAll('.sel-list li')].find((x) => /feuille|rock/i.test(x.textContent)); if (!li) return null; const r = li.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
if (option) await p.click(option.x, option.y)
await sleep(300)
const set = (await p.eval(`document.querySelector('.settings .sel[data-value="rps"]') !== null`)) === true
console.log(set ? '✓' : '✗', 'le réglage « Pierre-feuille-ciseaux » existe dans le salon et se choisit')
await sleep(400)
await p.shot(`${tag}-e2e-1-lobby.png`)
await tap(p, '[data-act="ready"]')
let rounds = 0, draws = 0, ended = false
for (let i = 0; i < 400 && !ended; i++) {
  await sleep(150)
  if (await has(p, '.duel')) { ended = true; break }
  if (await has(p, '[data-act="toss"][data-first="1"]')) {
    await p.shot(`${tag}-e2e-3-won.png`)
    console.log('✓ manche gagnée : le choix de qui commence est proposé (manches jouées :', rounds + ', égalités :', draws + ')')
    await tap(p, '[data-act="toss"][data-first="1"]')
    continue
  }
  if (await has(p, '.rps-choice:not([disabled])')) {
    rounds++
    if (rounds === 1) await p.shot(`${tag}-e2e-2-pick.png`)
    const hand = rounds % 3
    const pos = await p.pos(`.rps-choice[data-hand="${hand}"]`)
    if (pos) await p.click(pos.x, pos.y)
    // la manche se joue : on attend l'entrechoc, puis soit la suite, soit une nouvelle manche
    for (let k = 0; k < 90 && (await has(p, '.rps-choice[disabled]')); k++) await sleep(100)
    if (await has(p, '.rps-status b')) { draws++ }
  }
}
console.log(rounds > 0 ? '✓' : '✗', 'de vraies manches ont été jouées :', rounds)
console.log(ended ? '✓' : '✗', 'le duel commence après le pierre-feuille-ciseaux')
await sleep(1500)
await p.shot(`${tag}-e2e-4-duel.png`)
console.log('erreurs de la page :', p.logs.slice(0, 5), '| captures dans', SHOTS)
process.exit(ended && set && rounds > 0 && !p.logs.length ? 0 : 1)
