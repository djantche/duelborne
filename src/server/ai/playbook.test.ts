// Les scripts de deck (playbook.ts, playbooks/) : reconnaissance du deck, étapes, interdits, valeur des cartes ; puis le script
// à l'œuvre sur de vraies mains (ces tests-là ont besoin des données du moteur : npm run fetch-ocg).
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { Answer, DuelView, Prompt, PromptOption } from '../../shared/protocol.ts'
import { loadData, missingData } from '../ocg/data.ts'
import { loadDecks } from '../ocg/decks.ts'
import { Duel } from '../ocg/duel.ts'
import { Computer } from './computer.ts'
import { isAvoided, makeCtx, nextStep, optionBonus } from './playbook.ts'
import { playbookFor } from './playbooks/index.ts'

const skip = missingData() ?? false

const BE = { bewd: 89631139, sage: 8240199, maiden: 17947697, alt: 38517737, trueLight: 62089826, ash: 14558127, wishes: 80326401, neoKaiser: 54332792 }
const YU = { yubel: 78371393, terror: 4779091, spirit: 90829280, lotus: 62318994, beckoning: 81034083, pain: 65261141, throne: 93729896, gates: 80312545 }

const emptyPlayer = (): object => ({ lp: 8000, deckCount: 30, hand: [], monsters: Array(7).fill(null), spellTraps: Array(6).fill(null), fieldZone: null, graveyard: [], banished: [], extra: [] })
const card = (cardId: number, uid = cardId): { uid: number; cardId: number; seat: 0 | 1 } => ({ uid, cardId, seat: 0 })
const view = (hand: number[]): DuelView =>
  ({ you: 0, players: [{ ...emptyPlayer(), hand: hand.map((id, i) => card(id, i + 1)) }, emptyPlayer()], turn: 1, turnPlayer: 0, phase: 'main1', winner: null, log: [], prompt: null, waitingFor: 0, disabled: [], chain: [], spectating: false, startLp: 8000, extraZones: true, unknownCards: {} }) as unknown as DuelView
const option = (id: number, action: PromptOption['action'], cardId: number | null, zone: PromptOption['zone'] = 'hand', label?: string): PromptOption => ({ id, uid: id, cardId, zone, action, ...(label ? { label } : {}) })

describe('scripts de deck : reconnaissance', () => {
  it('reconnaît les decks Yubel et Yeux Bleus d’après leurs cartes, et rien d’autre', () => {
    assert.equal(playbookFor([BE.bewd, BE.maiden, BE.sage, BE.trueLight, 1, 2])?.name, 'Blue-Eyes White Dragon')
    assert.equal(playbookFor([YU.yubel, YU.lotus, YU.pain, 1, 2])?.name, 'Yubel')
    assert.equal(playbookFor([BE.bewd, 1, 2, 3]), null, 'un seul Dragon Blanc ne fait pas un deck Yeux Bleus')
    assert.equal(playbookFor([YU.yubel, 1, 2]), null)
    assert.equal(playbookFor([]), null)
  })
})

describe('scripts de deck : étapes et interdits', () => {
  const be = playbookFor([BE.bewd, BE.maiden, BE.sage, BE.trueLight])!
  const yu = playbookFor([YU.yubel, YU.lotus, YU.pain, YU.throne])!

  it('Yeux Bleus : joue Alternative gratuite avant Sage, et Maiden avant les Magies', () => {
    const c = makeCtx(view([BE.bewd, BE.alt, BE.sage, BE.maiden]), 0)
    const options = [option(1, 'summon', BE.sage), option(2, 'activate', BE.maiden), option(3, 'spsummon', BE.alt)]
    assert.equal(nextStep(be, c, options, () => 0)?.option.id, 3)
    assert.equal(nextStep(be, c, options.slice(0, 2), () => 0)?.option.id, 2, 'Maiden pose True Light avant que Sage soit invoqué')
  })

  it('Yeux Bleus : une étape jouée assez de fois est sautée', () => {
    const c = makeCtx(view([BE.sage, BE.maiden]), 0)
    const options = [option(1, 'summon', BE.sage), option(2, 'activate', BE.maiden)]
    assert.equal(nextStep(be, c, options, (st) => (st.id === 'maiden-true-light' ? 1 : 0))?.option.id, 1)
  })

  it('Yeux Bleus : Ash Blossom et Effect Veiler ne sont ni invoqués ni posés', () => {
    const c = makeCtx(view([BE.ash]), 0)
    assert.ok(isAvoided(be, c, option(1, 'summon', BE.ash)))
    assert.ok(isAvoided(be, c, option(2, 'set', BE.ash)))
    assert.ok(!isAvoided(be, c, option(3, 'summon', BE.sage)))
    assert.ok(optionBonus(be, c, option(1, 'summon', BE.ash)) < 0)
  })

  it('Yubel : Lotus ne s’active pour poser Yubel que s’il reste de quoi tributer à l’End Phase', () => {
    const lotus = option(1, 'activate', YU.lotus, 'monster', 'Special Summon 1 "Yubel" monster from your Deck')
    const alone = view([])
    alone.players[0].monsters[0] = { card: card(YU.lotus), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    assert.equal(nextStep(yu, makeCtx(alone, 0, yu.deck), [lotus], () => 0), null, 'sans Spirit dans le Deck, Yubel resterait seul et se détruirait')
    const withFodder = view([])
    withFodder.players[0].monsters[0] = alone.players[0].monsters[0]!
    withFodder.players[0].monsters[1] = { card: card(YU.beckoning, 77), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    assert.equal(nextStep(yu, makeCtx(withFodder, 0), [lotus], () => 0)?.option.id, 1)
  })
})

describe('scripts de deck : valeur des cartes et des positions', () => {
  const be = playbookFor([BE.bewd, BE.maiden, BE.sage, BE.trueLight])!
  const yu = playbookFor([YU.yubel, YU.lotus, YU.pain, YU.throne])!
  const prompt = (cards: number[], hint: number): Extract<Prompt, { kind: 'cards' }> =>
    ({ id: 1, kind: 'cards', text: '', hint, min: 1, max: 1, cancelable: false, mode: 'multi', finishable: false, cards: cards.map((cardId) => ({ uid: cardId, cardId, seat: 0, zone: 'hand' })) }) as never

  it('Yeux Bleus : on défausse Maiden ou White Stone, jamais l’unique Dragon Blanc ni une interruption', () => {
    const c = makeCtx(view([BE.bewd, BE.maiden, BE.ash]), 0)
    const p = prompt([BE.bewd, BE.maiden, BE.ash], 501)
    const keep = p.cards.map((x) => be.rate!(c, x, 'cost', p)!)
    assert.ok(keep[1]! < keep[0]! && keep[1]! < keep[2]!, `Maiden (${keep[1]}) part avant le Dragon (${keep[0]}) et Ash (${keep[2]})`)
  })

  it('Yubel : en recherche, Samsara D Lotus passe avant Terror Incarnate (qu’on ne peut invoquer qu’en lignée)', () => {
    const c = makeCtx(view([]), 0)
    const p = prompt([YU.terror, YU.lotus], 506)
    assert.ok(yu.rate!(c, p.cards[1]!, 'gain', p)! > yu.rate!(c, p.cards[0]!, 'gain', p)!)
  })

  it('Yubel : un monstre de la lignée vaut bien plus que son ATK nulle', () => {
    const m = (cardId: number): never => ({ card: card(cardId), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }) as never
    assert.ok(yu.monster!(m(YU.terror))! > 2000)
    assert.equal(yu.monster!(m(BE.bewd)), undefined)
  })

  it('Yubel : The Ultimate Nightmare (0 ATK) vise le monstre adverse le plus fort, de face', () => {
    const mon = (cardId: number, uid: number, atk: number, faceUp = true): never => ({ card: card(cardId, uid), position: 'atk', faceUp, atk, def: 0, materials: 0 }) as never
    const c = makeCtx(view([]), 0)
    const foes = [mon(BE.sage, 10, 1500), mon(BE.bewd, 11, 3000), mon(BE.alt, 12, 3500, false)]
    assert.equal(yu.target!(c, mon(31764700, 1, 0), foes), 11)
    assert.equal(yu.target!(c, mon(YU.yubel, 2, 0), foes), undefined, 'Yubel lui-même n’a rien à gagner à attaquer')
  })

  it('Yubel : la lignée ne passe jamais en défense, et arrive en position d’attaque', () => {
    const c = makeCtx(view([]), 0)
    assert.ok(isAvoided(yu, c, option(1, 'position', YU.yubel, 'monster')))
    assert.equal(yu.answer!(c, { id: 1, kind: 'position', cardId: YU.terror, options: [{ position: 'def', faceUp: true }, { position: 'atk', faceUp: true }] }), 1)
  })

  it('Yubel : avec Nightmare Pain et un Yubel en attaque, l’adversaire ne menace plus rien', () => {
    const v = view([])
    v.players[0].monsters[0] = { card: card(YU.yubel), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    v.players[0].spellTraps[0] = { card: card(YU.pain, 50), faceUp: true, scale: null }
    assert.equal(yu.redirects!(makeCtx(v, 0)), true)
    assert.equal(yu.redirects!(makeCtx(view([]), 0)), false)
    assert.ok(yu.immune!(v.players[0].monsters[0]!))
  })

  it('Yubel : un Yubel seul, sans Throne, est jugé en danger (il se détruira à l’End Phase)', () => {
    const alone = view([])
    alone.players[0].monsters[0] = { card: card(YU.yubel), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    const backed = view([])
    backed.players[0].monsters[0] = alone.players[0].monsters[0]!
    backed.players[0].monsters[1] = { card: card(YU.lotus, 99), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    assert.ok(yu.position!(makeCtx(alone, 0)) < yu.position!(makeCtx(backed, 0)))
  })

  it('Yubel : Lotus seul peut chercher Spirit, qui ne demande aucun sacrifice de maintien', () => {
    const modern = playbookFor([YU.yubel, YU.spirit, YU.lotus, YU.pain])!
    const v = view([])
    v.players[0].monsters[0] = { card: card(YU.lotus), position: 'atk', faceUp: true, atk: 0, def: 0, materials: 0 }
    const o = option(1, 'activate', YU.lotus, 'monster', 'Special Summon 1 "Yubel" monster from your Deck')
    assert.equal(nextStep(modern, makeCtx(v, 0, modern.deck), [o], () => 0)?.step.id, 'lotus-spirit')
  })

  it('Yubel : Nightmare Pain rend ses attaques à 0 ATK rentables', () => {
    const v = view([])
    const a = { card: card(YU.spirit), position: 'atk' as const, faceUp: true, atk: 0, def: 0, materials: 0 }
    const b = { card: card(BE.bewd), position: 'atk' as const, faceUp: true, atk: 3000, def: 2500, materials: 0 }
    v.players[0].monsters[0] = a
    v.players[0].spellTraps[0] = { card: card(YU.pain), faceUp: true, scale: null }
    const c = makeCtx(v, 0)
    assert.equal(yu.target!(c, a, [b]), BE.bewd)
    assert.deepEqual(yu.combat!(c, a, b), { damage: 3000, selfDamage: 0, kills: false, dies: false })
  })

  it('Yubel : répare une position de défense et ne protège pas avec un monstre face verso', () => {
    const v = view([])
    v.players[0].monsters[0] = { card: card(YU.yubel, 5), position: 'def', faceUp: true, atk: 0, def: 0, materials: 0 }
    v.players[0].spellTraps[0] = { card: card(YU.pain), faceUp: true, scale: null }
    const o = option(5, 'position', YU.yubel, 'monster')
    assert.equal(isAvoided(yu, makeCtx(v, 0), o), false)
    assert.equal(nextStep(yu, makeCtx(v, 0), [o], () => 0)?.step.id, 'repair-attack-position')
    v.players[0].monsters[0]!.faceUp = false
    assert.equal(yu.redirects!(makeCtx(v, 0)), false)
    assert.equal(yu.immune!(v.players[0].monsters[0]!), false)
  })

  it('Yeux Bleus : les boss installés ne servent pas de matériaux avant les petits Tuners', () => {
    const v = view([])
    const p = prompt([89604813, BE.sage], 512)
    p.cards = p.cards.map((c) => ({ ...c, zone: 'monster' }))
    assert.ok(be.rate!(makeCtx(v, 0), p.cards[0]!, 'cost', p)! > be.rate!(makeCtx(v, 0), p.cards[1]!, 'cost', p)!)
  })

  it('Yubel : une suite bannie ne compte pas comme une cible de la lignée classique', () => {
    const modern = playbookFor([YU.yubel, YU.terror, YU.lotus, YU.pain])!
    const v = view([])
    v.players[0].banished = [card(YU.terror)]
    const c = makeCtx(v, 0, modern.deck)
    assert.equal(c.available(YU.terror), false)
    assert.equal(c.inDeck(YU.terror), 0)
  })
})

describe('scripts de deck : à l’œuvre', { skip }, () => {
  before(() => {
    loadData()
  })

  /** Joue le début de partie de l'ordinateur (place 0) contre un adversaire passif ; renvoie le duel à la fin du tour 1. */
  async function opening(deck: string, hand: number[], scripts: boolean): Promise<{ view: DuelView; duel: Duel }> {
    const decks = loadDecks()
    const duel = await Duel.create([decks.get(deck)!, decks.get('joey')!], 0, { seed: 7n, hands: [hand, []] })
    duel.start()
    const ai = new Computer('normal', { scripts })
    for (let n = 0, attempts = 0; n < 200 && !duel.finished; n++) {
      const w = duel.waiting
      if (!w || duel.currentView(0).turn >= 2) break
      const value: Answer | undefined =
        w.seat === 0 ? await ai.choose(duel, 0, attempts) : w.prompt.kind === 'idle' ? w.prompt.options.find((o) => o.action === 'toEnd')?.id : w.prompt.kind === 'chain' ? (w.prompt.forced ? w.prompt.options[0]?.id : null) : 0
      assert.notEqual(value, undefined)
      const r = duel.answer(w.seat, w.prompt.id, value as Answer)
      attempts = typeof r === 'string' ? attempts + 1 : 0
    }
    return { view: duel.currentView(0), duel }
  }

  it('Yeux Bleus : Maiden pose True Light, le Dragon Blanc arrive dès le premier tour sans Invocation Normale', async () => {
    const { view: v, duel } = await opening('blue-eyes', [BE.maiden, BE.bewd, BE.sage, BE.trueLight, BE.ash], true)
    const field = v.players[0].monsters.filter((m) => m).map((m) => m!.card.cardId)
    assert.ok(field.includes(BE.bewd) || field.includes(BE.alt), `un Dragon Blanc est sur le terrain (${field.join(', ')})`)
    assert.ok(v.players[0].spellTraps.some((s) => s?.card.cardId === BE.trueLight), 'True Light est posée')
    duel.destroy()
  })

  it('Yubel : construit son terrain dès le premier tour et conserve Ash en main', async () => {
    const { view: v, duel } = await opening('yubel', [YU.lotus, YU.pain, YU.throne, 24215921, BE.ash], true)
    try {
      assert.ok(v.players[0].monsters.some((m) => m?.faceUp && [YU.yubel, YU.terror, YU.spirit, 31764700, 80453041, 47172959].includes(m.card.cardId ?? 0)), 'un Yubel actif est en place')
      assert.ok(v.players[0].hand.some((c) => c.cardId === BE.ash), 'Ash reste une interruption en main')
      assert.equal(duel.refused, 0)
    } finally {
      duel.destroy()
    }
  })
})
