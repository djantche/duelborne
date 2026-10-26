// Écran des tournois sur une base de démonstration (tools/visual/seed-tournaments.ts) : liste, arbre, classements, page de création.
//
//   node tools/visual/tournaments.mjs [largeur] [hauteur] [desktop|mobile]
import { execSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PORT, openPage, sleep, startChrome, startServer } from './cdp.mjs'

const [w = 1280, h = 800, kind = 'desktop'] = process.argv.slice(2)
process.env.DUEL_SAVE_DIR = mkdtempSync(path.join(os.tmpdir(), 'duel-demo-'))
process.env.DUEL_NO_SYNC = '1'
const seeded = JSON.parse(execSync('node tools/visual/seed-tournaments.ts', { encoding: 'utf8', cwd: path.resolve(import.meta.dirname, '../..') }).trim().replace(/^ok /, ''))
await startServer()
await startChrome()
const base = `http://localhost:${PORT}`
const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'demo', password: 'motdepasse-solide-1' }) })).json()
const p = await openPage(`${base}/`, Number(w), Number(h))
if (kind === 'mobile') { await p.cmd('Emulation.setDeviceMetricsOverride', { width: Number(w), height: Number(h), deviceScaleFactor: 2, mobile: true }); await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }] }) }
const tag = `${kind[0]}${w}x${h}`
const go = async (name, setup) => {
  await p.eval(`localStorage.setItem('auth', ${JSON.stringify(login.token)}); ${setup}; location.hash = '#tournaments'; location.reload()`)
  await sleep(2200)
}
const shot = async (name) => { await p.shot(`tn-${tag}-${name}.png`); const m = await p.eval(`(() => ({ hscroll: document.documentElement.scrollWidth - innerWidth, errors: 0 }))()`); console.log('·', name, m.hscroll > 1 ? `défile en largeur +${m.hscroll}` : 'ok') }

await go('liste', `localStorage.setItem('tournament-mode','solo'); localStorage.removeItem('tournament-open')`)
await shot('liste-solo')
for (const [name, id] of [['single-bo3', seeded.a], ['swiss-fini', seeded.b], ['robin', seeded.c], ['single-fini', seeded.d]]) {
  await go(name, `localStorage.setItem('tournament-mode','solo'); localStorage.setItem('tournament-open','${id}')`)
  await shot(name)
}
await go('amis', `localStorage.setItem('tournament-mode','friends'); localStorage.removeItem('tournament-open')`)
await shot('liste-amis')
await go('amis-ouvert', `localStorage.setItem('tournament-mode','friends'); localStorage.setItem('tournament-open','${seeded.open}')`)
await shot('amis-ouvert')
await go('creation', `localStorage.setItem('tournament-mode','solo'); localStorage.removeItem('tournament-open')`)
await p.eval(`document.querySelector('[data-act=tournament-new]')?.click()`)
await sleep(700)
await shot('creation')
await p.eval(`document.querySelector('[data-act=kind-robin]')?.click()`)
await sleep(300)
await shot('creation-championnat')
// Combobox du deck : ouverte, puis recherche.
await p.eval(`document.querySelector('.cb')?.click()`)
await sleep(500)
await shot('combobox')
await p.eval(`(() => { const i = document.querySelector('.cb-panel input'); i.value = 'yu'; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
await sleep(300)
await shot('combobox-recherche')
console.log('options visibles :', await p.eval(`document.querySelectorAll('.cb-option').length`), '| groupes :', await p.eval(`[...document.querySelectorAll('.cb-group')].map((h) => h.textContent).join(', ')`))
await p.eval(`document.querySelector('.cb-option')?.click()`)
await sleep(300)
console.log('choix :', await p.eval(`document.querySelector('.cb .cb-text b')?.textContent`))
// Défilement : la page (et elle seule) défile.
console.log('défilement :', await p.eval(`(() => { const pg = document.querySelector('.app-page:not([hidden])'); const inner = [...pg.querySelectorAll('*')].filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2).map((e) => e.className); return 'page ' + pg.scrollHeight + '/' + pg.clientHeight + ', zones internes : ' + (inner.join(',') || 'aucune') })()`))
console.log('console :', p.logs.slice(0, 5).join(' | ') || 'rien')
process.exit(0)
