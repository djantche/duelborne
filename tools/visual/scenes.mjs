// Scènes de duel fabriquées de toutes pièces : on envoie au client des états et des événements écrits à la main,
// sans serveur de duel ni adversaire, pour voir des situations rares (compteurs, terrain, niveaux requis, défausse...).
//   node tools/visual/scenes.mjs [largeur] [hauteur] [desktop|mobile] [scène...]
//   scènes : board sum fusion chooser attack extra anim negate summons detail intro phases phone notices setactivate piletip keyboard flicker frames chainmarks handmenu fieldswap replyclose (toutes par défaut)
import { SHOTS } from './cdp.mjs'
import { has, open, setup, sleep } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const want = process.argv.slice(5)
const tag = MOBILE ? 'm' : 'd'
const run = (name) => !want.length || want.includes(name)

await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
// Les écrans du jeu sont des modules de Vite : on y accède par leur adresse, ce sont les mêmes instances que celles de l'application.
await p.eval(`(async () => {
  // Pas de vrai duel derrière : les réponses du client ne partent nulle part (le serveur répondrait « home » et viderait la scène).
  WebSocket.prototype.send = () => {}
  const S = (window.__s = {})
  S.index = await import('/screens/duel/controller.ts')
  S.state = (await import('/screens/duel/state.ts')).duel
  S.store = (await import('/app/store.ts')).store
  S.u = 1
  const card = (id, extra = {}) => ({ uid: S.u++, cardId: id, ...extra })
  S.card = card
  S.player = (o = {}) => ({ lp: 8000, deckCount: 30, hand: [], monsters: [null, null, null, null, null, null, null], spellTraps: [null, null, null, null, null], fieldZone: null, graveyard: [], banished: [], extra: [], ...o })
  S.mon = (c, o = {}) => ({ card: c, position: 'atk', faceUp: true, atk: 2500, def: 2000, materials: 0, ...o })
  S.st = (c, o = {}) => ({ card: c, faceUp: true, scale: null, ...o })
  S.view = (me, foe, o = {}) => ({ you: 0, players: [me, foe], turn: 3, turnPlayer: 0, phase: 'main1', winner: null, log: [{ turn: 1, seat: null, text: '── Tour 1 ──' }, { turn: 3, seat: 0, text: 'Active Parchemin Mature.' }], prompt: null, waitingFor: 0, chain: [], spectating: false, startLp: 8000, extraZones: true, unknownCards: {}, disabled: [], ...o })
  S.push = async (view, events = []) => {
    S.index.pushState({ t: 'state', view, events, names: ['David', 'Ordinateur'], connected: [true, true], timer: null })
    await new Promise((r) => setTimeout(r, 60))
    for (let i = 0; i < 200 && S.state.busy; i++) await new Promise((r) => setTimeout(r, 50))
  }
})()`)

const shot = (n) => p.shot(`${tag}-${n}.png`)
const E = (fn) => p.eval(`(async () => { const S = window.__s; ${fn} })()`)

// ids : Magicien Sombre, Dragon Blanc aux Yeux Bleus, Yubel, Obelisk, Umi, Parchemin Mature, Dragon Noir aux Yeux Rouges, Pot de Cupidité
const ID = { dm: 46986414, bewd: 89631139, yubel: 78371393, obelisk: 10000000, umi: 22702055, chronicle: 92650749, reb: 74677422, pot: 55144522, mirror: 44095762, raigeki: 12580477, polymerization: 24094653, stardust: 44508094, utopia: 84013237, flame: 35809262, kaiser: 17444133, oddeyes: 16178681, celtic: 91152256, elf: 15025844, skull: 70781052 }
await p.eval(`window.__ID = ${JSON.stringify(ID)}`)

/** Plateau de base : Magicien Sombre et Yubel (avec compteurs) chez nous, Parchemin Mature et Umi en jeu. */
const BOARD = `
  const I = window.__ID
  S.c = {
    dm: S.card(I.dm), yubel: S.card(I.yubel), bewd: S.card(I.bewd), chron: S.card(I.chronicle), umi: S.card(I.umi),
    h1: S.card(I.obelisk), h2: S.card(I.pot), h3: S.card(I.oddeyes), h4: S.card(I.polymerization), h5: S.card(I.kaiser),
    foeM: S.card(I.reb), foeS: S.card(null), g1: S.card(I.skull), g2: S.card(I.celtic),
  }
  const c = S.c
  S.me = S.player({
    hand: [c.h1, c.h2, c.h3, c.h4, c.h5],
    monsters: [S.mon(c.dm, { counters: [{ name: 'Compteur Magique', count: 2 }] }), S.mon(c.yubel, { atk: 0, def: 0, counters: [{ name: 'Compteur Parchemin', count: 3 }] }), null, null, null, null, null],
    spellTraps: [S.st(c.chron, { counters: [{ name: 'Compteur Parchemin', count: 3 }, { name: 'Compteur Fantôme', count: 1 }] }), null, null, null, null],
    fieldZone: S.st(c.umi),
    graveyard: [c.g1, c.g2], banished: [S.card(I.mirror)], extra: [S.card(I.stardust), S.card(I.utopia), S.card(I.flame)],
  })
  S.foe = S.player({
    hand: [S.card(null), S.card(null), S.card(null)],
    monsters: [null, S.mon(c.foeM, { position: 'def', atk: 2400, def: 2000 }), null, null, null, null, null],
    spellTraps: [S.st(c.foeS, { faceUp: false }), null, null, null, null],
    deckCount: 28,
  })
  S.base = (o = {}) => S.view(S.me, S.foe, o)
`

if (run('board')) {
  await E(BOARD + `await S.push(S.base())`)
  await sleep(500)
  await shot('s1-board')
  // Survol d'une carte : la fiche change. Clic : elle reste, même quand on survole une autre carte.
  const hand = await p.pos('.hand.me .hcard:nth-child(1) .card')
  const other = await p.pos('.hand.me .hcard:nth-child(3) .card')
  await p.move(hand.x, hand.y); await sleep(250)
  const hovered1 = await p.eval(`document.querySelector('#detail h3')?.textContent`)
  await p.click(hand.x, hand.y); await sleep(250)
  await p.move(other.x, other.y); await sleep(250)
  const afterHover = await p.eval(`document.querySelector('#detail h3')?.textContent`)
  await shot('s1-detail-pinned')
  // Clic dans le vide : la fiche est libérée et le survol reprend.
  await p.click(W * 0.5, H * 0.08); await sleep(200)
  await p.move(other.x + 1, other.y); await sleep(250)
  const freed = await p.eval(`document.querySelector('#detail h3')?.textContent`)
  console.log('survol:', hovered1, '| après clic + survol d’une autre carte:', afterHover, '| après clic dans le vide + survol:', freed, '| épinglée:', await p.eval(`document.body.classList.contains('pinned')`))
  // compteurs
  console.log('compteurs sur le plateau:', JSON.stringify(await p.eval(`[...document.querySelectorAll('.ctrs')].map(e => e.innerText.replace(/\\n+/g,' '))`)))
  console.log('décor du tapis:', await p.eval(`document.getElementById('mat').dataset.field + ' ' + getComputedStyle(document.getElementById('mat'), '::before').opacity`))
}

if (run('detail')) {
  await E(BOARD + `await S.push(S.base())`)
  for (const [i, name] of [[1, 'obelisk'], [3, 'oddeyes'], [5, 'kaiser']]) {
    const c = await p.pos(`.hand.me .hcard:nth-child(${i}) .card`)
    await p.click(c.x, c.y); await sleep(300)
    await p.shot(`${tag}-s2-detail-${name}.png`)
  }
  const yubel = await p.pos('.mat .mz .card[data-card="78371393"]')
  await p.click(yubel.x, yubel.y); await sleep(300)
  await shot('s2-detail-yubel-counters')
}

if (run('sum')) {
  await E(BOARD + `
    const cards = [{ c: c.dm, amount: [7] }, { c: c.yubel, amount: [10] }, { c: S.card(I.celtic), amount: [4], hand: true }]
    const t = S.card(I.celtic), t2 = S.card(I.elf), t3 = S.card(I.skull)
    S.me.hand = [c.h1, t, t2, t3, c.h5]
    const prompt = { id: 7, kind: 'cards', text: 'Choisis les Matériels de Synchro · total de Niveaux requis : 8', hint: 512, min: 1, max: 4, cancelable: false, mode: 'multi', finishable: false,
      cards: [t, t2, t3, c.h5].map((x) => ({ uid: x.uid, cardId: x.cardId, seat: 0, zone: 'hand' })), sum: { target: 8, amounts: [[4], [4], [6], [4]] } }
    await S.push(S.base({ prompt }))`)
  await sleep(300)
  await shot('s3-sum-0')
  const cards = await p.eval(`[...document.querySelectorAll('.card.pickable')].map(e => e.dataset.lv)`)
  console.log('niveaux annoncés sur les cartes:', JSON.stringify(cards))
  await p.click((await p.pos('.hand.me .hcard:nth-child(2) .card')).x, (await p.pos('.hand.me .hcard:nth-child(2) .card')).y); await sleep(250)
  await shot('s3-sum-1')
  console.log('barre :', await p.eval(`JSON.stringify(['.panel', '.panel-title', '.panel-row', '.panel-row .go'].map((s) => { const e = document.querySelector(s); if (!e) return s + ' absent'; const r = e.getBoundingClientRect(); return s + ' ' + Math.round(r.left) + '→' + Math.round(r.right) }))`))
  const p2 = await p.pos('.hand.me .hcard:nth-child(3) .card'); await p.click(p2.x, p2.y); await sleep(250)
  await shot('s3-sum-2')
  console.log('ronds remplis:', await p.eval(`document.querySelectorAll('.panel .lv i.on').length + '/' + document.querySelectorAll('.panel .lv i:not(.over)').length`), '| texte:', await p.eval(`document.querySelector('.panel-title')?.innerText.replace(/\\n+/g,' ')`))
}

if (run('fusion')) {
  // Matériaux de Fusion, une carte à la fois : le récapitulatif des cartes déjà prises et le compteur doivent se voir.
  const card = (c, zone, extra = '') => `{ uid: c.${c}.uid, cardId: c.${c}.cardId, seat: 0, zone: '${zone}'${extra} }`
  await E(BOARD + `
    const prompt = { id: 51, kind: 'cards', text: 'Choisis les Matériels de Fusion', hint: 0, min: 3, max: 3, cancelable: false, mode: 'step', finishable: false,
      cards: [${card('h1', 'hand')}, ${card('h2', 'hand')}, ${card('dm', 'monster', ', index: 0')}, ${card('yubel', 'monster', ', index: 1, selected: true')}, ${card('h3', 'hand', ', selected: true')}] }
    await S.push(S.base({ prompt }))`)
  await sleep(400)
  await shot('s22-fusion-board')
  const tray = () => p.eval(`({ n: document.querySelectorAll('.panel .tray-card').length, pending: document.querySelectorAll('.panel .tray-card.pending').length, count: document.querySelector('.panel .panel-title small')?.innerText ?? null, label: document.querySelector('.panel .tray-label')?.innerText ?? null })`)
  console.log('plateau — récapitulatif :', JSON.stringify(await tray()), '(attendu : 2 cartes prises, compteur « 2 / 3 »)')
  // On touche une carte de la main : elle apparaît « à ajouter ».
  const h1 = await p.pos('.hand.me .hcard:nth-child(1) .card')
  await p.click(h1.x, h1.y); await sleep(300)
  await shot('s22-fusion-pending')
  console.log('après avoir touché une carte :', JSON.stringify(await tray()), '(attendu : 3 miniatures dont 1 « à ajouter »)')
  // Toucher une miniature prise la désigne pour la retirer.
  const thumb = await p.pos('.panel .tray-card.chosen')
  await p.click(thumb.x, thumb.y); await sleep(300)
  console.log('après avoir touché une miniature prise :', JSON.stringify(await tray()))
  // Les mêmes cartes dans la fenêtre de choix (cartes hors plateau : Cimetière).
  await E(BOARD + `
    const prompt = { id: 52, kind: 'cards', text: 'Choisis les Matériels de Fusion', hint: 0, min: 2, max: 3, cancelable: false, mode: 'step', finishable: true,
      cards: [${card('g1', 'graveyard')}, ${card('g2', 'graveyard', ', selected: true')}, { uid: null, cardId: I.mirror, seat: 0, zone: 'banished' }, { uid: null, cardId: I.stardust, seat: 0, zone: 'extra', selected: true }] }
    await S.push(S.base({ prompt }))`)
  await sleep(400)
  await shot('s22-fusion-chooser')
  console.log('fenêtre — miniatures :', await p.eval(`document.querySelectorAll('.modal .tray-card').length`), '| compteur :', await p.eval(`document.querySelector('.modal .chooser-count')?.innerText ?? null`), '(attendu : 2 miniatures, « 2 / 2 à 3 »)')
}

if (run('chooser')) {
  await E(BOARD + `
    const prompt = { id: 9, kind: 'cards', text: 'Choisis les cartes à ajouter à ta main', hint: 506, min: 1, max: 2, cancelable: false, mode: 'multi', finishable: false,
      cards: [
        { uid: c.g1.uid, cardId: c.g1.cardId, seat: 0, zone: 'graveyard' },
        { uid: c.yubel.uid, cardId: c.yubel.cardId, seat: 0, zone: 'monster', index: 1 },
        { uid: c.chron.uid, cardId: c.chron.cardId, seat: 0, zone: 'spellTrap', index: 0 },
        { uid: c.foeM.uid, cardId: c.foeM.cardId, seat: 1, zone: 'monster', index: 1 },
        { uid: null, cardId: I.mirror, seat: 0, zone: 'banished' },
        { uid: null, cardId: I.stardust, seat: 0, zone: 'extra' },
      ] }
    await S.push(S.base({ prompt }))`)
  await sleep(300)
  await shot('s4-chooser')
  const tile = await p.pos('.modal.chooser .choice:nth-child(2)'); await p.click(tile.x, tile.y); await sleep(300)
  await shot('s4-chooser-picked')
  console.log('emplacements:', JSON.stringify(await p.eval(`[...document.querySelectorAll('.modal.chooser .where')].map(e => e.innerText.replace(/\\n+/g, ' '))`)))
}

if (run('attack')) {
  await E(BOARD + `
    const prompt = { id: 11, kind: 'cards', text: 'Choisis la cible de l’attaque', hint: 549, min: 1, max: 1, cancelable: true, mode: 'multi', finishable: false, attackerUid: c.dm.uid,
      cards: [{ uid: c.foeM.uid, cardId: c.foeM.cardId, seat: 1, zone: 'monster', index: 1 }] }
    await S.push(S.base({ prompt }))`)
  await sleep(400)
  await shot('s5-attack-target')
  const btn = await p.pos('.panel [data-act="answer"][data-value="null"]')
  console.log('bouton « Annuler l’attaque » présent:', !!btn, btn ? await p.eval(`document.querySelector('.panel [data-act="answer"]').innerText`) : '')
  if (btn) { await p.click(btn.x, btn.y); await sleep(300); console.log('après clic, question effacée:', await p.eval(`window.__s.state.view.prompt === null`)) }
  // attaque directe : confirmation avec bouton d'annulation
  await E(BOARD + `
    S.foe.monsters = [null, null, null, null, null, null, null]
    const options = [{ id: 0, uid: c.dm.uid, cardId: c.dm.cardId, zone: 'monster', action: 'attack', direct: true }, { id: 1, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ phase: 'battle', prompt: { id: 12, kind: 'battle', options } }))`)
  await sleep(300)
  const dm = await p.pos('.mat .mz .card[data-card="46986414"]'); await p.click(dm.x, dm.y); await sleep(400)
  await shot('s5-attack-direct')
  const cancel = await p.pos('.panel [data-act="cancel-direct"]')
  console.log('attaque directe : bouton Annuler:', !!cancel)
  if (cancel) { await p.click(cancel.x, cancel.y); await sleep(250); console.log('après annulation, visée retirée:', await p.eval(`!document.querySelector('.fx-arrow') && !document.getElementById('arena').classList.contains('aim-direct')`)) }
}

if (run('extra')) {
  await E(BOARD + `
    const options = [{ id: 0, uid: S.me.extra[0].uid, cardId: S.me.extra[0].cardId, zone: 'extra', action: 'spsummon' }, { id: 1, uid: S.me.extra[2].uid, cardId: S.me.extra[2].cardId, zone: 'extra', action: 'spsummon' }, { id: 2, uid: null, cardId: null, zone: null, action: 'toBattle' }, { id: 3, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 13, kind: 'idle', options } }))`)
  await sleep(300)
  const extra = await p.pos('.pile.extra[data-side="me"]'); await p.click(extra.x, extra.y); await sleep(400)
  await shot('s6-extra')
  console.log('Extra Deck : cartes invocables repérées:', await p.eval(`document.querySelectorAll('.modal.viewer .card.ssum').length`), '/', await p.eval(`document.querySelectorAll('.modal.viewer .card').length`), '| légende:', await p.eval(`!!document.querySelector('.modal.viewer .legend')`))
}

if (run('anim')) {
  // défausse, Cimetière → main, bannissement, mélange : avant / après
  await E(BOARD + `await S.push(S.base())`)
  await sleep(300)
  const rec = p.record(1500, `${tag}-s7-discard-`, 110)
  await E(BOARD + `await S.push(S.base())`)
  await E(`
    const c = S.c
    const me = S.player({ ...S.me, hand: S.me.hand.filter((x) => x !== c.h2), graveyard: [...S.me.graveyard, c.h2] })
    await S.push(S.view(me, S.foe), [{ type: 'move', player: 0, uid: c.h2.uid, cardId: c.h2.cardId, from: 'hand', to: 'graveyard', how: 'discard' }])`)
  console.log('images de la défausse:', (await rec).length)
  // bannissement d'un monstre du terrain
  await E(BOARD + `await S.push(S.base())`)
  const rec2 = p.record(1500, `${tag}-s7-banish-`, 110)
  await E(`
    const c = S.c
    const me = S.player({ ...S.me, monsters: [S.me.monsters[0], null, ...S.me.monsters.slice(2)], banished: [...S.me.banished, c.yubel] })
    await S.push(S.view(me, S.foe), [{ type: 'move', player: 0, uid: c.yubel.uid, cardId: c.yubel.cardId, from: 'monster', to: 'banished', how: 'banish' }])`)
  console.log('images du bannissement:', (await rec2).length)
}

if (run('combat')) {
  // Le Magicien Sombre (2500) frappe le monstre adverse : choc, puis la cible éclate et part au Cimetière.
  await E(BOARD + `await S.push(S.base())`)
  await sleep(300)
  const rec = p.record(4200, `${tag}-s9-combat-`, 110)
  await E(`
    const c = S.c
    const foe = S.player({ ...S.foe, monsters: S.foe.monsters.map((m) => (m && m.card.uid === c.foeM.uid ? null : m)), graveyard: [...S.foe.graveyard, c.foeM] })
    await S.push(S.view(S.me, foe), [
      { type: 'attack', attackerUid: c.dm.uid, targetUid: c.foeM.uid },
      { type: 'battle', attackerUid: c.dm.uid, targetUid: c.foeM.uid, attackerValue: 2500, targetValue: 1800, targetPosition: 'atk' },
      { type: 'destroy', player: 1, uid: c.foeM.uid, cardId: c.foeM.cardId },
      { type: 'damage', player: 1, amount: 700, lp: 7300 },
    ])`)
  console.log('images du combat :', (await rec).length)
}

if (run('confirm')) {
  // Abandonner : une fenêtre du jeu (jamais confirm() du navigateur).
  await E(BOARD + `await S.push(S.base())`)
  await E(`S.index.surrender()`)
  await sleep(300)
  await shot('s19-confirm')
  console.log('fenêtre :', await p.eval(`document.querySelector('.dk-dialog h2')?.innerText`))
  await p.eval(`document.querySelector('[data-act="confirm-cancel"]').click()`); await sleep(200)
  console.log('fermée après Annuler :', await p.eval(`!document.querySelector('.dk-dialog')`))
}

if (run('effect')) {
  // Effet activé : la fiche de la carte s'affiche et le paragraphe de l'effet est surligné.
  await E(BOARD + `await S.push(S.base())`)
  await E(`S.state.pinned = false; S.state.sheet = false
    S.push(S.base(), [{ type: 'chain', player: 0, uid: S.c.chron.uid, cardId: S.c.chron.cardId, index: 1, effect: 2 }])`)
  await sleep(900)
  await shot('s20-effect')
  console.log('fiche illuminée :', await p.eval(`document.querySelector('#detail .activated .eff-tag')?.innerText ?? null`))
}

if (run('defense')) {
  // Un monstre en défense est détruit : il se redresse sur place, puis vole se poser au Cimetière.
  await E(BOARD + `await S.push(S.base())`)
  await E(`const c = S.c; c.dm.pos = 1`)
  await E(`
    const c = S.c
    const me = S.player({ ...S.me, monsters: S.me.monsters.map((m) => (m && m.card.uid === c.dm.uid ? { ...m, position: 'def' } : m)) })
    await S.push(S.view(me, S.foe))`)
  const rec = p.record(2600, `${tag}-s21-def-`, 120)
  await E(`
    const c = S.c
    const me = S.player({ ...S.me, monsters: S.me.monsters.map((m) => (m && m.card.uid === c.dm.uid ? null : m)), graveyard: [...S.me.graveyard, c.dm] })
    await S.push(S.view(me, S.foe), [{ type: 'destroy', player: 0, uid: c.dm.uid, cardId: c.dm.cardId, to: 'graveyard' }])`)
  console.log('images :', (await rec).length)
}

if (run('negate')) {
  await E(BOARD + `await S.push(S.base())`)
  const rec = p.record(4200, `${tag}-s8-negate-`, 160)
  await E(`
    const I = window.__ID, c = S.c
    // L'adversaire active Raigeki (maillon 1), nous répondons par Jugement Solennel (maillon 2) qui l'annule, puis la chaîne se résout.
    await S.push(S.base(), [
      { type: 'chain', player: 1, uid: null, cardId: I.raigeki, index: 1 },
      { type: 'chain', player: 0, uid: null, cardId: 41420027, index: 2 },
      { type: 'chainResolve', index: 2 },
      { type: 'chainNegated', index: 1 },
    ])`)
  console.log('images de la chaîne annulée:', (await rec).length)
}

if (run('summons')) {
  await E(BOARD + `await S.push(S.base())`)
  for (const [kind, id, label] of [['synchro', ID.stardust, 'synchro'], ['fusion', ID.flame, 'fusion'], ['xyz', ID.utopia, 'xyz']]) {
    await E(BOARD + `await S.push(S.base())`)
    const rec = p.record(1800, `${tag}-s9-${label}-`, 150)
    await E(`
      const c = S.c
      const card = S.card(${id})
      const me = S.player({ ...S.me, monsters: [S.me.monsters[0], S.me.monsters[1], S.mon(card), null, null, null, null], extra: S.me.extra.slice(0, 2) })
      await S.push(S.view(me, S.foe), [
        { type: 'move', player: 0, uid: card.uid, cardId: null, from: 'extra', to: 'monster', how: 'toField' },
        { type: 'summon', player: 0, uid: card.uid, cardId: ${id}, mode: 'special', kind: '${kind}' },
      ])`)
    await rec
  }
  // compteur ajouté, équipement
  await E(BOARD + `await S.push(S.base())`)
  const rec = p.record(1800, `${tag}-s9-counter-`, 150)
  await E(`
    const c = S.c
    const chron = S.st(c.chron, { counters: [{ name: 'Compteur Parchemin', count: 4 }, { name: 'Compteur Fantôme', count: 1 }] })
    const me = S.player({ ...S.me, spellTraps: [chron, ...S.me.spellTraps.slice(1)] })
    await S.push(S.view(me, S.foe), [{ type: 'counter', uid: c.chron.uid, name: 'Compteur Parchemin', delta: 1 }])`)
  await rec
}

if (run('shuffle')) {
  // Mélange de la main : paquet, deux coupes entrecroisées, redistribution (nouvelles identités de cartes).
  await E(BOARD + `await S.push(S.base())`)
  const rec = p.record(4200, `${tag}-s18-shuffle-`, 160)
  await E(`
    const I = window.__ID
    const me = S.player({ ...S.me, hand: [S.card(I.pot), S.card(I.dm), S.card(I.bewd), S.card(I.reb), S.card(I.elf)] })
    await S.push(S.view(me, S.foe), [{ type: 'shuffle', player: 0 }])`)
  console.log('images du mélange de la main :', (await rec).length)
}

if (run('gravemenu')) {
  // Carte activable dans le Cimetière : on ouvre la pile, on la touche, le menu doit être visible et cliquable.
  await E(BOARD + `
    const opts = [{ id: 0, uid: c.g1.uid, cardId: c.g1.cardId, zone: 'graveyard', action: 'activate', label: 'Invoquer par Fusion 1 Monstre Fusion “Démonforgeron”' }, { id: 1, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 41, kind: 'idle', options: opts } }))`)
  await sleep(300)
  const pile = await p.pos('.pile.gy[data-side="me"]'); await p.click(pile.x, pile.y); await sleep(400)
  const card = await p.pos('.modal.viewer .card.can'); await p.click(card.x, card.y); await sleep(400)
  await shot('s17-gravemenu')
  const item = await p.pos('.actions button')
  const hit = item ? await p.eval(`(()=>{const el=document.elementFromPoint(${item.x},${item.y}); return el?.closest('.actions') ? 'le menu' : (el?.className||el?.tagName)})()`) : null
  console.log('menu d’action ouvert :', !!item, '| ce qui est sous son centre :', hit)
  if (item) { await p.click(item.x, item.y); await sleep(300); console.log('après le clic, question envoyée (plus de question) :', await p.eval(`window.__s.state.view.prompt === null`)) }
}

if (run('dicefaces')) {
  // Les six faces d'un dé et les deux côtés d'une pièce, posés : chaque pastille doit montrer la valeur annoncée.
  await E(BOARD + `await S.push(S.base())`)
  await p.eval(`import('/dev/faces.tsx').then((m) => m.showFaces())`)
  await sleep(400)
  await shot('s15-dicefaces')
  await p.eval(`document.getElementById('dicefaces')?.remove()`)
}

if (run('notices')) {
  // Aperçus d'effet activé et de cartes révélées : sur téléphone, rangés en haut à gauche, hors du tapis.
  const where = () => p.eval(`JSON.stringify([...document.querySelectorAll('.fx-reveal-toast')].map((b) => { const r = b.getBoundingClientRect(), m = document.getElementById('mat').getBoundingClientRect(); return { corner: b.classList.contains('corner'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), matLeft: Math.round(m.left) } }))`)
  await E(BOARD + `await S.push(S.base())`)
  await E(`S.state.busy = false; S.push(S.base(), [{ type: 'chain', player: 0, uid: S.c.chron.uid, cardId: S.c.chron.cardId, index: 1, effect: 2 }])`)
  for (let i = 0; i < 40 && !(await has(p, '.fx-effect-notice')); i++) await sleep(100)
  await sleep(150)
  await shot('s40-notice-effect')
  console.log('aperçu d’effet :', await where())
  await E(`S.state.busy = false; S.push(S.base(), [{ type: 'reveal', cardIds: [window.__ID.dm, window.__ID.bewd, window.__ID.pot] }])`)
  for (let i = 0; i < 40 && !(await has(p, '.fx-reveal-toast:not(.fx-effect-notice)')); i++) await sleep(100)
  await sleep(200)
  await shot('s40-notice-reveal')
  console.log('cartes révélées :', await where())
}

if (run('setactivate')) {
  // Magie/Piège posée face verso qui s'active : elle se retourne d'abord, puis se soulève face recto.
  await E(BOARD + `S.me.spellTraps = [S.st(S.c.chron, { faceUp: false }), null, null, null, null]; await S.push(S.base())`)
  await sleep(300)
  const rec = p.record(2200, `${tag}-s41-setactivate-`, 110)
  await E(`S.state.busy = false; const me = { ...S.me, spellTraps: [S.st(S.c.chron), null, null, null, null] }; S.push(S.view(me, S.foe), [{ type: 'chain', player: 0, uid: S.c.chron.uid, cardId: S.c.chron.cardId, index: 1, effect: 2 }])`)
  console.log('images de l’activation :', (await rec).length)
  console.log('face recto après :', await p.eval(`!document.querySelector('#app .card[data-uid="' + window.__s.c.chron.uid + '"]').classList.contains('back')`))
}

if (run('piletip')) {
  // Infobulle d'une pile : visible au survol, effacée dès qu'un clic ouvre la pile.
  await E(BOARD + `await S.push(S.base())`)
  await sleep(300)
  const tip = () => p.eval(`!document.getElementById('duel-pile-tooltip')?.hidden`)
  const gy = await p.pos('.half[data-side="me"] .zone.pile.gy')
  await p.move(gy.x, gy.y); await sleep(250)
  console.log('infobulle au survol :', await tip())
  await p.click(gy.x, gy.y); await sleep(400)
  console.log('après clic — infobulle :', await tip(), '| fenêtre ouverte :', await p.eval(`!!document.querySelector('#ui .modal, .viewer, [role="dialog"]')`))
  await shot('s42-piletip')
  // Zone bannie : la souris bouge à l'intérieur, l'infobulle ne doit jamais disparaître (tapis incliné en 3D).
  await p.key('Escape'); await sleep(200)
  const v = await p.pos('.zone.pile.void[data-side="me"]')
  await p.move(v.x, v.y); await sleep(200)
  await p.eval(`(() => { window.__hid = 0; window.__n = 0; const tick = () => { if (!window.__watch) return; window.__n++; if (document.getElementById('duel-pile-tooltip')?.hidden) window.__hid++; requestAnimationFrame(tick) }; window.__watch = true; requestAnimationFrame(tick) })()`)
  for (let i = 0; i < 20; i++) { await p.move(v.x + Math.sin(i) * v.w * 0.3, v.y + Math.cos(i * 1.3) * v.h * 0.3); await sleep(40) }
  await p.eval(`window.__watch = false`)
  console.log('zone bannie, souris en mouvement : images sans infobulle', await p.eval(`window.__hid`), '/', await p.eval(`window.__n`))
  await p.move(5, 5); await sleep(150)
  console.log('souris sortie : infobulle cachée', await p.eval(`document.getElementById('duel-pile-tooltip')?.hidden`))
}

if (run('keyboard')) {
  // Clavier : les flèches promènent le curseur, Entrée ouvre le menu de la carte (premier choix au focus), « ? » affiche l'aide.
  await E(BOARD + `
    const options = [{ id: 0, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'summon' }, { id: 1, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'set' }, { id: 2, uid: c.dm.uid, cardId: c.dm.cardId, zone: 'monster', action: 'activate' }, { id: 3, uid: null, cardId: null, zone: null, action: 'toBattle' }, { id: 4, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 30, kind: 'idle', options } }))`)
  await sleep(300)
  const cursor = () => p.eval(`(() => { const e = document.querySelector('.kbd-cursor'); return e ? (e.dataset.uid ? 'carte ' + e.dataset.uid + (e.closest('.hand') ? ' (main)' : ' (terrain)') : e.dataset.pile ? 'pile ' + e.dataset.pile : 'zone ' + e.dataset.zk) : null })()`)
  await p.key('ArrowRight'); await sleep(150)
  console.log('première flèche :', await cursor())
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowRight']) { await p.key(k); await sleep(120); console.log(k, '→', await cursor()) }
  await shot('s43-keyboard-cursor')
  for (let i = 0; i < 5; i++) { await p.key('ArrowDown'); await sleep(100) }
  console.log('retour en main :', await cursor())
  await p.key('Enter'); await sleep(450)
  console.log('menu ouvert :', await p.eval(`document.querySelectorAll('.actions button').length`), '| focus dans le menu :', await p.eval(`!!document.activeElement?.closest('.actions')`))
  await p.key('ArrowRight'); await sleep(100)
  console.log('focus après →', await p.eval(`document.activeElement?.getAttribute('aria-label')`))
  await shot('s43-keyboard-menu')
  await p.key('Escape'); await sleep(200)
  console.log('menu fermé :', await p.eval(`!document.querySelector('.actions')`))
  await p.key('?'); await sleep(300)
  console.log('aide :', await p.eval(`document.querySelectorAll('.keys-list > div').length`))
  await shot('s43-keyboard-help')
  await p.key('Escape'); await sleep(200)
  console.log('aide fermée :', await p.eval(`!document.querySelector('.keys-list')`))
  await p.click(10, 10); await sleep(100)
  console.log('souris : curseur effacé :', await p.eval(`!document.querySelector('.kbd-cursor')`))
}

if (run('flicker')) {
  // Clignotement : un nouvel état sans événement reconstruit le terrain ; aucune image de carte ne doit passer par un vide.
  await E(BOARD + `await S.push(S.base())`)
  await sleep(600)
  const rec = p.record(1500, `${tag}-s44-flicker-`, 0)
  for (let i = 0; i < 6; i++) { await E(`await S.push(S.base({ turn: 3 + ${i} % 2 }))`); await sleep(180) }
  console.log('images :', (await rec).length)
}

if (run('frames')) {
  // Gabarit des cartes : tous les types côte à côte, à trois tailles. Noms, étoiles, illustrations et cadres doivent s'aligner.
  const ids = [11714098, 86988864, 94798725, 93368494, 46593546, 30983281, 4731783, 65172015, 13332685, 55144522, 44095762]
  await E(`
    const { cardDom } = await import('/ui/Card.tsx')
    document.querySelector('#frames')?.remove()
    const box = document.createElement('div')
    box.id = 'frames'
    box.style.cssText = 'position:fixed;inset:0;z-index:999;background:#101430;display:grid;gap:14px;padding:14px;align-content:start;overflow:auto'
    for (const [size, w] of [['sm', 70], ['md', 118], ['lg', 190]]) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start'
      for (const id of ${JSON.stringify(ids)}) {
        const card = S.store.cards.get(id)
        if (!card) continue
        const el = cardDom(card, { size })
        el.style.width = w + 'px'; el.style.height = Math.round(w * 86 / 59) + 'px'
        row.append(el)
      }
      box.append(row)
    }
    // Dans une vignette de choix et dans le récapitulatif : les classes du gabarit ne doivent pas hériter de leurs styles.
    const row = document.createElement('div')
    row.className = 'modal chooser'
    row.style.cssText = 'position:static;display:flex;gap:10px;flex-wrap:wrap;background:none;padding:0'
    for (const id of [94798725, 46593546, 93368494]) {
      const card = S.store.cards.get(id)
      const tile = document.createElement('button')
      tile.className = 'choice'
      tile.append(cardDom(card, { size: 'md' }))
      const tray = document.createElement('span')
      tray.className = 'tray-card'
      tray.append(cardDom(card, { size: 'sm' }))
      row.append(tile, tray)
    }
    box.append(row)
    document.body.append(box)`)
  await sleep(1500)
  await shot('s45-frames')
  console.log(await p.eval(`JSON.stringify([...document.querySelectorAll('#frames > div:nth-child(2) .card')].map((c) => { const q = (s) => { const e = c.querySelector(s); if (!e) return '-'; const r = e.getBoundingClientRect(), o = c.getBoundingClientRect(); return Math.round(r.top - o.top) + '+' + Math.round(r.height) }; return c.className.split(' ')[2] + ' nom ' + q('.c-name') + ' étoiles ' + q('.c-stars, .c-kind') + ' image ' + q('.c-art') + ' bas ' + q('.c-box') }), null, 1)`))
  console.log('dans une vignette de choix :', await p.eval(`JSON.stringify([...document.querySelectorAll('#frames .choice .card, #frames .tray-card .card')].map((c) => { const st = c.querySelector('.c-stars'), r = st.getBoundingClientRect(), o = c.getBoundingClientRect(), n = c.querySelector('.c-name').getBoundingClientRect(); return c.className.split(' ')[2] + ' étoiles ' + Math.round(r.left - o.left) + ',' + Math.round(r.top - o.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' position ' + getComputedStyle(st).position + ' | nom ' + Math.round(n.left - o.left) + ',' + Math.round(n.top - o.top) }))`))
  await E(`document.querySelector('#frames')?.remove()`)
}

if (run('chainmarks')) {
  // Chaîne à deux maillons : le numéro de chaque maillon reste sur sa carte source, même après la séquence (fenêtre de réponse).
  await E(BOARD + `await S.push(S.base())`)
  await sleep(300)
  const chain = `[{ cardId: S.c.chron.cardId, seat: 0 }, { cardId: S.c.foeM.cardId, seat: 1 }]`
  await E(`await S.push(S.base({ chain: ${chain} }), [{ type: 'chain', player: 0, uid: S.c.chron.uid, cardId: S.c.chron.cardId, index: 1, effect: 2 }, { type: 'chain', player: 1, uid: S.c.foeM.uid, cardId: S.c.foeM.cardId, index: 2, effect: 1 }])`)
  await sleep(300)
  console.log('numéros sur le terrain :', await p.eval(`JSON.stringify([...document.querySelectorAll('#mat .chain-no')].map((b) => b.className + ' ' + b.textContent))`))
  await shot('s46-chainmarks')
  await E(`await S.push(S.base({ chain: [] }), [{ type: 'chainResolve', index: 2 }, { type: 'chainResolve', index: 1 }])`)
  await sleep(300)
  console.log('après résolution :', await p.eval(`document.querySelectorAll('#mat .chain-no').length`))
}

if (run('handmenu')) {
  // Menu d'une carte de la main : toujours au-dessus de la carte montée, et il ne clignote pas quand on clique la carte survolée.
  await E(BOARD + `
    const options = [{ id: 0, uid: c.h2.uid, cardId: c.h2.cardId, zone: 'hand', action: 'activate' }, { id: 1, uid: c.h2.uid, cardId: c.h2.cardId, zone: 'hand', action: 'set' }, { id: 2, uid: c.h3.uid, cardId: c.h3.cardId, zone: 'hand', action: 'summon' }, { id: 3, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 31, kind: 'idle', options } }))`)
  await sleep(300)
  const where = () => p.eval(`(() => { const m = document.querySelector('.actions')?.getBoundingClientRect(); const c = document.querySelector('.hand.me .hcard.raised .card')?.getBoundingClientRect(); return m && c ? { menuBottom: Math.round(m.bottom), cardTop: Math.round(c.top), above: m.bottom <= c.top + 1 } : { menu: !!m, card: !!c } })()`)
  // Survol, puis clic sur la même carte : le menu ne doit manquer sur aucune image.
  const pos3 = await p.pos('.hand.me .hcard:nth-child(3) .card')
  await p.move(pos3.x - 30, pos3.y - pos3.h * 0.1); await sleep(60)
  await p.move(pos3.x, pos3.y - pos3.h * 0.15); await sleep(500)
  console.log('survol :', JSON.stringify(await where()), JSON.stringify(pos3), await p.eval(`(() => { const e = document.elementFromPoint(${Math.round(pos3.x)}, ${Math.round(pos3.y - pos3.h * 0.15)}); return (e?.className ?? '') + ' | hcards ' + document.querySelectorAll('.hand.me .hcard').length + ' raised ' + window.__s.state.raised })()`))
  await p.eval(`(() => { window.__gone = 0; window.__seen = 0; const tick = () => { if (!window.__watch) return; window.__seen++; if (!document.querySelector('.actions')) window.__gone++; requestAnimationFrame(tick) }; window.__watch = true; requestAnimationFrame(tick) })()`)
  await p.click(pos3.x, pos3.y - pos3.h * 0.15); await sleep(500)
  await p.eval(`window.__watch = false`)
  console.log('survol puis clic : images sans menu', await p.eval(`window.__gone`), '/', await p.eval(`window.__seen`), '|', JSON.stringify(await where()))
  // Parcourir la main à la souris ne doit faire défiler aucun conteneur (l'écran se décalait vers le haut).
  const scrolled = () => p.eval(`JSON.stringify([document.scrollingElement, ...document.querySelectorAll('body *')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + ' ' + e.scrollTop + '/' + e.scrollLeft))`)
  for (let i = 1; i <= 5; i++) { const h = await p.pos('.hand.me .hcard:nth-child(' + i + ') .card'); await p.move(h.x, h.y - h.h * 0.15); await sleep(260) }
  console.log('défilements après parcours de la main :', await scrolled())
  await p.click(10, 450); await sleep(200); await p.key('Escape'); await sleep(100)
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) { await p.key(k); await sleep(120) }
  console.log('curseur :', await p.eval(`document.querySelector('.kbd-cursor')?.className`))
  console.log('défilements après les flèches :', await scrolled())
  console.log('conteneurs défilables plus hauts que leur boîte :', await p.eval(`JSON.stringify([document.scrollingElement, ...document.querySelectorAll('body *')].filter((e) => e.scrollHeight > e.clientHeight + 1 && (e === document.scrollingElement || !/visible|clip/.test(getComputedStyle(e).overflowY))).map((e) => e.tagName.toLowerCase() + '.' + [...e.classList].slice(0, 2).join('.') + ' ' + getComputedStyle(e).overflowY + ' ' + e.clientHeight + '/' + e.scrollHeight))`))
  const hm = await p.pos('.hand.me .hcard:nth-child(2) .card')
  await p.move(hm.x, hm.y - hm.h * 0.2); await sleep(300)
  await p.cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x: hm.x, y: hm.y - hm.h * 0.2, deltaX: 0, deltaY: 240 }); await sleep(400)
  console.log('après la molette sur la main :', await scrolled())
  await shot('s47-wheel')
  // Clic direct sur une autre carte, sans survol préalable : le menu finit au-dessus de la carte montée.
  await p.key('Escape'); await p.click(10, 450); await sleep(300)
  const pos = await p.pos('.hand.me .hcard:nth-child(2) .card')
  await p.click(pos.x, pos.y - pos.h * 0.15); await sleep(450)
  console.log('clic direct :', JSON.stringify(await where()))
  await shot('s47-handmenu-click')
}

if (run('handshift')) {
  // L'écran ne doit pas se décaler quand on parcourt la main : position de l'écran de duel et du cadre adverse avant / après.
  await E(BOARD + `
    const options = [{ id: 0, uid: c.h2.uid, cardId: c.h2.cardId, zone: 'hand', action: 'activate' }, { id: 3, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 32, kind: 'idle', options } }))`)
  await sleep(400)
  const box = () => p.eval(`JSON.stringify(['#app', '.duel', '.arena', '#mat', '.hud', '.hand.me', '.hand.foe'].map((s) => { const e = document.querySelector(s); if (!e) return s + ' -'; const r = e.getBoundingClientRect(); return s + ' ' + Math.round(r.top) + '→' + Math.round(r.bottom) }))`)
  console.log('avant :', await box())
  await shot('s48-before')
  for (let i = 1; i <= 5; i++) {
    const h = await p.pos('.hand.me .hcard:nth-child(' + i + ') .card'); await p.move(h.x, h.y - h.h * 0.15); await sleep(300)
    console.log('carte', i, ':', await box())
  }
  await shot('s48-after')
  const vv = () => p.eval(`JSON.stringify({ vv: Math.round(visualViewport.offsetTop), html: document.documentElement.scrollTop, body: document.body.scrollTop, hud: Math.round(document.querySelector('.hud').getBoundingClientRect().top) })`)
  await p.cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 800, y: 880, deltaX: 0, deltaY: 300 }); await sleep(400)
  console.log('après la molette :', await vv())
  await shot('s48-wheel')
  await p.click(5, 450); await sleep(200)
  for (let i = 0; i < 6; i++) { await p.key('ArrowDown'); await sleep(120) }
  console.log('après les flèches :', await vv(), await p.eval(`document.querySelector('.kbd-cursor')?.closest('.hand') ? 'curseur en main' : 'curseur ailleurs'`))
  await shot('s48-arrows')
}

if (run('throws')) {
  await E(BOARD + `await S.push(S.base())`)
  const rec = p.record(8200, `${tag}-s16-dice-`, 230)
  await E(`await S.push(S.base(), [{ type: 'dice', player: 0, results: [3, 6] }])`)
  console.log('images du lancer de dés :', (await rec).length)
  const rec2 = p.record(8400, `${tag}-s16-coin-`, 250)
  await E(`await S.push(S.base(), [{ type: 'coin', player: 0, results: [true, false, true] }])`)
  console.log('images du lancer de pièces :', (await rec2).length)
}

if (run('toss')) {
  // Pile ou face d'avant-duel : la pièce en 3D est lancée, rebondit et se pose.
  await E(`S.store.toss = { winner: 1, you: 0, names: ['David', 'Ordinateur'], chooser: 'David', choose: true, first: null, ms: 20000 }; S.index.redrawAll?.(); (await import('/app/render.ts')).redraw()`)
  const rec = p.record(3400, `${tag}-s17-toss-`, 260)
  console.log('images du pile ou face :', (await rec).length)
  await E(`S.store.toss = null; (await import('/app/render.ts')).redraw()`)
}

if (run('reveal')) {
  // Cartes révélées : elles restent affichées jusqu'à validation.
  await E(BOARD + `await S.push(S.base())`)
  await E(`S.state.busy = false; window.__rev = S.push(S.base(), [{ type: 'reveal', cardIds: [window.__ID.dm, window.__ID.bewd, window.__ID.pot] }])`)
  await sleep(1800)
  await shot('s18-reveal')
  console.log('temps de lecture de 3 cartes (ms) :', await p.eval(`document.querySelector('.reveal-timer')?.getAnimations()[0]?.effect.getTiming().duration`))
  console.log('après 1,8 s, révélation toujours là :', await p.eval(`!!document.querySelector('.fx-reveal')`))
  // Un toucher sur une carte révélée la lit (fiche complète sur téléphone).
  await p.eval(`document.querySelector('.fx-reveal .card').click()`)
  await sleep(500)
  await shot('s18-reveal-read')
  console.log('fiche ouverte après toucher :', await p.eval(`!!document.querySelector('.sheet') || !!document.querySelector('#detail .detail-text')`))
  await p.eval(`document.querySelector('[data-act="close-sheet"]')?.click()`); await sleep(200)
  await p.eval(`document.querySelector('[data-act="reveal-ok"]').click()`)
  await sleep(600)
  console.log('après validation :', await p.eval(`!!document.querySelector('.fx-reveal')`))
}

if (run('banners')) {
  // Les effets (fenêtre de réponse en chaîne) ne sont proposés qu'après le dernier bandeau de phase.
  await E(BOARD + `await S.push(S.base())`)
  await sleep(300)
  const first = await p.eval(`(async () => {
    const S = window.__s
    const view = S.base({ phase: 'standby', prompt: { id: 31, kind: 'chain', forced: false, options: [{ id: 0, uid: S.c.chron.uid, cardId: S.c.chron.cardId, zone: 'spellTrap' }] } })
    const t0 = performance.now()
    S.index.pushState({ t: 'state', view, events: [{ type: 'turn', player: 0, turn: 4 }, { type: 'phase', phase: 'standby' }, { type: 'phase', phase: 'main1' }], names: ['David', 'Ordinateur'], connected: [true, true], timer: null })
    let bannerSeen = 0, promptAt = null, bannerAtPrompt = null
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 40))
      const banners = document.querySelectorAll('.banner').length
      bannerSeen = Math.max(bannerSeen, banners)
      if (promptAt === null && document.querySelector('.modal.reply')) { promptAt = Math.round(performance.now() - t0); bannerAtPrompt = banners; break }
    }
    return { bannerSeen, promptAt, bannerAtPrompt }
  })()`)
  console.log('bandeaux vus :', first.bannerSeen, '| fenêtre d’effets apparue après (ms) :', first.promptAt, '| bandeaux encore à l’écran à ce moment :', first.bannerAtPrompt)
  await shot('s14-banners')
}

if (run('fields')) {
  // Une Magie Terrain chacun : chaque illustration habille son côté ; une seule : tout le tapis.
  await E(BOARD + `S.foe.fieldZone = S.st(S.card(I.umi === 22702055 ? 59197169 : 22702055)); await S.push(S.base())`)
  await sleep(1200)
  await shot('s13-fields-two')
  console.log('deux terrains:', await p.eval(`document.getElementById('mat').className + ' | ' + [...document.querySelectorAll('.half')].map(h => h.className).join(' / ')`))
  await E(`S.foe.fieldZone = null; await S.push(S.base())`)
  await sleep(1200)
  await shot('s13-fields-one')
  console.log('un terrain:', await p.eval(`document.getElementById('mat').className + ' | ' + [...document.querySelectorAll('.half')].map(h => h.className).join(' / ')`))
}

if (run('fieldswap')) {
  // L'adversaire a un Terrain qui couvre tout le tapis ; j'active le mien : le sien se rétracte dans sa moitié, le mien se déploie depuis ma zone Terrain.
  const idle = `{ id: 60, kind: 'idle', options: [{ id: 0, uid: null, cardId: null, zone: null, action: 'toEnd' }] }`
  await E(BOARD + `S.me.fieldZone = null; S.foe.fieldZone = S.st(S.card(59197169)); await S.push(S.base({ prompt: ${idle} }))`)
  await sleep(1300)
  await shot('s49-fieldswap-0')
  const rec = p.record(2000, `${tag}-s49-fieldswap-`, 160)
  await E(`S.state.busy = false; S.me.fieldZone = S.st(S.c.umi); await S.push(S.base({ prompt: ${idle} }))`)
  console.log('images du remplacement :', (await rec).length)
  await sleep(300)
  console.log('après :', await p.eval(`document.getElementById('mat').className + ' | ' + [...document.querySelectorAll('.half')].map(h => h.className).join(' / ') + ' | calques restants ' + document.querySelectorAll('.field-transition-layer').length`))
  // Mon Terrain s'en va : le sien reprend tout le tapis.
  const rec2 = p.record(2000, `${tag}-s49-fieldback-`, 160)
  await E(`S.me.fieldZone = null; await S.push(S.base({ prompt: ${idle} }))`)
  console.log('images du retour :', (await rec2).length)
}

if (run('replyclose')) {
  // Réponse en chaîne sur téléphone : toucher la carte ouvre son bandeau ; toucher ailleurs dans la fenêtre le referme et libère « Valider ».
  await E(BOARD + `await S.push(S.base({ chain: [{ cardId: S.c.foeM.cardId, seat: 1 }], prompt: { id: 33, kind: 'chain', forced: false, options: [{ id: 0, uid: S.c.h2.uid, cardId: S.c.h2.cardId, zone: 'hand' }] } }))`)
  await sleep(600)
  const banner = () => p.eval(`!!document.querySelector('.card-inspector:not([hidden]) .detail h3, .card-inspector .card-heading')`)
  await p.clickSel('.modal.reply .choice'); await sleep(350)
  console.log('après la carte — bandeau :', await banner(), '| Valider visible :', await p.eval(`(() => { const b = document.querySelector('.modal.reply [data-act="send-pick"], .modal.reply .go'); if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.contains(top) })()`))
  await shot('s50-reply-banner')
  const box = await p.pos('.modal.reply .modal-in')
  await p.click(box.x - box.w * 0.4, box.y + box.h * 0.3); await sleep(350)
  console.log('après un toucher dans la fenêtre — bandeau :', await banner(), '| Valider visible :', await p.eval(`(() => { const b = document.querySelector('.modal.reply [data-act="send-pick"], .modal.reply .go'); if (!b) return null; const r = b.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return b.contains(top) })()`), '| carte toujours choisie :', await p.eval(`!!document.querySelector('.modal.reply .choice.on')`))
  await shot('s50-reply-closed')
}

if (run('intro')) {
  // Début de partie : les Decks sont mélangés, puis les mains distribuées carte par carte.
  await E(`S.state.view = null; S.state.version = 0`)
  const rec = p.record(4200, `${tag}-s10-intro-`, 200)
  await E(BOARD + `
    S.me.monsters = S.me.monsters.map(() => null); S.me.spellTraps = S.me.spellTraps.map(() => null); S.me.fieldZone = null; S.me.graveyard = []; S.me.banished = []
    S.foe.monsters = S.foe.monsters.map(() => null); S.foe.spellTraps = S.foe.spellTraps.map(() => null); S.foe.hand = [S.card(null), S.card(null), S.card(null), S.card(null), S.card(null)]
    await S.push(S.base({ turn: 1, phase: 'draw' }), [{ type: 'start', firstPlayer: 0 }, { type: 'turn', player: 0, turn: 1 }, { type: 'draw', player: 0, count: 5 }, { type: 'draw', player: 1, count: 5 }])`)
  console.log('images du début de partie:', (await rec).length)
}

if (run('phases')) {
  // Changement de phase, ATK modifiée, pile qui grossit.
  await E(BOARD + `await S.push(S.base())`)
  const rec = p.record(2600, `${tag}-s11-phases-`, 200)
  await E(`
    const c = S.c
    const me = S.player({ ...S.me, monsters: [S.mon(c.dm, { atk: 3000, counters: S.me.monsters[0].counters }), ...S.me.monsters.slice(1)], deckCount: 29, graveyard: [...S.me.graveyard, S.card(window.__ID.pot)] })
    await S.push(S.view(me, S.foe, { phase: 'main2' }), [{ type: 'phase', phase: 'main2' }, { type: 'shuffleDeck', player: 0 }])`)
  console.log('images des phases:', (await rec).length)
}

if (run('phone')) {
  // Téléphone : toucher une carte affiche le bandeau (pas la fiche) ; le bandeau ou un appui long ouvre la fiche, qui garde son défilement.
  await E(BOARD + `
    const options = [{ id: 0, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'summon' }, { id: 1, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'set' }, { id: 2, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 21, kind: 'idle', options } }))`)
  await sleep(300)
  const card = await p.pos('.hand.me .hcard:nth-child(1) .card')
  await p.click(card.x, card.y - card.h * 0.3); await sleep(350)
  await shot('s12-phone-tap')
  console.log('après un toucher — bandeau:', await p.eval(`!!document.querySelector('.infobar')`), '| fiche ouverte:', await p.eval(`!!document.querySelector('.sheet')`), '| menu d’actions:', JSON.stringify(await p.eval(`[...document.querySelectorAll('.actions button')].map(b => b.textContent)`)))
  const bar = await p.pos('.infobar'); if (bar) { await p.click(bar.x, bar.y); await sleep(350) }
  await shot('s12-phone-sheet')
  const scrolled = await p.eval(`(()=>{const d=document.querySelector('.sheet .detail'); if(!d) return null; d.scrollTop = 120; return d.scrollTop})()`)
  // Un nouvel état arrive pendant la lecture : la fiche ne doit pas remonter.
  await E(`const v = S.base({ prompt: S.state.view.prompt }); v.players[1].lp = 7000; await S.push(v, [])`)
  await sleep(200)
  console.log('fiche ouverte par le bandeau:', await p.eval(`!!document.querySelector('.sheet')`), '| défilement avant / après un nouvel état:', scrolled, '/', await p.eval(`document.querySelector('.sheet .detail')?.scrollTop`))
  const close = await p.pos('.sheet-close'); if (close) { await p.click(close.x, close.y); await sleep(250) }
  // Appui long sur un monstre du terrain.
  const mon = await p.pos('.mat .mz .card[data-card="78371393"]')
  await p.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: mon.x, y: mon.y, button: 'left', clickCount: 1 })
  await sleep(600)
  await p.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mon.x, y: mon.y, button: 'left', clickCount: 1 })
  await sleep(300)
  await shot('s12-phone-longpress')
  console.log('appui long — fiche:', await p.eval(`document.querySelector('.sheet h3')?.textContent`), '| menu ouvert par erreur:', await p.eval(`!!document.querySelector('.actions')`))
}

if (run('select')) {
  // Sélection de 3 cartes à envoyer au Cimetière : deux monstres et une Magie sur le terrain, une carte dans le Cimetière.
  await E(BOARD + `
    const cand = [[c.dm, 'monster', 0], [c.yubel, 'monster', 1], [c.chron, 'spellTrap', 0], [c.g1, 'graveyard', undefined], [S.me.hand[0], 'hand', undefined]]
    const prompt = { id: 61, kind: 'cards', text: 'Sélectionnez le(s) carte(s) à envoyer au Cimetière', hint: 504, min: 3, max: 3, cancelable: false, mode: 'multi', finishable: false,
      cards: cand.map(([x, zone, index]) => ({ uid: x.uid, cardId: x.cardId, seat: 0, zone, ...(index === undefined ? {} : { index }) })) }
    S.view1 = S.base({ prompt, chain: [{ cardId: I.chronicle, seat: 0, uid: c.chron.uid }] })
    await S.push(S.view1)`)
  await sleep(400)
  await shot('s20-select-0')
  const open0 = await p.pos('[data-act="offboard-open"]'); if (open0) { await p.click(open0.x, open0.y); await sleep(350) }
  await shot('s20-select-offboard')
  console.log('fenêtre hors terrain:', await p.eval(`document.querySelectorAll('.modal.chooser.partial .choice').length`), 'carte(s) | miniatures dans la fenêtre:', await p.eval(`document.querySelectorAll('.modal .tray').length`), '| bouton plein écran de la colonne masqué:', await p.eval(`getComputedStyle(document.querySelector('.tools [data-act="fullscreen"]')).display === 'none'`))
  const back = await p.pos('[data-act="offboard-close"]'); if (back) { await p.click(back.x, back.y); await sleep(250) }
  for (const sel of ['.mat .mz .card[data-card="46986414"]', '.mat .mz .card[data-card="78371393"]', '.mat .sz .card[data-card="92650749"]']) {
    const c = await p.pos(sel); if (c) { await p.click(c.x, c.y); await sleep(250) }
  }
  await shot('s20-select-3')
  console.log('cartes cochées:', await p.eval(`document.querySelectorAll('.card.picked').length`), '| interdites:', await p.eval(`document.querySelectorAll('.card.blocked').length`), '| tray:', await p.eval(`document.querySelectorAll('.tray-card').length`), '| panneau recouvre une carte du terrain:', await p.eval(`(() => { const r = document.querySelector('.panel')?.getBoundingClientRect(); if (!r) return 'pas de panneau'; return [...document.querySelectorAll('.mat .card')].some((e) => { const b = e.getBoundingClientRect(); return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top }) })()`))
}

if (run('fusionstep')) {
  // Matériels de Fusion en deux temps : d'abord « Yubel », puis les autres matériaux.
  await E(BOARD + `
    const y2 = S.card(I.yubel); S.me.hand = [y2, ...S.me.hand.slice(1)]
    const step1 = { id: 62, kind: 'cards', text: 'Sélectionnez le(s) Matériel(s) Fusion a utiliser', hint: 511, min: 2, max: 2, cancelable: false, mode: 'step', finishable: false,
      cards: [{ uid: c.yubel.uid, cardId: I.yubel, seat: 0, zone: 'monster', index: 1 }, { uid: y2.uid, cardId: I.yubel, seat: 0, zone: 'hand' }] }
    await S.push(S.base({ prompt: step1 }))`)
  await sleep(350)
  await shot('s21-fusion-1')
  console.log('titre étape 1:', await p.eval(`document.querySelector('.panel-text')?.innerText.replace(/\\n+/g,' | ')`))
  await E(`
    const c = S.c
    const step2 = { id: 63, kind: 'cards', text: 'Sélectionnez le(s) Matériel(s) Fusion a utiliser', hint: 511, min: 2, max: 2, cancelable: false, mode: 'step', finishable: false,
      cards: [{ uid: c.yubel.uid, cardId: window.__ID.yubel, seat: 0, zone: 'monster', index: 1, selected: true }, { uid: c.dm.uid, cardId: window.__ID.dm, seat: 0, zone: 'monster', index: 0 }, { uid: c.h1.uid, cardId: window.__ID.obelisk, seat: 0, zone: 'hand' }] }
    await S.push(S.base({ prompt: step2 }))`)
  await sleep(350)
  await shot('s21-fusion-2')
  console.log('titre étape 2:', await p.eval(`document.querySelector('.panel-text')?.innerText.replace(/\\n+/g,' | ')`))
}

if (run('menuicons')) {
  await E(BOARD + `
    const options = [{ id: 0, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'summon' }, { id: 1, uid: c.h1.uid, cardId: c.h1.cardId, zone: 'hand', action: 'set' }, { id: 2, uid: c.dm.uid, cardId: c.dm.cardId, zone: 'monster', action: 'activate', effect: 1, label: 'Piocher 1 carte' }, { id: 3, uid: c.dm.uid, cardId: c.dm.cardId, zone: 'monster', action: 'activate', effect: 2, label: 'Détruire 1 carte' }, { id: 4, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 64, kind: 'idle', options } }))`)
  await sleep(300)
  const card = await p.pos('.hand.me .hcard:nth-child(1) .card'); await p.click(card.x, card.y - card.h * 0.3); await sleep(350)
  await shot('s22-menu-hand')
  const mon = await p.pos('.mat .mz .card[data-card="46986414"]'); await p.click(mon.x, mon.y); await sleep(350)
  await shot('s22-menu-effects')
  console.log('boutons du menu:', JSON.stringify(await p.eval(`[...document.querySelectorAll('.actions button')].map(b => b.getAttribute('aria-label') + (b.querySelector('.badge') ? ' #' + b.querySelector('.badge').textContent : ''))`)))
}

if (run('xyz')) {
  // Monstre Xyz avec 3 matériels couchés dessous ; puis un matériel se détache vers le Cimetière.
  await E(BOARD + `
    const x = S.card(I.utopia)
    S.me.monsters[2] = S.mon(x, { atk: 2500, def: 2000, materials: 3, materialCards: [I.dm, I.bewd, I.yubel] })
    S.foe.monsters[3] = S.mon(S.card(I.stardust), { atk: 2500, def: 2000, materials: 2, materialCards: [I.reb, I.kaiser] })
    S.xyz = x
    await S.push(S.base())`)
  await sleep(400)
  await shot('s30-xyz')
  await E(`
    const me = S.me, x = S.xyz
    me.monsters[2] = { ...me.monsters[2], materials: 2, materialCards: [window.__ID.dm, window.__ID.bewd] }
    me.graveyard = [...me.graveyard, S.card(window.__ID.yubel)]
    await S.push(S.base(), [{ type: 'move', player: 0, uid: null, cardId: window.__ID.yubel, from: 'overlay', to: 'graveyard', how: 'toGrave', fromFaceUp: true, faceUp: true, fromHolder: x.uid }])`)
  await sleep(250)
  await shot('s30-xyz-detach')
  console.log('matériels affichés:', await p.eval(`document.querySelectorAll('.xyz-mat').length`))
}

if (run('replay')) {
  // Lecteur de replay : fabriqué à partir de trois états ; on le masque puis on le rouvre.
  await E(BOARD + `
    const strip = (v) => { const { log, ...rest } = v; return JSON.parse(JSON.stringify(rest)) }
    const frames = [0, 1, 2].map((i) => { const view = strip(S.base({ turn: 3 + i })); return { at: i * 1500, view, logLength: 1, events: [], hands: [view.players[0].hand.map((c) => c.cardId), view.players[1].hand.map((_, k) => [I.mirror, I.raigeki, I.pot][k] ?? null)] } })
    const match = { format: 'duel-lan-replay', version: 1, id: 'scene-replay', createdAt: Date.now(), duration: 4500, mode: 'ai', names: ['David', 'Ordinateur'], frames, log: [], cards: {} }
    const pb = await import('/screens/replay/playback.ts')
    pb.openReplay(match)`)
  await sleep(1200)
  await shot('s31-replay')
  const before = await p.eval(`[...document.querySelectorAll('.hand.foe .card')].map((e) => e.dataset.card ?? 'dos').join(',')`)
  const hb = await p.pos('[data-act="replay-hands"]'); if (hb) { await p.click(hb.x, hb.y); await sleep(500) }
  await shot('s31-replay-hands')
  console.log('main adverse avant :', before, '| après :', await p.eval(`[...document.querySelectorAll('.hand.foe .card')].map((e) => e.dataset.card ?? 'dos').join(',')`), '| bouton actif :', await p.eval(`document.querySelector('[data-act="replay-hands"]')?.getAttribute('aria-pressed')`))
  const hide = await p.pos('[data-act="replay-hide"]'); if (hide) { await p.click(hide.x, hide.y); await sleep(400) }
  await shot('s31-replay-hidden')
  console.log('lecteur masqué:', await p.eval(`!!document.querySelector('.replay-handle') && !document.querySelector('.replay-controls')`))
  const show = await p.pos('[data-act="replay-show"]'); if (show) { await p.click(show.x, show.y); await sleep(400) }
  console.log('lecteur rouvert:', await p.eval(`!!document.querySelector('.replay-controls')`), '| boutons:', JSON.stringify(await p.eval(`[...document.querySelectorAll('.replay-controls .btn.icon')].map(b => { const r = b.getBoundingClientRect(); const s = b.querySelector('svg').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round((s.left + s.width / 2) - (r.left + r.width / 2)), Math.round((s.top + s.height / 2) - (r.top + r.height / 2))].join('x') })`)))
}

if (run('chooserhead')) {
  // Fenêtre de choix pour des cartes du Deck : titre long, compteur et bouton sur la même ligne.
  await E(BOARD + `
    const ids = [I.chronicle, I.umi, I.mirror, I.raigeki, I.pot]
    const prompt = { id: 71, kind: 'cards', text: 'Choisir la carte à ajouter à votre main ou à Poser sur votre Terrain', hint: 0, min: 1, max: 1, cancelable: false, mode: 'multi', finishable: false,
      cards: ids.map((id) => ({ uid: null, cardId: id, seat: 0, zone: 'deck' })) }
    await S.push(S.base({ prompt }))`)
  await sleep(400)
  await shot('s40-chooserhead')
  console.log('en-tête sur une ligne:', await p.eval(`(() => { const h = document.querySelector('.modal-in header'); const kids = [...h.children].map((e) => e.getBoundingClientRect()); const tops = kids.map((r) => Math.round(r.top + r.height / 2)); return Math.max(...tops) - Math.min(...tops) < 30 })()`))
}

if (run('closepile')) {
  // Activer une action depuis la fenêtre de l'Extra Deck referme cette fenêtre.
  await E(BOARD + `
    const options = [{ id: 0, uid: S.me.extra[0].uid, cardId: S.me.extra[0].cardId, zone: 'extra', action: 'spsummon' }, { id: 1, uid: null, cardId: null, zone: null, action: 'toEnd' }]
    await S.push(S.base({ prompt: { id: 81, kind: 'idle', options } }))`)
  await sleep(300)
  const pile = await p.pos('.pile.extra[data-side="me"]'); await p.click(pile.x, pile.y); await sleep(400)
  const open1 = await p.eval(`!!document.querySelector('.modal.viewer')`)
  const card = await p.pos('.modal.viewer .card.can'); await p.click(card.x, card.y); await sleep(350)
  console.log('bandeau de carte pendant la fenêtre:', await p.eval(`!!document.querySelector('.infobar')`))
  const item = await p.pos('.actions button'); await p.click(item.x, item.y); await sleep(400)
  console.log('fenêtre ouverte avant:', open1, '| après avoir choisi l’action:', await p.eval(`!!document.querySelector('.modal.viewer')`))
}

if (run('discard13')) {
  // Excès de cartes en main : 13 cartes à défausser, le panneau doit tenir dans l'écran.
  await E(BOARD + `
    const ids = [I.obelisk, I.pot, I.oddeyes, I.polymerization, I.kaiser, I.dm, I.bewd, I.yubel, I.umi, I.reb, I.mirror, I.raigeki, I.celtic]
    S.me.hand = ids.map((id) => S.card(id))
    const prompt = { id: 91, kind: 'cards', text: 'Sélectionnez le(s) carte(s) à défausser', hint: 501, min: 13, max: 13, cancelable: false, mode: 'multi', finishable: false,
      cards: S.me.hand.map((x) => ({ uid: x.uid, cardId: x.cardId, seat: 0, zone: 'hand' })) }
    await S.push(S.base({ prompt }))`)
  await sleep(350)
  const hand = await p.eval(`[...document.querySelectorAll('.hand.me .card')].length`)
  for (let i = 1; i <= 13; i++) { const c = await p.pos('.hand.me .hcard:nth-child(' + i + ') .card'); if (c) { await p.click(c.x, c.y - c.h * 0.25); await sleep(120) } }
  await shot('s50-discard13')
  // Zones touchables : pour chaque carte de la main, le point du bord gauche de sa bande atteint-il bien cette carte ?
  console.log('bandes touchables:', await p.eval(`(() => { const cards = [...document.querySelectorAll('.hand.me .hcard')]; let ok = 0; const widths = []; cards.forEach((h, i) => { const r = h.querySelector('.card').getBoundingClientRect(); const nextLeft = i < cards.length - 1 ? cards[i + 1].querySelector('.card').getBoundingClientRect().left : r.right; const w = Math.min(r.right, nextLeft) - r.left; widths.push(Math.round(w)); if (w >= 14) ok++ }); return ok + '/' + cards.length + ' bandes >= 14 px (largeurs ' + widths.join(',') + ')' })()`))
  await p.eval(`document.querySelector('[data-act="tools"]')`)
  console.log('cartes en main:', hand, '| cochées:', await p.eval(`document.querySelectorAll('.card.picked').length`), '| panneau dans l’écran:', await p.eval(`(() => { const r = document.querySelector('.panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })()`), '| bouton valider visible:', await p.eval(`(() => { const r = document.querySelector('[data-act="send-pick"]').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 })()`))
}

if (run('finale')) {
  // Victoire d'Exodia : le terrain se vide, les cinq pièces se posent au centre, puis l'écran de résultat.
  await E(BOARD + `
    const ex = [44519536, 7902349, 33396948, 70903634, 8124921]
    S.me.hand = ex.map((id) => S.card(id))
    S.ex = ex
    await S.push(S.base())`)
  await sleep(400)
  await shot('s60-finale-0')
  await E(`
    const v = S.base({ winner: 0 })
    S.index.pushState({ t: 'state', view: v, events: [{ type: 'win', winner: 0, finale: { kind: 'special', cards: S.ex } }], names: ['David', 'Ordinateur'], connected: [true, true], timer: null })`)
  await sleep(1300)
  await shot('s60-finale-1')
  console.log('pendant la scène — écran de résultat :', await p.eval(`!!document.querySelector('.result')`), '| cartes de la victoire :', await p.eval(`document.querySelectorAll('.finale-card').length`))
  await sleep(1500)
  await shot('s60-finale-2')
  await sleep(4500)
  await shot('s60-finale-3')
  console.log('après la scène — écran de résultat :', await p.eval(`!!document.querySelector('.result')`), '| scène retirée :', await p.eval(`!document.querySelector('.finale-row')`))
}

console.log('captures dans', SHOTS, '| erreurs de la page :', p.logs.slice(0, 6))
process.exit(0)
