// Banc d'essai des mouvements de carte : chaque déplacement possible (main, Deck, Extra Deck, Cimetière, cartes bannies,
// terrain, matériels Xyz, côté joueur et côté adversaire) est joué dans le vrai client, et on MESURE la trajectoire du
// fantôme animé : il doit partir de là où la carte était et se poser là où elle va. On vérifie aussi qu'aucune carte ne reste
// cachée et qu'aucun fantôme ne traîne à la fin.
//   node tools/visual/moves.mjs [largeur] [hauteur] [desktop|mobile] [filtre...]
//   (le filtre est une sous-chaîne du nom d'un cas ; sans filtre, tous les cas)
//   --capture : enregistre les images des animations dans /tmp/yugioh-visual (ou SHOTS).
import { setup } from './lib.mjs'
import { open, sleep } from './lib.mjs'

const [W, H, MOBILE] = [Number(process.argv[2] ?? 1600), Number(process.argv[3] ?? 900), process.argv[4] === 'mobile']
const capture = process.argv.includes('--capture')
const want = process.argv.slice(5).filter((arg) => arg !== '--capture')

await setup()
const p = await open({ w: W, h: H, mobile: MOBILE })
await p.eval(`(async () => {
  WebSocket.prototype.send = () => {}
  const S = (window.__s = {})
  S.index = await import('/screens/duel/controller.ts')
  S.state = (await import('/screens/duel/state.ts')).duel
  S.u = 1
  S.card = (id, extra = {}) => ({ uid: S.u++, cardId: id, ...extra })
  S.player = (o = {}) => ({ lp: 8000, deckCount: 30, hand: [], monsters: [null, null, null, null, null, null, null], spellTraps: [null, null, null, null, null], fieldZone: null, graveyard: [], banished: [], extra: [], ...o })
  S.mon = (c, o = {}) => ({ card: c, position: 'atk', faceUp: true, atk: 2500, def: 2000, materials: 0, ...o })
  S.st = (c, o = {}) => ({ card: c, faceUp: true, scale: null, ...o })
  S.rm = (a, x) => a.filter((y) => (y.uid ?? y.card?.uid) !== x.uid)
  S.at = (a, i, v) => a.map((y, k) => (k === i ? v : y))
  S.view = (me, foe, o = {}) => ({ you: 0, players: [me, foe], turn: 3, turnPlayer: 0, phase: 'main1', winner: null, log: [{ turn: 1, seat: null, text: '── Tour 1 ──' }], prompt: null, waitingFor: 0, chain: [], spectating: false, startLp: 8000, extraZones: false, unknownCards: {}, disabled: [], ...o })
  S.push = async (view, events = []) => {
    S.index.pushState({ t: 'state', view, events, names: ['David', 'Ordinateur'], connected: [true, true], timer: null })
    await new Promise((r) => setTimeout(r, 60))
    for (let i = 0; i < 300 && S.state.busy; i++) await new Promise((r) => setTimeout(r, 50))
    return !S.state.busy
  }
  // Échantillonneur : à chaque image, la position de chaque fantôme du calque d'effets.
  S.sample = () => {
    const rec = { ghosts: new Map(), stop: false }
    const tick = () => {
      const now = performance.now()
      for (const g of document.querySelectorAll('#fx .ghost')) {
        let e = rec.ghosts.get(g)
        if (!e) rec.ghosts.set(g, (e = []))
        const r = g.getBoundingClientRect()
        if (r.width > 20) e.push([r.left + r.width / 2, r.top + r.height / 2, now])
      }
      if (!rec.stop) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return rec
  }
  // Une trajectoire par fantôme : départ, arrivée, longueur du trajet, instants de début et de fin.
  S.measure = (rec) => {
    rec.stop = true
    const out = []
    for (const pts of rec.ghosts.values()) {
      if (pts.length < 3) continue
      let path = 0
      for (let i = 1; i < pts.length; i++) path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
      out.push({ first: pts[0], last: pts[pts.length - 1], path, t0: pts[0][2], t1: pts[pts.length - 1][2], frames: pts.length })
    }
    return out
  }
})()`)

const ID = { dm: 46986414, bewd: 89631139, yubel: 78371393, obelisk: 10000000, umi: 22702055, chronicle: 92650749, reb: 74677422, pot: 55144522, mirror: 44095762, polymerization: 24094653, stardust: 44508094, utopia: 84013237, flame: 35809262, kaiser: 17444133, oddeyes: 16178681, celtic: 91152256, elf: 15025844, skull: 70781052 }
await p.eval(`window.__ID = ${JSON.stringify(ID)}`)

const BOARD = `
  const I = window.__ID
  const { rm, at } = S
  S.c = {
    dm: S.card(I.dm), yubel: S.card(I.yubel), chron: S.card(I.chronicle), umi: S.card(I.umi),
    h1: S.card(I.obelisk), h2: S.card(I.pot), h3: S.card(I.oddeyes), h4: S.card(I.polymerization), h5: S.card(I.kaiser),
    foeM: S.card(I.reb), foeS: S.card(I.pot), g1: S.card(I.skull), g2: S.card(I.celtic), fg: S.card(I.elf), fg2: S.card(I.kaiser),
    ban: S.card(I.mirror), x1: S.card(I.stardust), x2: S.card(I.utopia), x3: S.card(I.flame),
  }
  const c = S.c
  S.me = S.player({
    hand: [c.h1, c.h2, c.h3, c.h4, c.h5],
    monsters: [S.mon(c.dm), S.mon(c.yubel), null, null, null, null, null],
    spellTraps: [S.st(c.chron), null, null, null, null],
    fieldZone: S.st(c.umi),
    graveyard: [c.g1, c.g2], banished: [c.ban], extra: [c.x1, c.x2, c.x3],
  })
  S.foe = S.player({
    hand: [S.card(null), S.card(null), S.card(null)],
    monsters: [null, S.mon(c.foeM, { position: 'def', atk: 2400, def: 2000 }), null, null, null, null, null],
    spellTraps: [S.st(c.foeS, { faceUp: false }), null, null, null, null],
    graveyard: [c.fg2], banished: [], extra: [S.card(null), S.card(null)],
    deckCount: 28,
  })
  S.me0 = S.me; S.foe0 = S.foe
`

// Aides pour écrire les états d'après (les tableaux sont copiés : on ne touche jamais à l'état d'avant).
const HELP = `
  const I = window.__ID, c = S.c
  const { rm, at } = S
  const me = S.me, foe = S.foe
`

const piles = (k, s) => `.pile.${k}[data-side="${s}"]`
const zone = (seat, kind, i) => `[data-zk="${seat}:${kind}:${i}"]`
const HM = '.hand.me', HF = '.hand.foe'

/**
 * name   : nom du mouvement
 * pre    : retouche de l'état d'AVANT (facultatif)
 * post   : code qui renvoie { me, foe, events } : l'état d'APRÈS
 * from/to: où la carte doit partir / arriver (sélecteurs) ; flight: false = pas de vol attendu (apparition, dissolution)
 */
const CASES = [
  // ── Joueur : arrivées en main ──
  { name: 'Deck → main (pioche)', post: `const n = S.card(I.bewd); return { me: { ...me, hand: [...me.hand, n], deckCount: 29 }, events: [{ type: 'draw', player: 0, count: 1 }] }`, from: piles('deck', 'me'), to: HM },
  { name: 'Deck → main (recherche par effet)', post: `const n = S.card(I.bewd); return { me: { ...me, hand: [...me.hand, n], deckCount: 29 }, events: [{ type: 'move', player: 0, uid: null, cardId: null, from: 'deck', to: 'hand', how: 'toHand' }] }`, from: piles('deck', 'me'), to: HM },
  { name: 'Extra Deck → main (Pendule face recto)', post: `const x = me.extra[0]; return { me: { ...me, extra: rm(me.extra, x), hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'extra', to: 'hand', how: 'toHand' }] }`, from: piles('extra', 'me'), to: HM },
  { name: 'Cimetière (dessus) → main', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }] }`, from: piles('gy', 'me'), to: HM },
  { name: 'Cimetière (fond) → main', post: `const x = c.g1; return { me: { ...me, graveyard: rm(me.graveyard, x), hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }] }`, from: piles('gy', 'me'), to: HM },
  { name: 'Cartes bannies → main', post: `const x = c.ban; return { me: { ...me, banished: [], hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'banished', to: 'hand', how: 'toHand' }] }`, from: piles('void', 'me'), to: HM },
  { name: 'Monstre du terrain → main (rebond)', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'hand', how: 'toHand' }] }`, from: zone(0, 'm', 1), to: HM },
  { name: 'Magie/Piège du terrain → main', post: `const x = c.chron; return { me: { ...me, spellTraps: at(me.spellTraps, 0, null), hand: [...me.hand, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'spellTrap', to: 'hand', how: 'toHand' }] }`, from: zone(0, 's', 0), to: HM },

  // ── Joueur : de la main vers le terrain ──
  { name: 'Main → Zone Monstre (Invocation Normale)', post: `const x = c.h1; return { me: { ...me, hand: rm(me.hand, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'normal' }] }`, from: HM, to: zone(0, 'm', 2) },
  { name: 'Main → Zone Monstre (posé face verso)', post: `const x = c.h3; return { me: { ...me, hand: rm(me.hand, x), monsters: at(me.monsters, 3, S.mon(x, { faceUp: false, position: 'def' })) }, events: [{ type: 'set', player: 0, uid: x.uid, kind: 'monster' }] }`, from: HM, to: zone(0, 'm', 3) },
  { name: 'Main → Zone Magie/Piège (posée)', post: `const x = c.h4; return { me: { ...me, hand: rm(me.hand, x), spellTraps: at(me.spellTraps, 1, S.st(x, { faceUp: false })) }, events: [{ type: 'set', player: 0, uid: x.uid, kind: 'spellTrap' }] }`, from: HM, to: zone(0, 's', 1) },
  { name: 'Main → Magie Terrain', pre: `S.me = { ...S.me, fieldZone: null }`, post: `const x = c.h2; return { me: { ...me, hand: rm(me.hand, x), fieldZone: S.st(x) }, events: [{ type: 'chain', player: 0, uid: x.uid, cardId: x.cardId, index: 1 }] }`, from: HM, to: zone(0, 's', 5) },

  // ── Joueur : de la main vers une pile ──
  { name: 'Main → Cimetière (défausse)', post: `const x = c.h2; return { me: { ...me, hand: rm(me.hand, x), graveyard: [...me.graveyard, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'hand', to: 'graveyard', how: 'discard' }] }`, from: HM, to: piles('gy', 'me') },
  { name: 'Main → Cimetière (coût / effet)', post: `const x = c.h3; return { me: { ...me, hand: rm(me.hand, x), graveyard: [...me.graveyard, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'hand', to: 'graveyard', how: 'toGrave' }] }`, from: HM, to: piles('gy', 'me') },
  { name: 'Main → cartes bannies', post: `const x = c.h3; return { me: { ...me, hand: rm(me.hand, x), banished: [...me.banished, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'hand', to: 'banished', how: 'banish' }] }`, from: HM, to: piles('void', 'me') },
  { name: 'Main → Deck', post: `const x = c.h5; return { me: { ...me, hand: rm(me.hand, x), deckCount: 31 }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'hand', to: 'deck', how: 'toDeck' }] }`, from: HM, to: piles('deck', 'me') },
  { name: 'Main → Extra Deck', post: `const x = c.h5; return { me: { ...me, hand: rm(me.hand, x), extra: [...me.extra, S.card(null)] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'hand', to: 'extra', how: 'toExtra' }] }`, from: HM, to: piles('extra', 'me') },

  // ── Joueur : d'une pile vers le terrain ──
  { name: 'Deck → Zone Monstre (Invocation Spéciale)', post: `const n = S.card(I.elf); return { me: { ...me, deckCount: 29, monsters: at(me.monsters, 2, S.mon(n)) }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: null, from: 'deck', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: n.uid, cardId: n.cardId, mode: 'special' }] }`, from: piles('deck', 'me'), to: zone(0, 'm', 2) },
  { name: 'Deck → Zone Magie/Piège', post: `const n = S.card(I.chronicle); return { me: { ...me, deckCount: 29, spellTraps: at(me.spellTraps, 2, S.st(n)) }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: null, from: 'deck', to: 'spellTrap', how: 'toField' }, { type: 'chain', player: 0, uid: n.uid, cardId: n.cardId, index: 1 }] }`, from: piles('deck', 'me'), to: zone(0, 's', 2) },
  { name: 'Extra Deck → Zone Monstre (Synchro)', post: `const x = c.x1; return { me: { ...me, extra: rm(me.extra, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'extra', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special', kind: 'synchro' }] }`, from: piles('extra', 'me'), to: zone(0, 'm', 2) },
  { name: 'Cimetière → Zone Monstre (Réanimation)', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'graveyard', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special' }] }`, from: piles('gy', 'me'), to: zone(0, 'm', 2) },
  { name: 'Cimetière → Zone Magie/Piège', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), spellTraps: at(me.spellTraps, 2, S.st(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'graveyard', to: 'spellTrap', how: 'toField' }] }`, from: piles('gy', 'me'), to: zone(0, 's', 2) },
  { name: 'Cartes bannies → Zone Monstre', post: `const x = c.ban; return { me: { ...me, banished: [], monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'banished', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special' }] }`, from: piles('void', 'me'), to: zone(0, 'm', 2) },

  // ── Joueur : d'une pile vers une pile ──
  { name: 'Deck → Cimetière (mill)', post: `const n = S.card(I.bewd); return { me: { ...me, deckCount: 29, graveyard: [...me.graveyard, n] }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: n.cardId, from: 'deck', to: 'graveyard', how: 'mill' }] }`, from: piles('deck', 'me'), to: piles('gy', 'me') },
  { name: 'Deck → cartes bannies', post: `const n = S.card(I.bewd); return { me: { ...me, deckCount: 29, banished: [...me.banished, n] }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: n.cardId, from: 'deck', to: 'banished', how: 'banish' }] }`, from: piles('deck', 'me'), to: piles('void', 'me') },
  { name: 'Extra Deck → Cimetière', post: `const x = c.x1; return { me: { ...me, extra: rm(me.extra, x), graveyard: [...me.graveyard, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'extra', to: 'graveyard', how: 'toGrave' }] }`, from: piles('extra', 'me'), to: piles('gy', 'me') },
  { name: 'Cimetière (dessus) → cartes bannies', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), banished: [...me.banished, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'banished', how: 'banish' }] }`, from: piles('gy', 'me'), to: piles('void', 'me') },
  { name: 'Cimetière (dessus) → Deck', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), deckCount: 31 }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'deck', how: 'toDeck' }] }`, from: piles('gy', 'me'), to: piles('deck', 'me') },
  { name: 'Cimetière (fond) → Deck', post: `const x = c.g1; return { me: { ...me, graveyard: rm(me.graveyard, x), deckCount: 31 }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'deck', how: 'toDeck' }] }`, from: piles('gy', 'me'), to: piles('deck', 'me') },
  { name: 'Cimetière → Extra Deck', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), extra: [...me.extra, S.card(null)] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'extra', how: 'toExtra' }] }`, from: piles('gy', 'me'), to: piles('extra', 'me') },
  { name: 'Cartes bannies → Cimetière', post: `const x = c.ban; return { me: { ...me, banished: [], graveyard: [...me.graveyard, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'banished', to: 'graveyard', how: 'toGrave' }] }`, from: piles('void', 'me'), to: piles('gy', 'me') },
  { name: 'Cartes bannies → Deck', post: `const x = c.ban; return { me: { ...me, banished: [], deckCount: 31 }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'banished', to: 'deck', how: 'toDeck' }] }`, from: piles('void', 'me'), to: piles('deck', 'me') },

  // ── Joueur : du terrain vers une pile ──
  { name: 'Monstre → Cimetière (destruction)', post: `const x = c.dm; return { me: { ...me, monsters: at(me.monsters, 0, null), graveyard: [...me.graveyard, x] }, events: [{ type: 'destroy', player: 0, uid: x.uid, cardId: x.cardId, to: 'graveyard' }] }`, from: zone(0, 'm', 0), to: piles('gy', 'me') },
  { name: 'Monstre → Cimetière (envoi, sans destruction)', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), graveyard: [...me.graveyard, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'graveyard', how: 'toGrave' }] }`, from: zone(0, 'm', 1), to: piles('gy', 'me') },
  { name: 'Monstre → cartes bannies', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), banished: [...me.banished, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'banished', how: 'banish' }] }`, from: zone(0, 'm', 1), to: piles('void', 'me') },
  { name: 'Monstre → Deck', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), deckCount: 31 }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'deck', how: 'toDeck' }] }`, from: zone(0, 'm', 1), to: piles('deck', 'me') },
  { name: 'Monstre → Extra Deck', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), extra: [...me.extra, S.card(null)] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'extra', how: 'toExtra' }] }`, from: zone(0, 'm', 1), to: piles('extra', 'me') },
  { name: 'Magie/Piège → Cimetière (destruction)', post: `const x = c.chron; return { me: { ...me, spellTraps: at(me.spellTraps, 0, null), graveyard: [...me.graveyard, x] }, events: [{ type: 'destroy', player: 0, uid: x.uid, cardId: x.cardId, to: 'graveyard' }] }`, from: zone(0, 's', 0), to: piles('gy', 'me') },
  { name: 'Magie/Piège → Extra Deck (Pendule)', post: `const x = c.chron; return { me: { ...me, spellTraps: at(me.spellTraps, 0, null), extra: [...me.extra, S.card(null)] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'spellTrap', to: 'extra', how: 'toExtra' }] }`, from: zone(0, 's', 0), to: piles('extra', 'me') },
  { name: 'Magie Terrain → Cimetière (destruction)', post: `const x = c.umi; return { me: { ...me, fieldZone: null, graveyard: [...me.graveyard, x] }, events: [{ type: 'destroy', player: 0, uid: x.uid, cardId: x.cardId, to: 'graveyard' }] }`, from: zone(0, 's', 5), to: piles('gy', 'me') },
  { name: 'Monstre → Cimetière (Tribut)', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), graveyard: [...me.graveyard, x] }, events: [{ type: 'tribute', player: 0, uid: x.uid }] }`, flight: false },

  // ── Joueur : matériels Xyz ──
  { name: 'Monstre → matériel Xyz', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 2, S.mon(S.c.x2)) }`, post: `const x = c.yubel, xyz = c.x2; return { me: { ...me, monsters: at(at(me.monsters, 1, null), 2, S.mon(xyz, { materials: 1 })) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'overlay', how: 'material', into: xyz.uid }] }`, from: zone(0, 'm', 1), to: zone(0, 'm', 2) },
  { name: 'Matériel Xyz → Cimetière (détachement)', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 2, S.mon(S.c.x2, { materials: 2 })) }`, post: `const m = S.card(I.bewd); return { me: { ...me, monsters: at(me.monsters, 2, S.mon(c.x2, { materials: 1 })), graveyard: [...me.graveyard, m] }, events: [{ type: 'move', player: 0, uid: m.uid, cardId: m.cardId, from: 'overlay', to: 'graveyard', how: 'toGrave', into: c.x2.uid }] }`, from: zone(0, 'm', 2), to: piles('gy', 'me') },
  { name: 'Matériel Xyz → cartes bannies', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 2, S.mon(S.c.x2, { materials: 2 })) }`, post: `const m = S.card(I.bewd); return { me: { ...me, monsters: at(me.monsters, 2, S.mon(c.x2, { materials: 1 })), banished: [...me.banished, m] }, events: [{ type: 'move', player: 0, uid: m.uid, cardId: m.cardId, from: 'overlay', to: 'banished', how: 'banish', into: c.x2.uid }] }`, from: zone(0, 'm', 2), to: piles('void', 'me') },
  { name: 'Matériel Xyz → main', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 2, S.mon(S.c.x2, { materials: 2 })) }`, post: `const m = S.card(I.bewd); return { me: { ...me, monsters: at(me.monsters, 2, S.mon(c.x2, { materials: 1 })), hand: [...me.hand, m] }, events: [{ type: 'move', player: 0, uid: m.uid, cardId: null, from: 'overlay', to: 'hand', how: 'toHand', into: c.x2.uid }] }`, from: zone(0, 'm', 2), to: HM },

  // ── Joueur : sur le terrain, et apparitions ──
  { name: 'Monstre d’une zone à une autre', post: `return { me: { ...me, monsters: at(at(me.monsters, 0, null), 3, me.monsters[0]) }, events: [{ type: 'phase', phase: 'main1' }] }`, from: zone(0, 'm', 0), to: zone(0, 'm', 3) },
  { name: 'Monstre adverse → notre terrain (contrôle)', post: `const x = c.foeM; return { me: { ...me, monsters: at(me.monsters, 2, S.mon(x, { position: 'atk' })) }, foe: { ...foe, monsters: at(foe.monsters, 1, null) }, events: [{ type: 'control', player: 0, uid: x.uid }] }`, from: zone(1, 'm', 1), to: zone(0, 'm', 2) },
  { name: 'Carte créée (apparition)', post: `const n = S.card(I.elf); return { me: { ...me, graveyard: [...me.graveyard, n] }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: n.cardId, from: 'graveyard', to: 'graveyard', how: 'create' }] }`, flight: false },

  // ── Retour en main, tel que le moteur l'envoie : « move toHand » puis « shuffle », et la main entière change d'identités ──
  { name: 'Moteur : monstre du terrain → main (+ mélange)', fresh: true, post: `const x = c.yubel; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, monsters: at(me.monsters, 1, null), hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: zone(0, 'm', 1), to: HM },
  { name: 'Moteur : Cimetière (dessus) → main (+ mélange)', fresh: true, post: `const x = c.g2; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, graveyard: rm(me.graveyard, x), hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: piles('gy', 'me'), to: HM },
  { name: 'Moteur : Cimetière (fond) → main (+ mélange)', fresh: true, post: `const x = c.g1; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, graveyard: rm(me.graveyard, x), hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: piles('gy', 'me'), to: HM },
  { name: 'Moteur : cartes bannies → main (+ mélange)', fresh: true, post: `const x = c.ban; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, banished: [], hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'banished', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: piles('void', 'me'), to: HM },
  { name: 'Moteur : Magie/Piège → main (+ mélange)', fresh: true, post: `const x = c.chron; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, spellTraps: at(me.spellTraps, 0, null), hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'spellTrap', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: zone(0, 's', 0), to: HM },
  { name: 'Moteur : Deck → main, recherche (+ mélange)', fresh: true, post: `const hand = [...me.hand, S.card(I.bewd)].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, deckCount: 29, hand }, events: [{ type: 'move', player: 0, uid: null, cardId: null, from: 'deck', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: piles('deck', 'me'), to: HM },
  { name: 'Moteur : monstre en défense → main (+ mélange)', fresh: true, pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 1, { ...S.me.monsters[1], position: 'def' }) }`, post: `const x = c.yubel; const hand = [...me.hand, x].map((h) => ({ uid: S.u++, cardId: h.cardId })); return { me: { ...me, monsters: at(me.monsters, 1, null), hand }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 0 }] }`, from: zone(0, 'm', 1), to: HM },
  { name: 'Moteur : adversaire, monstre → main (+ mélange)', fresh: true, post: `const x = c.foeM; const hand = [...foe.hand, { uid: x.uid, cardId: null }].map((h) => ({ uid: S.u++, cardId: null })); return { foe: { ...foe, monsters: at(foe.monsters, 1, null), hand }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: null, from: 'monster', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 1 }] }`, from: zone(1, 'm', 1), to: HF },
  { name: 'Moteur : adversaire, Cimetière → main (+ mélange)', fresh: true, post: `const x = c.fg2; const hand = [...foe.hand, { uid: x.uid, cardId: null }].map((h) => ({ uid: S.u++, cardId: null })); return { foe: { ...foe, graveyard: [], hand }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }, { type: 'shuffle', player: 1 }] }`, from: piles('gy', 'foe'), to: HF },

  // ── Adversaire ──
  { name: 'Adversaire : Deck → main (pioche)', post: `return { foe: { ...foe, hand: [...foe.hand, S.card(null)], deckCount: 27 }, events: [{ type: 'draw', player: 1, count: 1 }] }`, from: piles('deck', 'foe'), to: HF },
  { name: 'Adversaire : Deck → main (recherche)', post: `return { foe: { ...foe, hand: [...foe.hand, S.card(null)], deckCount: 27 }, events: [{ type: 'move', player: 1, uid: null, cardId: null, from: 'deck', to: 'hand', how: 'toHand' }] }`, from: piles('deck', 'foe'), to: HF },
  { name: 'Adversaire : main → Zone Monstre', post: `const x = foe.hand[0], m = { ...x, cardId: I.bewd }; return { foe: { ...foe, hand: rm(foe.hand, x), monsters: at(foe.monsters, 3, S.mon(m)) }, events: [{ type: 'summon', player: 1, uid: x.uid, cardId: I.bewd, mode: 'normal' }] }`, from: HF, to: zone(1, 'm', 3) },
  { name: 'Adversaire : main → Cimetière (défausse)', post: `const x = foe.hand[0], k = { ...x, cardId: I.bewd }; return { foe: { ...foe, hand: rm(foe.hand, x), graveyard: [...foe.graveyard, k] }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: I.bewd, from: 'hand', to: 'graveyard', how: 'discard' }] }`, from: HF, to: piles('gy', 'foe') },
  { name: 'Adversaire : monstre → main (rebond)', post: `const x = c.foeM; return { foe: { ...foe, monsters: at(foe.monsters, 1, null), hand: [...foe.hand, { uid: x.uid, cardId: null }] }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: null, from: 'monster', to: 'hand', how: 'toHand' }] }`, from: zone(1, 'm', 1), to: HF },
  { name: 'Adversaire : Cimetière → main', post: `const x = c.fg2; return { foe: { ...foe, graveyard: [], hand: [...foe.hand, { uid: x.uid, cardId: null }] }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'hand', how: 'toHand' }] }`, from: piles('gy', 'foe'), to: HF },
  { name: 'Adversaire : Deck → Cimetière (mill)', post: `const n = S.card(I.bewd); return { foe: { ...foe, deckCount: 27, graveyard: [...foe.graveyard, n] }, events: [{ type: 'move', player: 1, uid: n.uid, cardId: n.cardId, from: 'deck', to: 'graveyard', how: 'mill' }] }`, from: piles('deck', 'foe'), to: piles('gy', 'foe') },
  { name: 'Adversaire : monstre → Cimetière (destruction)', post: `const x = c.foeM; return { foe: { ...foe, monsters: at(foe.monsters, 1, null), graveyard: [...foe.graveyard, x] }, events: [{ type: 'destroy', player: 1, uid: x.uid, cardId: x.cardId, to: 'graveyard' }] }`, from: zone(1, 'm', 1), to: piles('gy', 'foe') },
  { name: 'Adversaire : monstre → cartes bannies', post: `const x = c.foeM; return { foe: { ...foe, monsters: at(foe.monsters, 1, null), banished: [x] }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'banished', how: 'banish' }] }`, from: zone(1, 'm', 1), to: piles('void', 'foe') },
  { name: 'Adversaire : Piège face verso → Cimetière', post: `const x = c.foeS; return { foe: { ...foe, spellTraps: at(foe.spellTraps, 0, null), graveyard: [...foe.graveyard, x] }, events: [{ type: 'destroy', player: 1, uid: x.uid, cardId: x.cardId, to: 'graveyard' }] }`, from: zone(1, 's', 0), to: piles('gy', 'foe') },
  { name: 'Adversaire : monstre → Deck', post: `const x = c.foeM; return { foe: { ...foe, monsters: at(foe.monsters, 1, null), deckCount: 29 }, events: [{ type: 'move', player: 1, uid: x.uid, cardId: null, from: 'monster', to: 'deck', how: 'toDeck' }] }`, from: zone(1, 'm', 1), to: piles('deck', 'foe') },
  { name: 'Adversaire : Deck → Zone Monstre', post: `const n = S.card(I.elf); return { foe: { ...foe, deckCount: 27, monsters: at(foe.monsters, 3, S.mon(n)) }, events: [{ type: 'move', player: 1, uid: n.uid, cardId: null, from: 'deck', to: 'monster', how: 'toField' }, { type: 'summon', player: 1, uid: n.uid, cardId: n.cardId, mode: 'special' }] }`, from: piles('deck', 'foe'), to: zone(1, 'm', 3) },

  // Positions, retournements, procédures et déplacements moins fréquents.
  { name: 'Attaque → défense', post: `return { me: { ...me, monsters: at(me.monsters, 0, { ...me.monsters[0], position: 'def' }) }, events: [{ type: 'position', player: 0, uid: c.dm.uid, position: 'def', faceUp: true, wasFaceUp: true }] }`, flight: false },
  { name: 'Défense → attaque', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 0, { ...S.me.monsters[0], position: 'def' }) }`, post: `return { me: { ...me, monsters: at(me.monsters, 0, { ...me.monsters[0], position: 'atk' }) }, events: [{ type: 'position', player: 0, uid: c.dm.uid, position: 'atk', faceUp: true, wasFaceUp: true }] }`, flight: false },
  { name: 'Invocation Flip', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 0, { ...S.me.monsters[0], position: 'def', faceUp: false }) }`, post: `return { me: { ...me, monsters: at(me.monsters, 0, { ...me.monsters[0], position: 'atk', faceUp: true }) }, events: [{ type: 'summon', player: 0, uid: c.dm.uid, cardId: c.dm.cardId, mode: 'flip' }] }`, flight: false },
  { name: 'Retournement avant combat', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 0, { ...S.me.monsters[0], position: 'def', faceUp: false }) }`, post: `return { me: { ...me, monsters: at(me.monsters, 0, { ...me.monsters[0], faceUp: true }) }, events: [{ type: 'flip', player: 0, uid: c.dm.uid, cardId: c.dm.cardId }] }`, flight: false },
  { name: 'Monstre remis face verso par effet', post: `return { me: { ...me, monsters: at(me.monsters, 0, { ...me.monsters[0], faceUp: false, position: 'def' }) }, events: [{ type: 'position', player: 0, uid: c.dm.uid, position: 'def', faceUp: false, wasFaceUp: true }] }`, flight: false },
  { name: 'Activation de Magie posée', pre: `S.me = { ...S.me, spellTraps: at(S.me.spellTraps, 0, S.st(S.c.chron, { faceUp: false })) }`, post: `return { me: { ...me, spellTraps: at(me.spellTraps, 0, S.st(c.chron)) }, events: [{ type: 'chain', player: 0, uid: c.chron.uid, cardId: c.chron.cardId, index: 1 }] }`, flight: false },
  { name: 'Extra Deck → Zone Monstre (Fusion)', post: `const x = c.x3; return { me: { ...me, extra: rm(me.extra, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'extra', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special', kind: 'fusion' }] }`, from: piles('extra', 'me'), to: zone(0, 'm', 2) },
  { name: 'Extra Deck → Zone Monstre (Xyz)', post: `const x = c.x2; return { me: { ...me, extra: rm(me.extra, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'extra', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special', kind: 'xyz' }] }`, from: piles('extra', 'me'), to: zone(0, 'm', 2) },
  { name: 'Extra Deck → Zone Monstre (Lien)', post: `const x = c.x1; return { me: { ...me, extra: rm(me.extra, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'extra', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special', kind: 'link' }] }`, from: piles('extra', 'me'), to: zone(0, 'm', 2) },
  { name: 'Main → Zone Monstre (Rituelle)', post: `const x = c.h1; return { me: { ...me, hand: rm(me.hand, x), monsters: at(me.monsters, 2, S.mon(x)) }, events: [{ type: 'summon', player: 0, uid: x.uid, cardId: x.cardId, mode: 'special', kind: 'ritual' }] }`, from: HM, to: zone(0, 'm', 2) },
  { name: 'Deck → Zone Monstre en défense', post: `const n = S.card(I.elf); return { me: { ...me, deckCount: 29, monsters: at(me.monsters, 2, S.mon(n, { position: 'def' })) }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: null, from: 'deck', to: 'monster', how: 'toField' }, { type: 'summon', player: 0, uid: n.uid, cardId: n.cardId, mode: 'special' }] }`, from: piles('deck', 'me'), to: zone(0, 'm', 2) },
  { name: 'Matériel Xyz → Zone Monstre', pre: `S.me = { ...S.me, monsters: at(S.me.monsters, 2, S.mon(S.c.x2, { materials: 2 })) }`, post: `const n = S.card(I.bewd); return { me: { ...me, monsters: at(at(me.monsters, 2, S.mon(c.x2, { materials: 1 })), 3, S.mon(n)) }, events: [{ type: 'move', player: 0, uid: n.uid, cardId: n.cardId, from: 'overlay', to: 'monster', how: 'toField', into: c.x2.uid }, { type: 'summon', player: 0, uid: n.uid, cardId: n.cardId, mode: 'special' }] }`, from: zone(0, 'm', 2), to: zone(0, 'm', 3) },
  { name: 'Pendule → Extra Deck face recto', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), extra: [...me.extra, x] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'extra', how: 'toExtra', faceUp: true }] }`, from: zone(0, 'm', 1), to: piles('extra', 'me') },
  { name: 'Bannissement face verso depuis le Cimetière', post: `const x = c.g2; return { me: { ...me, graveyard: rm(me.graveyard, x), banished: [...me.banished, { ...x, cardId: null }] }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'graveyard', to: 'banished', how: 'banish', faceUp: false }] }`, from: piles('gy', 'me'), to: piles('void', 'me') },
  { name: 'Carte contrôlée → Deck de son propriétaire adverse', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null) }, foe: { ...foe, deckCount: 29 }, events: [{ type: 'move', player: 0, toPlayer: 1, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'deck', how: 'toDeck' }] }`, from: zone(0, 'm', 1), to: piles('deck', 'foe') },
  { name: 'Carte contrôlée → main de son propriétaire adverse', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null) }, foe: { ...foe, hand: [...foe.hand, { ...x, cardId: null }] }, events: [{ type: 'move', player: 0, toPlayer: 1, uid: x.uid, cardId: x.cardId, from: 'monster', to: 'hand', how: 'toHand' }] }`, from: zone(0, 'm', 1), to: HF },
  { name: 'Monstre sacrifié → bannissement', post: `const x = c.yubel; return { me: { ...me, monsters: at(me.monsters, 1, null), banished: [...me.banished, x] }, events: [{ type: 'tribute', player: 0, uid: x.uid, to: 'banished' }] }`, from: zone(0, 'm', 1), to: piles('void', 'me') },
  { name: 'Équipement sur un monstre', post: `return { events: [{ type: 'equip', uid: c.chron.uid, targetUid: c.dm.uid }] }`, flight: false },
  { name: 'Échange de contrôle simultané', post: `return { me: { ...me, monsters: at(me.monsters, 0, S.mon(c.foeM)) }, foe: { ...foe, monsters: at(foe.monsters, 1, S.mon(c.dm)) }, events: [{ type: 'control', player: 0, uid: c.foeM.uid }, { type: 'control', player: 1, uid: c.dm.uid }] }`, from: zone(1, 'm', 1), to: zone(0, 'm', 0) },
  { name: 'Mélange du Deck', post: `return { events: [{ type: 'shuffleDeck', player: 0 }] }`, flight: false },
  { name: 'Mélange de la main seule', post: `return { me: { ...me, hand: me.hand.map((h) => ({ ...h, uid: S.u++ })) }, events: [{ type: 'shuffle', player: 0 }] }`, flight: false },
  { name: 'Destructions simultanées', post: `return { me: { ...me, monsters: at(at(me.monsters, 0, null), 1, null), graveyard: [...me.graveyard, c.dm, c.yubel] }, events: [{ type: 'destroy', player: 0, uid: c.dm.uid, cardId: c.dm.cardId, to: 'graveyard' }, { type: 'destroy', player: 0, uid: c.yubel.uid, cardId: c.yubel.cardId, to: 'graveyard' }] }`, from: zone(0, 'm', 0), to: piles('gy', 'me') },
  { name: 'Mill de plusieurs cartes', post: `const a = S.card(I.bewd), b = S.card(I.elf), d = S.card(I.celtic); return { me: { ...me, deckCount: 27, graveyard: [...me.graveyard, a, b, d] }, events: [a, b, d].map((x) => ({ type: 'move', player: 0, uid: x.uid, cardId: x.cardId, from: 'deck', to: 'graveyard', how: 'mill' })) }`, from: piles('deck', 'me'), to: piles('gy', 'me') },
  { name: 'Attaque entre monstres', post: `return { events: [{ type: 'attack', player: 0, attackerUid: c.dm.uid, targetUid: c.foeM.uid }, { type: 'battle', attackerUid: c.dm.uid, targetUid: c.foeM.uid, attackerValue: 2500, targetValue: 2000, targetPosition: 'def' }] }`, flight: false },
  { name: 'Attaque directe', post: `return { events: [{ type: 'attack', player: 0, attackerUid: c.dm.uid, targetUid: null }, { type: 'battle', attackerUid: c.dm.uid, targetUid: null, attackerValue: 2500, targetValue: null, targetPosition: null }] }`, flight: false },

  { name: 'Distribution initiale des deux mains', post: `return { events: [{ type: 'start', firstPlayer: 0 }] }`, flight: false },
  { name: 'Invocation de jeton créé sur place', post: `const n = S.card(44052075); return { me: { ...me, monsters: at(me.monsters, 2, S.mon(n)) }, events: [{ type: 'summon', player: 0, uid: n.uid, cardId: n.cardId, mode: 'special' }] }`, flight: false },
  { name: 'Destruction de jeton sans Cimetière', pre: `S.c.dm = { ...S.c.dm, cardId: 44052075 }; S.me = { ...S.me, monsters: at(S.me.monsters, 0, S.mon(S.c.dm)) }`, post: `return { me: { ...me, monsters: at(me.monsters, 0, null) }, events: [{ type: 'destroy', player: 0, uid: c.dm.uid, cardId: c.dm.cardId }] }`, flight: false },
  { name: 'Dissipation de jeton sans déplacement', pre: `S.c.dm = { ...S.c.dm, cardId: 44052075 }; S.me = { ...S.me, monsters: at(S.me.monsters, 0, S.mon(S.c.dm)) }`, post: `return { me: { ...me, monsters: at(me.monsters, 0, null) }, events: [{ type: 'phase', phase: 'main1' }] }`, flight: false },

  { name: 'Matériel vers un Xyz qui apparaît après le redessin', post: `const x = c.yubel, xyz = c.x2; return { me: { ...me, monsters: at(at(me.monsters, 1, null), 2, S.mon(xyz, { materials: 1 })) }, events: [{ type: 'move', player: 0, uid: x.uid, cardId: null, from: 'monster', to: 'overlay', how: 'material', into: xyz.uid, intoIndex: 2 }, { type: 'summon', player: 0, uid: xyz.uid, cardId: xyz.cardId, mode: 'special', kind: 'xyz' }] }`, from: zone(0, 'm', 1), to: zone(0, 'm', 2) },
  { name: 'Matériel transféré entre deux porteurs Xyz', pre: `S.me = { ...S.me, monsters: at(at(S.me.monsters, 2, S.mon(S.c.x2, { materials: 2 })), 3, S.mon(S.c.x1)) }`, post: `return { me: { ...me, monsters: at(at(me.monsters, 2, S.mon(c.x2, { materials: 1 })), 3, S.mon(c.x1, { materials: 1 })) }, events: [{ type: 'move', player: 0, uid: null, cardId: null, from: 'overlay', to: 'overlay', how: 'material', fromHolder: c.x2.uid, into: c.x1.uid, intoIndex: 3 }] }`, from: zone(0, 'm', 2), to: zone(0, 'm', 3) },

]

const cases = CASES.filter((k) => !want.length || want.some((w) => k.name.toLowerCase().includes(w.toLowerCase())))
const E = (code) => p.eval(`(async () => { const S = window.__s; ${code} })()`)
const rectOf = (sel) => p.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } })()`)
const near = (pt, r, pad) => r && pt[0] >= r.l - pad && pt[0] <= r.r + pad && pt[1] >= r.t - pad && pt[1] <= r.b + pad

let bad = 0
const rows = []
for (const k of cases) {
  const errorsBefore = p.logs.length
  // État d'avant (sans événement : rien ne s'anime), puis relevé de l'emplacement d'origine.
  await E(`${BOARD} ${k.pre ?? ''}; S.state.view = null; S.state.version = 0; await S.push(S.view(S.me, S.foe))`)
  await sleep(120)
  const from = k.from ? await rectOf(k.from) : null
  const est = k.fresh && (k.to === HM || k.to === HF)
    ? await p.eval(`(() => { const c = [...document.querySelectorAll('${k.to} .hcard .card')].map((e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }); const a = c[c.length - 1], b = c[c.length - 2]; return a && b ? [a[0] + (a[0] - b[0]), a[1] + (a[1] - b[1])] : a ?? null })()`)
    : null
  await E(`window.__rec = S.sample()`)
  const recording = capture ? p.record(2200, `move-${MOBILE ? 'm' : 'd'}-${String(CASES.indexOf(k) + 1).padStart(3, '0')}-`, 120) : null
  const done = await E(`${HELP} const r = (() => { ${k.post} })(); return await S.push(S.view(r.me ?? S.me, r.foe ?? S.foe), r.events)`)
  const flights = await E(`return S.measure(window.__rec)`)
  if (recording) await recording
  await sleep(120)
  const to = k.to ? await rectOf(k.to) : null
  const left = await p.eval(`({ ghosts: document.querySelectorAll('#fx .ghost').length, hidden: [...document.querySelectorAll('#app .card[data-uid]')].filter((e) => getComputedStyle(e).visibility === 'hidden').length })`)
  const problems = []
  if (!done) problems.push('animation jamais terminée')
  // Main : où est l'extrémité (dernière carte) ? Une carte qui arrive en main doit s'y poser.
  const handSide = k.to === HM ? 'me' : k.to === HF ? 'foe' : null
  const tail = handSide && !k.fresh ? await rectOf(`.hand.${handSide} .hcard:last-child`) : null
  const dist = (pt, r) => (r ? Math.hypot(pt[0] - (r.l + r.r) / 2, pt[1] - (r.t + r.b) / 2) : 0)
  let m = null
  if (k.flight !== false) {
    // Il doit exister UN fantôme qui part d'où la carte était et se pose où elle va.
    const moving = flights.filter((f) => f.path >= 40)
    const ok = moving.filter((f) => (!from || near(f.first, from, 45)) && (!to || near(f.last, to, 45)) && (!tail || k.fresh || dist(f.last, tail) < 100) && (!k.fresh || !est || Math.hypot(f.last[0] - est[0], f.last[1] - est[1]) < 100))
    m = ok.sort((x, y) => x.t0 - y.t0)[0] ?? null
    if (!m) {
      const guess = moving.sort((x, y) => dist(x.first, from) - dist(y.first, from))[0]
      if (!guess) problems.push('AUCUN VOL')
      else {
        if (from && !near(guess.first, from, 45)) problems.push(`part du mauvais endroit (${Math.round(guess.first[0])},${Math.round(guess.first[1])} ; attendu ${Math.round((from.l + from.r) / 2)},${Math.round((from.t + from.b) / 2)})`)
        if (to && !near(guess.last, to, 45)) problems.push(`atterrit au mauvais endroit (${Math.round(guess.last[0])},${Math.round(guess.last[1])} ; attendu ${Math.round((to.l + to.r) / 2)},${Math.round((to.t + to.b) / 2)})`)
        if (tail && near(guess.last, to, 45) && dist(guess.last, tail) >= 100) problems.push(`ne se pose pas à l’extrémité de la main (${Math.round(dist(guess.last, tail))} px de la dernière carte)`)
      }
    }
  }
  // Mélange de la main : après l'atterrissage d'une carte qui REVIENT (pas une pioche ni une recherche dans le Deck), jamais avant.
  if (handSide && k.flight !== false) {
    const shouldShuffle = k.fresh === true
    const after = m ? flights.filter((f) => f !== m && f.path >= 30 && f.t0 >= m.t1 - 120).length : 0
    if (shouldShuffle && m && after < 3) problems.push(`la main ne se mélange pas après l’atterrissage (${after} cartes bougent)`)
    if (shouldShuffle && m && flights.some((f) => f !== m && f.path >= 30 && f.t1 < m.t0 - 50 && f.t0 < m.t0 - 50)) problems.push('le mélange commence avant l’atterrissage')
    if (!shouldShuffle && after >= 3) problems.push('la main se mélange sans que le moteur l’ait demandé')
    // Rien ne doit partir « vers » le Cimetière après l'atterrissage (repli de la carte d'origine, introuvable après le mélange).
    if (shouldShuffle && m) {
      const gy = await rectOf(piles('gy', handSide))
      const stray = flights.filter((f) => f !== m && f.t0 >= m.t1 - 120 && f.path >= 30 && gy && near(f.last, gy, 40) && !near(f.first, gy, 40))
      if (stray.length) problems.push(`${stray.length} carte(s) filent vers le Cimetière après le mélange`)
    }
  }
  if (left.ghosts) problems.push(`${left.ghosts} fantôme(s) resté(s) à l’écran`)
  if (left.hidden) problems.push(`${left.hidden} carte(s) restée(s) invisible(s)`)
  const errs = p.logs.slice(errorsBefore).filter((l) => !/favicon|WebSocket/.test(l))
  if (errs.length) problems.push('erreur : ' + errs[0].slice(0, 160))
  if (problems.length) bad++
  rows.push(`${problems.length ? '✗' : '✓'} ${k.name}${problems.length ? '\n     → ' + problems.join('\n     → ') : m ? `  (trajet ${Math.round(m.path)} px, ${m.frames} images)` : ''}`)
  console.log(rows[rows.length - 1])
}
console.log(`\n${cases.length - bad}/${cases.length} mouvements animés correctement`)
process.exit(bad ? 1 : 0)
