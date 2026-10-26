// Message d'attente : chez le joueur dont ce n'est pas le tour, « L'adversaire réfléchit… » s'affiche en haut de l'écran.
//   node tools/visual/waiting.mjs [largeur] [hauteur] [desktop|mobile] [préfixe]
import { SHOTS } from './cdp.mjs'
import { enter, idle, open, passToss, setup, sleep, tap } from './lib.mjs'

const [W, H, MOBILE, TAG] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile', process.argv[5] ?? 'w']
await setup()
const a = await open({ w: W, h: H, mobile: MOBILE })
const b = await open({ w: W, h: H, mobile: MOBILE, host: '127.0.0.1' })
await enter(a, 'David', 'lan', 'yugi')
await enter(b, 'Petit frère', 'lan', 'kaiba')
await tap(a, '[data-act="ready"]')
await tap(b, '[data-act="ready"]')
await passToss(a)
await passToss(b)
await sleep(4500)
for (const [name, p] of [['joueur 1', a], ['joueur 2', b]]) {
  await idle(p)
  const hint = await p.eval(`(()=>{const h=document.querySelector('#hint.show'); if(!h) return null; const r=h.getBoundingClientRect(); return h.textContent+' — classe « '+h.className+' », à '+Math.round(r.top)+' px du haut (écran de '+innerHeight+' px)'})()`)
  console.log(name, ':', hint)
  if (hint) await p.shot(`${TAG}-waiting.png`)
}
console.log('captures dans', SHOTS)
process.exit(0)
