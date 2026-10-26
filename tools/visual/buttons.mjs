// Contrôle des boutons communs et des résultats, sur ordinateur et téléphone, en français et en anglais.
//   node tools/visual/buttons.mjs
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

process.env.VISUAL_PORT ??= '3191'
const { open, openMode, setup, sleep } = await import('./lib.mjs')
const { SHOTS } = await import('./cdp.mjs')
await setup()
const report = []

for (const [device, w, h, mobile] of [['desktop', 1600, 900, false], ['mobile', 844, 390, true]]) {
  const p = await open({ w, h, mobile })
  const audit = async (scene) => {
    // Le résultat anime toute la rangée : mesurer sa taille finale, après son arrivée.
    await sleep(scene.startsWith('result-') ? 1200 : 400)
    const controls = await p.eval(`(() => [...document.querySelectorAll('.btn, .actions button, .lvl, .chip, .sub-back')]
      .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => { const r=e.getBoundingClientRect(); return { text:e.textContent.trim() || e.getAttribute('aria-label'), height:r.height, width:r.width, left:r.left, right:r.right, icon:[...e.querySelectorAll('svg')].map((s)=>({w:s.getBoundingClientRect().width,h:s.getBoundingClientRect().height})), result:!!e.closest('.result') } }))()`)
    assert.ok(controls.length, `${device}/${scene} : aucun bouton contrôlé`)
    for (const c of controls) {
      assert.ok(c.height <= 48, `${device}/${scene} : ${c.text}, hauteur ${c.height}`)
      for (const i of c.icon) assert.ok(i.w <= 24 && i.h <= 24, `${device}/${scene} : icône de ${c.text}, ${i.w} × ${i.h}`)
      if (c.result) {
        assert.ok(c.height <= 36, `${device}/${scene} : résultat trop haut (${c.height})`)
        assert.ok(c.left >= 0 && c.right <= w, `${device}/${scene} : résultat hors écran`)
      }
    }
    report.push({ device, scene, controls })
  }
  await p.eval(`(async()=>{window.__buttons={ store:(await import('/app/store.ts')).store, nav:(await import('/app/navigation.ts')).navigate, render:await import('/app/render.ts'), controller:await import('/screens/duel/controller.ts'), i18n:await import('/i18n.ts') }})()`)
  for (const screen of ['options', 'deck', 'replays']) {
    await p.eval(`window.__buttons.nav('${screen}')`)
    await audit(screen)
  }
  await p.eval(`window.__buttons.nav('home')`)
  await openMode(p, 'ai')
  await audit('lobby')
  await p.eval(`window.__buttons.render.openMenu(document.querySelector('[data-act="ready"]'), [{label:'Activer un effet',icon:'bolt',run:()=>{}},{label:'Ordinateur',icon:'computer',run:()=>{}}])`)
  await audit('menu')
  await p.eval(`window.__buttons.render.closeMenu(); window.__buttons.render.ask({title:'Confirmation',text:'Un bouton standard reste compact.',run:()=>{}})`)
  await audit('confirmation')
  await p.eval(`window.__buttons.render.closeAsk()`)
  for (const lang of ['fr', 'en']) for (const winner of [0, 1, 'draw']) {
    await p.eval(`(() => {
      const S=window.__buttons; S.i18n.setLang('${lang}'); S.store.menu=null;
      const player=()=>({lp:8000,deckCount:30,hand:[],monsters:Array(7).fill(null),spellTraps:Array(5).fill(null),fieldZone:null,graveyard:[],banished:[],extra:[]});
      S.controller.pushState({t:'state',matchId:'button-size-audit',names:['David','Ordinateur'],connected:[true,true],timer:null,events:[],view:{you:0,players:[player(),player()],turn:7,turnPlayer:0,phase:'end',winner:${JSON.stringify(winner)},log:[],logOffset:0,prompt:null,waitingFor:null,chain:[],disabled:[],spectating:false,startLp:8000,extraZones:true,unknownCards:{}}});
    })()`)
    await audit(`result-${lang}-${winner}`)
    await p.shot(`${device}-buttons-${lang}-${winner}.png`)
  }
  assert.deepEqual(p.logs.filter((l) => l.startsWith('EXC')), [], `${device} : exception dans le navigateur`)
  await p.close()
}
writeFileSync(path.join(SHOTS, 'button-sizes.json'), JSON.stringify(report, null, 2))
console.log(`${report.length} écrans contrôlés : boutons ≤ 48 px, résultats ≤ 36 px, icônes ≤ 24 px, sans débordement.`)
process.exit(0)
