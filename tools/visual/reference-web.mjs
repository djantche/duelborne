// Capture du duel web pour l'état figé native/godot/reference/duel-state.json : la référence visuelle du client Godot.
//   node tools/visual/reference-web.mjs [largeur] [hauteur]   → <SHOTS>/ref-web.png et ref-web.json (positions mesurées)
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PORT, SHOTS, openPage, sleep, startChrome, startServer } from './cdp.mjs'

const [w = 1280, h = 800] = process.argv.slice(2).map(Number)
const state = readFileSync(path.resolve(import.meta.dirname, '../../native/godot/reference/duel-state.json'), 'utf8')
await startServer()
await startChrome()
const p = await openPage(`http://localhost:${PORT}/`, w, h)
for (let i = 0; i < 100 && !(await p.eval(`document.querySelector('.menu, .home, [data-act=menu]') !== null`)); i++) await sleep(300)
await sleep(3000)
const inject = () => p.eval(`(async () => {
  const net = await import('/screens/duel/controller.ts')
  const { store } = await import('/app/store.ts')
  store.room = { id: 'ref', mode: 'ai', you: 0, settings: {}, seats: [] }
  net.pushState(${state})
})()`)
for (let i = 0; i < 6; i++) { try { await inject(); break } catch (e) { console.log('nouvel essai :', String(e).slice(0, 80)); await sleep(3000) } }
await sleep(4000)
console.log('écran :', await p.eval(`(async () => (await import('/app/store.ts')).store.screen)()`), p.logs.slice(0, 4))
await p.shot('ref-web.png')
const rects = await p.eval(`(() => {
  const out = {}
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
  out.viewport = [innerWidth, innerHeight]
  out.mat = r(document.querySelector('.mat'))
  out.cards = [...document.querySelectorAll('.card[data-uid]')].map((e) => ({ uid: e.dataset.uid, rect: r(e), transform: getComputedStyle(e.closest('.hcard,.slot') ?? e).transform }))
  out.zones = [...document.querySelectorAll('.zone')].map((e) => ({ cls: e.className, rect: r(e) }))
  return out
})()`)
// Mise en page sans transformation : positions relatives au tapis (offsetLeft / offsetTop), pour recalculer la même grille ailleurs.
const layout = await p.eval(`(() => {
  const mat = document.querySelector('.mat')
  const rel = (e) => { let x = 0, y = 0, n = e; while (n && n !== mat) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent } return [x, y, e.offsetWidth, e.offsetHeight] }
  const box = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] }
  const css = (n) => getComputedStyle(document.querySelector('.duel')).getPropertyValue(n)
  const q = (s) => document.querySelector(s)
  return {
    ch: css('--ch'), cw: css('--cw'), zone: css('--zone'), mat: [mat.offsetWidth, mat.offsetHeight],
    matPadding: getComputedStyle(mat).padding, gap: getComputedStyle(mat).gap, rowGap: getComputedStyle(q('.half')).gap,
    arena: box(q('.arena')), matWrap: box(q('.mat-wrap')), left: box(q('.left')), right: box(q('.right')),
    zones: [...document.querySelectorAll('.zone')].map((e) => ({ cls: e.className, rel: rel(e) })),
    slots: [...document.querySelectorAll('.slot .card')].map((e) => ({ uid: e.dataset.uid, rel: rel(e.parentElement), card: [e.offsetWidth, e.offsetHeight] })),
    hands: [...document.querySelectorAll('.hand')].map((e) => ({ cls: e.className, box: box(e), cards: [...e.querySelectorAll('.hcard')].map((c) => ({ w: c.offsetWidth, h: c.offsetHeight, style: c.getAttribute('style'), margin: getComputedStyle(c).marginLeft + ' ' + getComputedStyle(c).marginRight, strip: getComputedStyle(c).getPropertyValue('--strip'), pos: [c.offsetLeft, c.offsetTop], tr: getComputedStyle(c).transform, origin: getComputedStyle(c).transformOrigin, box: box(c) })) })),
    hud: [...document.querySelectorAll('.hud, .phases, .tools')].map((e) => ({ cls: e.className, box: box(e) })),
    detail: box(q('.detail')),
  }
})()`)
writeFileSync(path.join(SHOTS, 'ref-layout.json'), JSON.stringify(layout, null, 1))
writeFileSync(path.join(SHOTS, 'ref-web.json'), JSON.stringify(rects, null, 1))
console.log('erreurs :', p.logs.slice(0, 5), '| captures dans', SHOTS)
process.exit(0)
