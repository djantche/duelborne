// Aides des scénarios de test visuel (accueil → salle → duel, questions du moteur).
import { PORT, openPage, sleep, startChrome, startServer } from './cdp.mjs'
export { sleep }

/** Serveur neuf + Chrome : à appeler au début de chaque scénario. */
export async function setup() {
  await startServer()
  await startChrome()
}
export const idle = async (p) => { for (let i = 0; i < 150 && (await p.eval(`document.body.classList.contains('busy') || !!window.__busy`)); i++) await sleep(100) }
export async function open({ w = 1600, h = 900, mobile = false, host = 'localhost' } = {}) {
  const p = await openPage(`http://${host}:${PORT}/`, w, h)
  // Téléphone simulé : petit écran en paysage, pas de survol. Un toucher = un clic sans déplacement préalable.
  if (mobile) { await p.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } }); await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] }); p.touch = true; await p.cmd('Page.reload') }
  for (let i = 0; i < 60 && !(await p.eval(`!!document.querySelector('.home')`)); i++) await sleep(150)
  return p
}
export const has = (p, sel) => p.eval(`!!document.querySelector(${JSON.stringify(sel)})`)
export const tap = async (p, sel) => { const pos = await p.pos(sel); if (!pos) return false; await p.click(pos.x, pos.y); await sleep(280); return true }
/** Sous-menu de l'accueil où se trouve chaque mode de jeu. */
const MENU_OF = { ai: 'solo', aivai: 'solo', sandbox: 'solo', lan: 'multi', team: 'multi' }
/** Lance un mode depuis l'accueil : ouvre son sous-menu (« Jouer en solo », « Multijoueur ») puis touche le mode. */
export async function openMode(p, mode) {
  const sel = `[data-act="play"][data-mode="${mode}"]`
  if (!(await has(p, sel))) { await p.clickSel(`[data-act="menu"][data-menu="${MENU_OF[mode]}"]`); await sleep(500) }
  await p.clickSel(sel); await sleep(500)
  for (let i = 0; i < 40 && !(await has(p, '.lobby')); i++) await sleep(150)
}
/** Choisit un deck dans la fenêtre de choix : celui de sa propre place, ou celui de la place `seat` (un ordinateur). `deck` vide : au hasard. */
export async function pickDeck(p, deck, seat = null) {
  const slot = seat === null ? '.seat.mine [data-act="pick-deck"]' : `[data-act="pick-deck"][data-seat="${seat}"]`
  await p.clickSel(slot); await sleep(400)
  const tile = `.picker [data-act="pick"][data-deck="${deck}"]`
  await p.eval(`document.querySelector(${JSON.stringify(tile)})?.scrollIntoView({ block: 'center' })`); await sleep(150)
  await p.clickSel(tile); await sleep(400)
}
export async function enter(p, name, mode, deck) {
  await p.eval(`(()=>{const i=document.querySelector('input[name=name]'); i.value=${JSON.stringify(name)}; i.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await openMode(p, mode)
  if (deck) await pickDeck(p, deck)
}
/** Pile ou face d'avant-duel : attend le lancer et, si c'est à nous de choisir, commence (ou joue en second). */
export async function passToss(p, first = true, shot = null) {
  for (let i = 0; i < 20 && !(await has(p, '.toss')) && !(await has(p, '.duel')); i++) await sleep(150)
  if (!(await has(p, '.toss'))) return null
  for (let i = 0; i < 40 && !(await has(p, '.toss.landed')); i++) await sleep(100)
  await sleep(350)
  const text = await p.eval(`document.querySelector('.toss-result')?.innerText.replace(/\\n+/g, ' | ')`)
  if (shot) await shot()
  await tap(p, `.toss.landed [data-act="toss"][data-first="${first ? 1 : 0}"]`)
  return text
}
export const turnInfo = (p) => p.eval(`JSON.stringify({ mine: document.querySelector('.phases')?.classList.contains('mine') ?? false, won: !!document.querySelector('.result'), duel: !!document.querySelector('.duel') })`).then(JSON.parse)
/** ouvre le menu d'une carte et choisit l'entrée qui commence par `label` */
export async function act(p, sel, label) {
  const n = await p.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`)
  for (let i = 0; i < n; i++) {
    const pos = await p.eval(`(()=>{const e=document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+Math.min(22,r.height/2)}})()`)
    if (!pos) continue
    await p.click(pos.x, pos.y); await sleep(260)
    const items = await p.eval(`[...document.querySelectorAll('.actions button')].map(b=>b.getAttribute('aria-label') || b.textContent)`)
    const idx = items.findIndex((t) => t.startsWith(label))
    if (idx >= 0) { await p.clickSel(`.actions button:nth-child(${idx + 1})`); await sleep(350); await idle(p); return true }
    await p.eval(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`); await sleep(120)
  }
  return false
}
/** répond aux questions affichées ; `seen` reçoit le type de chaque question rencontrée ; `shot(kind)` pour capturer */
export async function answerQuestions(p, seen = new Set(), shot = null) {
  for (let k = 0; k < 10; k++) {
    await idle(p)
    const kind = await p.eval(`(()=>{ if (document.querySelector('.result')) return null; if (document.querySelector('.modal.chooser.reply')) return 'reply'; if (document.querySelector('.modal.chooser')) return 'chooser'; if (document.querySelector('.zone.placeable')) return 'place'; if (document.querySelector('.card.targetable')) return 'target'; const t=document.querySelector('#ui .panel .panel-title')?.innerText; if(!t) return null; if (document.querySelector('#app .card.pickable, #app .card.picked')) return 'pick'; return t.replace(/[0-9«»].*/,'').trim().slice(0,26) })()`)
    if (!kind) return
    if (!seen.has(kind)) { seen.add(kind); if (shot) await shot(kind) }
    if (kind === 'target') { await tap(p, '.card.targetable'); continue }
    if (kind === 'place') { await tap(p, '.zone.placeable'); continue }
    if (kind === 'reply') {
      // réponse en chaîne : rien ne doit partir avant « Valider »
      const before = await p.eval(`document.querySelector('.modal.reply').dataset.prompt`)
      await tap(p, '.modal.reply .choice')
      const state = await p.eval(`(()=>{const m=document.querySelector('.modal.reply'); const d=document.getElementById('detail'); return {still: m?.dataset.prompt, on: !!m?.querySelector('.choice.on'), ok: !m?.querySelector('[data-act="send-pick"]')?.disabled, detail: d?.querySelector('.card')?.dataset.card, tile: m?.querySelector('.choice')?.dataset.card, shown: document.body.classList.contains('show-detail')}})()`)
      if (!seen.has('reply-checked')) { seen.add('reply-checked'); console.log('réponse en chaîne :', JSON.stringify({ before, ...state })); if (shot) await shot('reply-picked') }
      // carte à plusieurs effets : « Valider » reste grisé tant qu'on n'a pas dit lequel
      const effects = await p.eval(`[...document.querySelectorAll('.modal.reply [data-act="effect"]')].map((e) => e.innerText.replace(/\\n/g, ' : '))`)
      if (effects.length) {
        const locked = await p.eval(`document.querySelector('.modal.reply [data-act="send-pick"]').disabled`)
        if (!seen.has('reply-effects')) { seen.add('reply-effects'); console.log('carte à plusieurs effets :', JSON.stringify(effects), 'Valider grisé avant le choix :', locked); if (shot) await shot('reply-effects') }
        await tap(p, '.modal.reply [data-act="effect"]:last-child')
      }
      // une fois sur deux on valide, sinon on passe
      const pass = (globalThis.__replies = (globalThis.__replies ?? 0) + 1) % 2 === 0
      if (pass && (await tap(p, '.modal.reply [data-act="answer"][data-value="null"]'))) continue
      await tap(p, '.modal.reply [data-act="send-pick"]:not([disabled])')
      continue
    }
    if (kind === 'chooser') {
      // coche des cartes jusqu'à pouvoir valider
      for (let i = 0; i < 6 && !(await has(p, '.modal.chooser [data-act="send-pick"]:not([disabled])')); i++) if (!(await tap(p, '.modal.chooser .choice:not(.on):not(.chosen)'))) break
      if (!(await tap(p, '.modal.chooser [data-act="send-pick"]:not([disabled])'))) await tap(p, '.modal.chooser [data-act="answer"]')
      continue
    }
    if (kind === 'pick') {
      for (let i = 0; i < 6 && !(await has(p, '#ui .panel [data-act="send-pick"]:not([disabled])')); i++) if (!(await tap(p, '#app .card.pickable'))) break
      if (!(await tap(p, '#ui .panel [data-act="send-pick"]:not([disabled])'))) await tap(p, '#ui .panel [data-act="answer"]')
      continue
    }
    if (await tap(p, '#ui .panel [data-act="answer"][data-value="null"]')) continue
    if (await tap(p, '#ui .panel [data-act="answer"]')) continue
    return
  }
}
/** joue un tour simple pour la page p : invoquer, attaquer, finir */
export async function playTurn(p, pages, seen, shot) {
  const all = async () => { for (const q of pages) await answerQuestions(q, seen, shot ? (k) => shot(q, k) : null) }
  await all()
  if (!(await act(p, '.hand.me .card.can', 'Invoquer'))) await act(p, '.hand.me .card.can', 'Poser')
  await all()
  if (await tap(p, '.phase.go[data-id]:nth-child(4)')) {
    await sleep(700)
    for (let k = 0; k < 6; k++) {
      await all()
      if ((await turnInfo(p)).won) return
      const atk = await p.pos('.mat .mz .card.can[data-side="me"]'); if (!atk) break
      await p.click(atk.x, atk.y); await sleep(350)
      const d = await p.pos('.arena.aim-direct .direct'); if (d) { await p.click(d.x, d.y); await sleep(300) }
      await all(); await sleep(300); await idle(p)
    }
  }
  await all()
  if (!(await turnInfo(p)).won) { await tap(p, '.btn.end:not([disabled])'); await sleep(600) }
  await all()
}
