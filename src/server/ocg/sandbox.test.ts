// Tests de la Console du bac à sable : chaque action passe par le vrai moteur, donc vérifie aussi ses questions,
// ses messages et le bon décodage de ceux-ci (compteurs, ordre, sommes de Niveaux, Sacrifices doubles...).
import { frText } from '../../shared/msg.ts'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import type { Answer, DuelView, GameEvent, Prompt } from '../../shared/protocol.ts'
import { Bot } from '../ai/bot.ts'
import { loadData, missingData } from './data.ts'
import { loadDecks } from './decks.ts'
import type { DeckList } from './decks.ts'
import { Duel } from './duel.ts'
import { CONSOLE_CODE } from './sandbox.ts'

const skip = missingData() ?? false

const C = { darkRedEyes: 74677422, summonedSkull: 70781052, kaiser: 17444133, blueEyes: 89631139, umi: 22702055 }

/** Joue la Console : `plan` donne, dans l'ordre, la réponse à chaque question (texte de menu, nombre, ou liste de rangs). */
async function play(plan: (string | number | number[])[], { turns = 1 }: { turns?: number } = {}): Promise<{ events: GameEvent[]; view: DuelView; duel: Duel; refused: number; seen: Prompt[] }> {
  const decks = [...loadDecks().values()]
  const duel = await Duel.create([decks.find((d) => d.id === 'yubel') as DeckList, decks[0] as DeckList], 0, { seed: 5n }, { sandbox: true })
  const foe = new Bot(1, { passive: true })
  const events: GameEvent[] = []
  const seen: Prompt[] = []
  const collect = (steps: ReturnType<Duel['start']>): void => void steps.forEach((s) => events.push(...(s.events[0] ?? [])))
  collect(duel.start())
  const queue = [...plan]
  let opened = plan.length === 0
  for (let i = 0; i < 400 && !duel.finished; i++) {
    const w = duel.waiting
    if (!w) break
    const view = duel.currentView(w.seat)
    const prompt = view.prompt as Prompt
    let value: Answer | undefined
    // Pierre-feuille-ciseaux : l'ordinateur joue au hasard, une égalité ferait rejouer la manche ; le test lui fait toujours jouer ciseaux (le joueur gagne).
    if (w.seat === 1) value = prompt.kind === 'option' && prompt.rps ? 0 : foe.choose(view)
    else if (prompt.kind === 'idle' || prompt.kind === 'battle') {
      const next = queue[0]
      const wanted = typeof next === 'string' && next.startsWith('@') ? next.slice(1).split(':') : null
      const option =
        wanted !== null
          ? prompt.options.find((o) => o.action === wanted[0] && String(o.cardId) === wanted[1])
          : queue[0] === '--' || !opened
            ? prompt.options.find((o) => o.action === 'activate' && o.cardId === CONSOLE_CODE)
            : undefined
      // Le parcours est fini : si on veut voir les tours suivants, on passe le tour.
      const pass = option === undefined && turns > 1 && !queue.length ? prompt.options.find((o) => o.action === 'toEnd' || o.action === 'toMain2') : undefined
      if (pass) {
        if (view.turn >= turns && w.seat === 0 && prompt.kind === 'idle') break
        value = pass.id
        const out = duel.answer(w.seat, w.prompt.id, value)
        collect(out as ReturnType<Duel['start']>)
        continue
      }
      if (!option) break
      if (wanted !== null || queue[0] === '--') queue.shift()
      opened = true
      value = option.id
    } else {
      seen.push(prompt)
      const next = queue.shift()
      assert.notEqual(next, undefined, `question sans réponse prévue : ${JSON.stringify(prompt).slice(0, 300)}`)
      if (prompt.kind === 'option') value = typeof next === 'string' ? prompt.options.findIndex((o) => frText(o).startsWith(next)) : (next as number)
      else if (prompt.kind === 'number') value = prompt.options.indexOf(next as number)
      else value = next as Answer
      assert.ok(value !== -1, `réponse introuvable : ${String(next)} parmi ${JSON.stringify((prompt as { options?: unknown }).options)}`)
    }
    const out = duel.answer(w.seat, w.prompt.id, value as Answer)
    assert.equal(typeof out, 'object', `réponse refusée : ${String(out)}`)
    collect(out as ReturnType<Duel['start']>)
  }
  return { events, view: duel.currentView(0), duel, refused: duel.refused, seen }
}

describe('Console du bac à sable', { skip }, () => {
  before(() => loadData())

  it('pose la Console face recto sur le terrain des deux joueurs', async () => {
    const { view, duel } = await play([])
    for (const side of [0, 1]) assert.equal(view.players[side]?.spellTraps[2]?.card.cardId, CONSOLE_CODE)
    assert.ok(view.players[0]?.spellTraps[2]?.faceUp)
    duel.destroy()
  })

  it('lance des dés et des pièces, et crée des cartes en main, au terrain et au Cimetière', async () => {
    const dice = await play(['Lancer des dés', '2'])
    assert.equal(dice.events.filter((e) => e.type === 'dice').length, 1)
    assert.equal((dice.events.find((e) => e.type === 'dice') as Extract<GameEvent, { type: 'dice' }>).results.length, 2)
    dice.duel.destroy()

    const coin = await play(['Lancer des pièces', '1'])
    assert.ok(coin.events.some((e) => e.type === 'coin'))
    coin.duel.destroy()

    const hand = await play(['Ajouter', 'Pour moi', C.darkRedEyes, 'Dans la main'])
    assert.equal(hand.view.players[0]?.hand.length, 6)
    assert.ok(hand.events.some((e) => e.type === 'move' && e.how === 'create'))
    hand.duel.destroy()

    const field = await play(['Ajouter', 'Pour moi', C.darkRedEyes, 'Sur le terrain', 2])
    assert.equal(field.view.players[0]?.monsters[2]?.card.cardId, C.darkRedEyes)
    assert.ok(field.events.some((e) => e.type === 'summon'))
    field.duel.destroy()

    const grave = await play(['Ajouter', 'Pour moi', C.summonedSkull, 'Au Cimetière'])
    assert.equal(grave.view.players[0]?.graveyard.length, 1)
    grave.duel.destroy()

    const terrain = await play(['Ajouter', 'Pour moi', C.umi, 'Sur le terrain'])
    assert.equal(terrain.view.players[0]?.fieldZone?.card.cardId, C.umi)
    terrain.duel.destroy()
  })

  it('demande de déclarer une carte parmi celles que l’effet permet, et refuse les autres', async () => {
    const { seen, duel } = await play(['Ajouter', 'Pour moi', C.darkRedEyes, 'Dans la main'])
    const announce = seen.find((p) => p.kind === 'announce')
    assert.ok(announce && announce.kind === 'announce' && announce.cards.includes(C.darkRedEyes) && announce.cards.length > 1000)
    duel.destroy()
    // Un jeton « n'importe lequel » ne propose que des jetons.
    const tokens = await play(['Créer des jetons', 'Pour moi', 'Un autre jeton', 73915052, 1, 0])
    const list = tokens.seen.find((p) => p.kind === 'announce')
    assert.ok(list && list.kind === 'announce' && !list.cards.includes(C.darkRedEyes) && list.cards.includes(73915052))
    tokens.duel.destroy()
  })

  it('crée des jetons et laisse choisir leur zone', async () => {
    const { view, seen, duel } = await play(['Créer des jetons', 'Pour moi', 'Jeton Mouton', 3, 0, 0, 0])
    assert.equal(view.players[0]?.monsters.filter(Boolean).length, 3)
    assert.equal(seen.filter((p) => p.kind === 'place').length, 3, 'une zone demandée par jeton')
    duel.destroy()
  })

  it('modifie les points de vie de chaque côté', async () => {
    const dmg = await play(['Modifier les points', 'Pour l’adversaire', 'Infliger', 2000])
    assert.equal(dmg.view.players[1]?.lp, 6000)
    dmg.duel.destroy()
    const gain = await play(['Modifier les points', 'Pour moi', 'Gagner', 1000])
    assert.equal(gain.view.players[0]?.lp, 9000)
    gain.duel.destroy()
    const set = await play(['Modifier les points', 'Pour moi', 'Fixer', 100])
    assert.equal(set.view.players[0]?.lp, 100)
    set.duel.destroy()
  })

  it('pose des compteurs, puis demande lesquels retirer quand il y a le choix', async () => {
    const addCounter = (card: number): (string | number)[] => ['--', 'Agir sur', card, 'Poser un compteur', 'Compteur Magique']
    const plan = ['Ajouter', 'Pour moi', C.darkRedEyes, 'Sur le terrain', 2, '--', 'Ajouter', 'Pour moi', C.summonedSkull, 'Sur le terrain', 2] as (string | number | number[])[]
    // Rang des cartes dans la liste « Choisis la carte concernée » : main (5), puis nos monstres.
    const { view, seen, duel } = await play([...plan, ...(addCounter(5) as []), ...(addCounter(5) as []), ...(addCounter(6) as []), '--', 'Tests du moteur', 'Retirer', [1, 1]])
    const ask = seen.find((p) => p.kind === 'counters')
    assert.ok(ask && ask.kind === 'counters' && ask.total === 2 && ask.cards.map((c) => c.max).join() === '2,1', 'la demande indique 2 et 1 compteurs disponibles')
    const left = view.players[0]?.monsters.flatMap((m) => m?.counters ?? []).reduce((t, c) => t + c.count, 0)
    assert.equal(left, 1, 'deux compteurs retirés sur trois')
    duel.destroy()
  })

  it('ordonne le dessus du Deck : la première carte touchée sera piochée en premier', async () => {
    for (const order of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) {
      const { seen, view, duel } = await play(['Tests du moteur', 'Ordonner', order], { turns: 3 })
      const ask = seen.find((p) => p.kind === 'cards' && p.ordered)
      assert.ok(ask && ask.kind === 'cards')
      const expected = (ask.cards[order[0] as number] as { cardId: number | null }).cardId
      // Après son tour et celui de l'adversaire, le joueur pioche : c'est la première carte de l'ordre.
      assert.equal(view.players[0]?.hand.at(-1)?.cardId, expected, `ordre ${order.join(',')}`)
      duel.destroy()
    }
  })

  it('compte une carte pour 2 Sacrifices quand elle le vaut', async () => {
    const { seen, view, duel } = await play(['Ajouter', 'Pour moi', C.kaiser, 'Sur le terrain', 0, '--', 'Ajouter', 'Pour moi', C.blueEyes, 'Dans la main', `@summon:${C.blueEyes}`, [0], 0])
    const tribute = seen.find((p) => p.kind === 'cards' && p.weights)
    assert.ok(tribute && tribute.kind === 'cards' && tribute.weights?.join() === '2' && tribute.min === 2)
    assert.equal(view.players[0]?.monsters.find((m) => m?.card.cardId === C.blueEyes)?.card.cardId, C.blueEyes)
    duel.destroy()
  })

  it('traite les cartes imposées d’une sélection par somme comme déjà cochées', async () => {
    const tokens: (string | number | number[])[] = ['Créer des jetons', 'Pour moi', 'Jeton Mouton', 3, 0, 0, 0, '--', 'Créer des jetons', 'Pour moi', 'Jeton Ojama', 1, 0]
    // Rangs : 0 = jeton imposé, 1 et 2 = Moutons, 3 = Ojama (2 Niveaux) : 1 imposé + 1 + 2 = 4.
    const { seen, refused, duel } = await play([...tokens, '--', 'Tests du moteur', 'Somme de Niveaux exacte', [1, 3]])
    const sum = seen.find((p) => p.kind === 'cards' && p.sum)
    assert.ok(sum && sum.kind === 'cards' && sum.sum)
    assert.equal(sum.sum.fixed, 1)
    assert.equal(sum.mustCount, 1)
    assert.equal(sum.sum.atLeast, undefined, 'somme exacte')
    assert.equal(refused, 0, 'le moteur accepte la réponse')
    duel.destroy()
    const atLeast = await play([...tokens, '--', 'Tests du moteur', 'Somme de Niveaux d’au moins', [1, 3]])
    const ask = atLeast.seen.find((p) => p.kind === 'cards' && p.sum)
    assert.ok(ask && ask.kind === 'cards' && ask.sum?.atLeast === true && ask.max > 0, 'au moins : sans limite de nombre de cartes')
    atLeast.duel.destroy()
  })

  it('propose les matériels de Fusion un emplacement à la fois : « Yubel » d’abord, puis le Démon', async () => {
    const yubel = 78371393
    const lotus = 62318994 // Démon, mais pas « Yubel »
    const terror = 4779091 // « Yubel » et Démon
    const add = (code: number, zone: number): (string | number | number[])[] => ['Ajouter', 'Pour moi', code, 'Sur le terrain', zone, '--']
    const { seen, refused, duel } = await play([...add(yubel, 0), ...add(lotus, 1), ...add(terror, 2).slice(0, -1), '@spsummon:80453041', 0, 0, 0, 0])
    const steps = seen.filter((p) => p.kind === 'cards' && p.hint === 511)
    assert.ok(steps.length >= 2, 'deux étapes de sélection')
    const first = steps[0]
    const second = steps[1]
    assert.ok(first?.kind === 'cards' && second?.kind === 'cards')
    assert.deepEqual(first.cards.map((c) => c.cardId).sort(), [yubel, terror].sort(), 'étape 1 : seulement les monstres « Yubel »')
    assert.ok(second.cards.some((c) => c.cardId === lotus), 'étape 2 : les Démons, dont le Lotus')
    assert.equal(refused, 0)
    duel.destroy()
  })

  it('désactive une zone et la signale', async () => {
    const { view, duel } = await play(['Tests du moteur', 'Désactiver', 1])
    assert.deepEqual(view.disabled, ['0:m:1'])
    duel.destroy()
  })

  it('pose les questions rares au joueur : Type, Attribut, pierre-feuille-ciseaux, nombre', async () => {
    const race = await play(['Tests du moteur', 'Déclarer un Type', 3])
    assert.ok(race.seen.some((p) => p.kind === 'option' && p.options.length > 20))
    race.duel.destroy()
    const attr = await play(['Tests du moteur', 'Déclarer un Attribut', 0])
    assert.ok(attr.seen.some((p) => p.kind === 'option' && p.options.length === 7))
    attr.duel.destroy()
    const rps = await play(['Tests du moteur', 'Pierre', 1])
    assert.ok(rps.seen.some((p) => p.kind === 'option' && p.options.join() === '@srv.scissors,@srv.rock,@srv.paper'))
    rps.duel.destroy()
    const nb = await play(['Tests du moteur', 'Déclarer un nombre', 7])
    assert.ok(nb.seen.some((p) => p.kind === 'number' && p.options.length === 10))
    nb.duel.destroy()
  })

  it('détruit, bannit et renvoie des cartes avec les bons événements', async () => {
    const setup: (string | number | number[])[] = ['Ajouter', 'Pour moi', C.darkRedEyes, 'Sur le terrain', 2]
    const destroy = await play([...setup, '--', 'Agir sur', 5, 'La détruire'])
    assert.ok(destroy.events.some((e) => e.type === 'destroy'))
    destroy.duel.destroy()
    const banish = await play([...setup, '--', 'Agir sur', 5, 'La bannir'])
    assert.ok(banish.events.some((e) => e.type === 'move' && e.how === 'banish'))
    assert.equal(banish.view.players[0]?.banished.length, 1)
    banish.duel.destroy()
    const back = await play([...setup, '--', 'Agir sur', 5, 'La renvoyer en main'])
    assert.ok(back.events.some((e) => e.type === 'move' && e.how === 'toHand'))
    assert.equal(back.view.players[0]?.hand.length, 6)
    back.duel.destroy()
  })
})
