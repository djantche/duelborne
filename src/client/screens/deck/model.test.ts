// Tests de l'éditeur de deck (partie sans affichage).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ClientCard } from '../../ui/cardview.ts'
import type { Draft } from './model.ts'
import { addCard, check, copiesOf, emptyDraft, fingerprint, fold, noFilters, removeCard, search, sections, toYdk, whyNotAdd } from './model.ts'

const card = (id: number, name: string, frameType: string, extra: Partial<ClientCard> = {}): ClientCard => ({
  id,
  name: { en: name, fr: name },
  desc: { en: '', fr: '' },
  type: frameType === 'spell' ? 'Spell Card' : frameType === 'trap' ? 'Trap Card' : 'Effect Monster',
  frameType,
  race: 'Dragon',
  attribute: frameType === 'spell' || frameType === 'trap' ? null : 'DARK',
  atk: 1000,
  def: 1000,
  level: 4,
  ...extra,
})

const bewd = card(1, 'Dragon Blanc aux Yeux Bleus', 'normal', { level: 8, attribute: 'LIGHT' })
const dm = card(2, 'Magicien Sombre', 'normal', { level: 7, race: 'Spellcaster' })
const raigeki = card(3, 'Raigeki', 'spell', { race: 'Normal' })
const mirror = card(4, 'Force Miroir', 'trap', { race: 'Normal' })
const stardust = card(5, 'Dragon Poussière d’Étoile', 'synchro', { level: 8 })
const token = card(6, 'Jeton', 'token')
const all = new Map([bewd, dm, raigeki, mirror, stardust, token].map((c) => [c.id, c]))

describe('éditeur de deck', () => {
  it('range Fusion, Synchro, Xyz et Lien dans l’Extra Deck, le reste dans le Principal', () => {
    const d = addCard(addCard(emptyDraft(), stardust), bewd)
    assert.deepEqual(d.extra, [5])
    assert.deepEqual(d.main, [1])
  })

  it('limite à 3 exemplaires par carte, Principal et Extra confondus', () => {
    let d = emptyDraft()
    for (let i = 0; i < 5; i++) d = addCard(d, bewd)
    assert.equal(copiesOf(d, 1), 3)
    assert.equal(whyNotAdd(d, bewd)?.key, 'deck.err.copies')
    assert.equal(whyNotAdd(d, bewd)?.params?.max, 3)
  })

  it('limite le Deck Principal à 60 et l’Extra à 15', () => {
    let d = emptyDraft()
    d = { ...d, main: Array.from({ length: 60 }, (_, i) => 100 + i) }
    assert.equal(whyNotAdd(d, dm)?.key, 'deck.err.mainFull')
    d = { ...d, extra: Array.from({ length: 15 }, (_, i) => 200 + i) }
    assert.equal(whyNotAdd(d, stardust)?.key, 'deck.err.extraFull')
  })

  it('refuse les jetons', () => {
    assert.ok(whyNotAdd(emptyDraft(), token))
    assert.deepEqual(addCard(emptyDraft(), token), emptyDraft())
  })

  it('retire un exemplaire à la fois, et l’emblème s’efface avec la dernière copie', () => {
    let d: Draft = { ...addCard(addCard(emptyDraft(), bewd), bewd), cover: 1 }
    d = removeCard(d, bewd)
    assert.equal(copiesOf(d, 1), 1)
    assert.equal(d.cover, 1)
    d = removeCard(d, bewd)
    assert.equal(copiesOf(d, 1), 0)
    assert.equal(d.cover, null)
  })

  it('classe le Principal en monstres (Niveau décroissant), Magies, Pièges', () => {
    const d = [dm, mirror, bewd, raigeki, dm].reduce((acc, c) => addCard(acc, c), emptyDraft())
    const s = sections(d.main, 'main', all)
    assert.deepEqual(s.map((x) => x.title), ['deck.section.monster', 'deck.section.spell', 'deck.section.trap'])
    assert.deepEqual(s[0]?.groups.map((g) => [g.card.id, g.count]), [[1, 1], [2, 2]])
    assert.equal(s[0]?.total, 3)
  })

  it('dit ce qu’il reste à faire avant que le deck soit jouable', () => {
    const d = { ...emptyDraft(), name: 'Test', main: Array.from({ length: 38 }, () => 1) }
    const r = check(d, all)
    assert.equal(r.playable, false)
    assert.equal(r.todo[0]?.key, 'deck.todo.missing')
    assert.equal(r.todo[0]?.params?.n, 2)
    assert.equal(check({ ...d, main: [...d.main, 1, 1] }, all).playable, true)
  })

  it('compte monstres, Magies et Pièges', () => {
    const d = [bewd, dm, raigeki, mirror, mirror].reduce((acc, c) => addCard(acc, c), emptyDraft())
    const r = check(d, all)
    assert.deepEqual([r.monsters, r.spells, r.traps], [2, 1, 2])
  })

  it('cherche sans tenir compte des accents ni des majuscules, par nom français ou anglais', () => {
    assert.equal(fold('Épée Magique'), 'epee magique')
    const hits = search(all.values(), { ...noFilters(), text: 'poussiere' }, 50).list
    assert.deepEqual(hits.map((c) => c.id), [5])
    const en = search([{ ...bewd, name: { en: 'Blue-Eyes White Dragon', fr: bewd.name.fr } }], { ...noFilters(), text: 'blue-eyes' }, 50).list
    assert.equal(en.length, 1)
  })

  it('n’affiche rien sans critère, et filtre par genre, attribut et Niveau', () => {
    assert.equal(search(all.values(), noFilters(), 50).list.length, 0)
    assert.deepEqual(search(all.values(), { ...noFilters(), kind: 'spell' }, 50).list.map((c) => c.id), [3])
    assert.deepEqual(search(all.values(), { ...noFilters(), kind: 'extra' }, 50).list.map((c) => c.id), [5])
    assert.deepEqual(search(all.values(), { ...noFilters(), attribute: 'LIGHT' }, 50).list.map((c) => c.id), [1])
    assert.deepEqual(search(all.values(), { ...noFilters(), kind: 'monster', level: 7 }, 50).list.map((c) => c.id), [2])
  })

  it('coupe la liste et signale qu’il y en a d’autres', () => {
    const many = Array.from({ length: 10 }, (_, i) => card(100 + i, `Carte ${i}`, 'normal'))
    const r = search(many, { ...noFilters(), kind: 'monster' }, 4)
    assert.equal(r.list.length, 4)
    assert.equal(r.more, true)
  })

  it('l’empreinte ignore l’ordre des cartes mais voit un changement de nom ou de carte', () => {
    const a = { ...emptyDraft(), name: 'A', main: [1, 2, 3] }
    assert.equal(fingerprint(a), fingerprint({ ...a, main: [3, 1, 2] }))
    assert.notEqual(fingerprint(a), fingerprint({ ...a, name: 'B' }))
    assert.notEqual(fingerprint(a), fingerprint({ ...a, main: [1, 2] }))
  })

  it('exporte un .ydk que l’import sait relire', () => {
    const text = toYdk({ ...emptyDraft(), name: 'Mon essai', main: [1, 1, 2], extra: [5] })
    assert.match(text, /#name: Mon essai/)
    assert.match(text, /#main\n1\n1\n2\n#extra\n5\n!side/)
  })
})
