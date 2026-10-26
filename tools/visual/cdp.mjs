// Mini client CDP : pilote un Chrome sans fenêtre pour tester l'interface comme un joueur
// (vrais clics, captures d'écran, enregistrement d'une animation).
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

export const PORT = Number(process.env.VISUAL_PORT ?? 3100)
const CDP = 9333
/** Dossier des captures (hors du dépôt par défaut). */
export const SHOTS = process.env.SHOTS ?? path.join(os.tmpdir(), 'yugioh-visual')
mkdirSync(SHOTS, { recursive: true })

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const up = async (url) => fetch(url, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false)
const waitFor = async (url, what) => {
  for (let i = 0; i < 80; i++) {
    if (await up(url)) return
    await sleep(300)
  }
  throw new Error(`${what} ne répond pas`)
}

/** Lance un serveur de jeu neuf (aucune salle, aucune session) sur PORT. */
export async function startServer() {
  const root = path.resolve(import.meta.dirname, '../..')
  const server = spawn(process.execPath, ['src/server/index.ts'], { cwd: root, env: { BOT_DELAY: '250', ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] })
  process.on('exit', () => server.kill())
  await waitFor(`http://localhost:${PORT}/`, 'Le serveur de jeu')
  return server
}

/** Lance Chrome sans fenêtre (ou réutilise celui qui tourne déjà). */
export async function startChrome() {
  if (await up(`http://localhost:${CDP}/json/version`)) return
  const bin = process.env.CHROME ?? 'google-chrome-stable'
  const chrome = spawn(bin, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(os.tmpdir(), 'yugioh-visual-chrome')}`, '--window-size=1600,900', '--hide-scrollbars', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' })
  process.on('exit', () => chrome.kill())
  await waitFor(`http://localhost:${CDP}/json/version`, 'Chrome')
}

export async function openPage(url, w = 1600, h = 900) {
  const t = await (await fetch(`http://localhost:${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json()
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r) => ws.on('open', r))
  let id = 0
  const pending = new Map()
  const logs = []
  const frames = []
  ws.on('message', (d) => {
    const m = JSON.parse(d)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
    if (m.method === 'Page.screencastFrame') { frames.push({ t: Date.now(), data: m.params.data }); ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } })) }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  const cmd = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  await cmd('Runtime.enable'); await cmd('Page.enable')
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  const page = {
    logs, cmd, id: t.id,
    /** vrai = écran tactile simulé : un toucher est un clic sans déplacement préalable de la souris */
    touch: false,
    async eval(expr) { const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result?.result?.value },
    async shot(name) { const file = path.join(SHOTS, name); await cmd('Page.bringToFront'); const r = await cmd('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); return file },
    async move(x, y) { if (page.touch) return; await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }) },
    async click(x, y) { await page.move(x, y); await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }) },
    /** vraie frappe d'une touche (flèches, Entrée, Échap, lettres, « ? ») ; `shift` : avec Maj */
    async key(key, shift = false) {
      const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, ' ': 32, '?': 191 }
      const vk = codes[key] ?? key.toUpperCase().charCodeAt(0)
      const text = key === 'Enter' ? '\r' : key.length === 1 ? key : undefined
      const base = { key, code: key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key === ' ' ? 'Space' : key === '?' ? 'Slash' : key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: shift || key === '?' ? 8 : 0 }
      await cmd('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text, unmodifiedText: text } : {}) })
      await cmd('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    },
    /** centre d'un élément (sélecteur CSS) */
    async pos(sel) { return page.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`) },
    async clickSel(sel) { const p = await page.pos(sel); if (!p) throw new Error('introuvable : ' + sel); await page.click(p.x, p.y); return p },
    /** filme l'écran pendant ms ; renvoie une image toutes les ~every ms */
    async record(ms, prefix, every = 90) { frames.length = 0; await cmd('Page.bringToFront'); await cmd('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 }); const t0 = Date.now(); await sleep(ms); await cmd('Page.stopScreencast'); let last = -1e9; const out = []; for (const f of frames) { if (f.t - last < every) continue; last = f.t; const file = path.join(SHOTS, prefix + String(f.t - t0).padStart(5, '0') + '.jpg'); writeFileSync(file, Buffer.from(f.data, 'base64')); out.push(file) } return out },
    close: () => fetch(`http://localhost:${CDP}/json/close/${t.id}`),
  }
  return page
}
