// Audit de mise en page : ouvre chaque page à plusieurs tailles d'écran (téléphone en portrait et en paysage, tablette, ordinateur),
// mesure les débordements horizontaux et les doubles défilements, et enregistre une capture par page et par taille.
//
//   node tools/visual/layout.mjs [page...]        # pages : home account options deck rooms replays tournaments lobby (par défaut : toutes)
//   SIZES=390x844,844x390 node tools/visual/layout.mjs home
//
// Les captures vont dans $SHOTS (par défaut /tmp/yugioh-visual). Sortie : une ligne par page et par taille, « ok » ou la liste des défauts.
import { PORT, openPage, sleep, startChrome, startServer } from './cdp.mjs'

const SIZES = (process.env.SIZES ?? '390x844,844x390,768x1024,1280x800,1600x900').split(',').map((s) => s.split('x').map(Number))
const wanted = process.argv.slice(2)
const PAGES = ['home', 'account', 'account-in', 'options', 'deck', 'rooms', 'replays', 'tournaments', 'tournaments-create', 'tournaments-detail', 'lobby']

await startServer()
await startChrome()
const base = `http://localhost:${PORT}`
const post = async (path, body, token) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })).json()
const account = await post('/api/auth/register', { username: 'audit' + Date.now().toString(36), password: 'motdepasse-solide-1' })
const tournament = await post('/api/tournaments', { name: 'Coupe de l’audit', kind: 'single', mode: 'solo', format: 'casual', maxPlayers: 4, settings: {}, deck: '5ds-yusei-junk', aiLevel: 'easy' }, account.token)

/** Mesures exécutées dans la page. */
const MEASURE = `(() => {
  const vw = innerWidth, vh = innerHeight
  const label = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 3).map((c) => '.' + c).join('')
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden]') }
  const out = { hscroll: document.documentElement.scrollWidth - vw, overflowing: [], scrollers: [], tiny: [], clipped: [] }
  const seen = new Set()
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e)) continue
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    if ((r.right > vw + 1 || r.left < -1) && !e.closest('.route-snapshot') && !(s.position === 'fixed' && r.width > vw * 0.9)) {
      // Ignore ce qui est coupé par un parent qui défile ou qui masque son débordement.
      let p = e.parentElement, hidden = false
      while (p && p !== document.body) { const ps = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(ps.overflowX) && p.getBoundingClientRect().right <= vw + 1 && p.getBoundingClientRect().left >= -1) { hidden = true; break } p = p.parentElement }
      if (!hidden) { const k = label(e); if (!seen.has(k)) { seen.add(k); out.overflowing.push(k + ' ' + Math.round(r.left) + '→' + Math.round(r.right)) } }
    }
    if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2) out.scrollers.push(label(e) + ' ' + e.clientHeight + '/' + e.scrollHeight)
    if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2) out.scrollers.push(label(e) + ' ↔ ' + e.clientWidth + '/' + e.scrollWidth)
    if (e.matches('button, a, [role=button], input, select, .sel') && (r.height < 32 || r.width < 32) && r.width * r.height > 0) out.tiny.push(label(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
    if (s.overflow === 'hidden' && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && e.children.length === 0 && e.textContent.trim()) out.clipped.push(label(e) + ' ' + e.clientWidth + '/' + e.scrollWidth)
  }
  out.docScroll = document.scrollingElement.scrollHeight > vh + 2
  return out
})()`

async function goto(p, page) {
  const hash = page.startsWith('account') ? 'account' : page.startsWith('tournaments') ? 'tournaments' : page === 'lobby' ? 'home' : page
  await p.eval(`location.hash = '#${hash}'; location.reload()`)
  await sleep(1800)
  if (page === 'tournaments-create') { await p.eval(`document.querySelector('[data-act=tournament-new]')?.click()`); await sleep(500) }
  if (page === 'tournaments-detail') { await p.eval(`document.querySelector('[data-act=tournament-open]')?.click()`); await sleep(700) }
  if (page === 'lobby') {
    await p.eval(`document.querySelector('[data-act=menu][data-menu=solo]')?.click()`); await sleep(400)
    await p.eval(`document.querySelector('[data-act=play][data-mode=ai]')?.click()`); await sleep(900)
  }
}

let bad = 0
const p = await openPage(`${base}/`, 1280, 800)
await p.eval(`localStorage.setItem('name', 'Auditeur'); localStorage.setItem('tournament-mode', 'solo')`)
for (const page of PAGES.filter((n) => !wanted.length || wanted.includes(n))) {
  for (const [w, h] of SIZES) {
    const mobile = w < 900
    await p.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile, ...(mobile ? { screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } } : {}) })
    await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: mobile ? 'coarse' : 'fine' }, { name: 'hover', value: mobile ? 'none' : 'hover' }] })
    if (page === 'account') await p.eval(`localStorage.removeItem('auth')`)
    else await p.eval(`localStorage.setItem('auth', ${JSON.stringify(account.token)})`)
    await goto(p, page)
    const m = await p.eval(MEASURE)
    const problems = []
    if (m.hscroll > 1) problems.push(`défile en largeur (+${m.hscroll}px)`)
    if (m.overflowing.length) problems.push(`déborde : ${m.overflowing.slice(0, 4).join(' ; ')}`)
    if (m.scrollers.length > 2) problems.push(`${m.scrollers.length} zones qui défilent : ${m.scrollers.slice(0, 4).join(' ; ')}`)
    if (m.tiny.length && mobile) problems.push(`cibles < 32px : ${m.tiny.slice(0, 3).join(' ; ')}`)
    if (m.clipped.length) problems.push(`texte coupé : ${m.clipped.slice(0, 3).join(' ; ')}`)
    await p.shot(`layout-${page}-${w}x${h}.png`)
    if (problems.length) bad++
    console.log(`${page.padEnd(20)} ${`${w}x${h}`.padEnd(10)} ${problems.length ? problems.join(' | ') : 'ok'}${m.scrollers.length ? `  [défile : ${m.scrollers.slice(0, 2).join(' ; ')}]` : ''}`)
  }
}
console.log(bad ? `\n${bad} page(s) avec défauts.` : '\nAucun défaut mesuré.')
if (p.logs.length) console.log('Console :', p.logs.slice(0, 6).join('\n'))
process.exit(0)
