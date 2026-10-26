// Tests d'import de decks (YDK, YDKE) et de l'enregistrement des decks de joueurs.
// Comme pour les autres tests, la base du moteur est chargée une fois (before) : les cartes
// d'essai ne passent l'écran du filtre isKnown que si elle est là. L'enregistrement se fait dans
// une base SQLite temporaire, supprimée à la fin.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { DeckService } from '../accounts/decks.ts'
import { DECKS_DIR } from '../paths.ts'
import { openStorageAt } from '../store/index.ts'
import { loadData, missingData } from './data.ts'
import { isPlayable } from './decks.ts'
import type { DeckList } from './decks.ts'
import { deckFromHtml, importDeck, parseYdkText, parseYdke } from './import.ts'

const skip = (missingData() ?? false) || !existsSync(path.join(DECKS_DIR, 'blue-eyes.ydk'))

before(() => {
  if (!skip) loadData()
})

describe('Import de decks', () => {
  describe('Fichier .ydk (texte)', () => {
    it('lit les sections #main et #extra', () => {
      const r = parseYdkText('#created by test\n#main\n89631139\n89631139\n#extra\n23995346\n')
      assert.deepEqual(r.main, [89631139, 89631139])
      assert.deepEqual(r.extra, [23995346])
      assert.deepEqual(r.unknown, [])
    })

    it('écarte les cartes hors base et les signale', () => {
      const r = parseYdkText('#main\n89631139\n99999999\n#extra\n22222222\n')
      assert.deepEqual(r.main, [89631139])
      assert.deepEqual(r.extra, [])
      assert.deepEqual(r.unknown, [99999999, 22222222])
    })

    it('renvoie le nom lu dans #name', () => {
      const r = parseYdkText('#name: Yeux Bleus\n#main\n89631139\n')
      assert.equal(r.name, 'Yeux Bleus')
    })

    it('le side rejoint le deck principal', () => {
      const r = parseYdkText('#main\n89631139\n!side\n46986414\n')
      assert.deepEqual(r.main, [89631139, 46986414])
    })
  })

  describe('YDKE (ygoprodeck://)', () => {
    const enc = (codes: number[]): string => {
      const bytes = Buffer.alloc(codes.length * 4)
      codes.forEach((c, i) => bytes.writeUInt32LE(c, i * 4))
      return bytes.toString('base64')
    }

    it('décode les trois sections base64 little-endian', () => {
      const r = parseYdke(`ygoprodeck://${enc([89631139])}|${enc([23995346])}|${enc([])}`)
      assert.ok(r)
      assert.deepEqual(r.main, [89631139])
      assert.deepEqual(r.extra, [23995346])
    })

    it('le side de la YDKE rejoint le principal', () => {
      const r = parseYdke(`ygoprodeck://${enc([89631139])}|${enc([])}|${enc([46986414])}`)
      assert.ok(r)
      assert.deepEqual(r.main, [89631139, 46986414])
    })

    it('renvoie null si le texte n’en est pas une', () => {
      assert.equal(parseYdke('copain d’avant'), null)
    })
  })
})

describe('Decks des joueurs (base, un compte à la fois)', () => {
  // 40 cartes légales : 13 cartes différentes en 3 exemplaires + 1.
  const cards = [89631139, 46986414, 74677422, 70781052, 17444133, 22702055, 55144522, 12580477, 24094653, 44095762, 91152256, 15025844, 78371393]
  const main = [...cards, ...cards, ...cards, 10000000]
  const validDeck = { name: 'ZZ-test-import', series: 'Tests', main, extra: [23995346] }
  let dir = ''
  let store: ReturnType<typeof openStorageAt>
  let decks: DeckService
  const user = (id: string): void => store.users.create({ id, username: id, displayName: id, passwordHash: 'x', prefs: {}, createdAt: 1, updatedAt: 1 })
  const savedOk = (r: ReturnType<DeckService['save']>): DeckList => {
    assert.ok(!('error' in r), 'error' in r ? r.error : '')
    return r.deck
  }

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'duel-decks-'))
    store = openStorageAt(path.join(dir, 'test.sqlite'))
    decks = new DeckService(store)
    user('alice')
    user('bob')
  })
  after(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('accepte un brouillon (moins de 40 cartes) mais le dit injouable', { skip }, () => {
    const deck = savedOk(decks.save('alice', { ...validDeck, name: 'ZZ-brouillon', main: [89631139] }))
    assert.equal(isPlayable(deck), false)
  })

  it('refuse plus de 3 exemplaires d’une même carte', { skip }, () => {
    const result = decks.save('alice', { ...validDeck, name: 'ZZ-quatre', main: [89631139, 89631139, 89631139, 89631139] })
    assert.ok('error' in result && result.error.startsWith('@api.copies'))
  })

  it('refuse un Extra Deck de plus de 15 cartes', { skip }, () => {
    const result = decks.save('alice', { ...validDeck, name: 'ZZ-extra', extra: Array.from({ length: 16 }, (_, i) => [23995346, 56532353, 2857636, 7391448, 44508094][i % 5] as number) })
    assert.ok('error' in result)
  })

  it('refuse une carte inconnue du moteur en la nommant', { skip }, () => {
    const result = decks.save('alice', { ...validDeck, name: 'ZZ-inconnue', main: [89631139, 1] })
    assert.ok('error' in result && result.unplayable?.includes(1))
  })

  it('enregistre le deck dans la base et le relit complet', { skip }, () => {
    const deck = savedOk(decks.save('alice', validDeck))
    assert.ok(deck.id.startsWith('user-'))
    assert.equal(deck.main.length, 40)
    assert.equal(deck.extra.length, 1)
    assert.equal(deck.series, 'Tests')
    assert.equal(isPlayable(deck), true)
    assert.equal(decks.get('alice', deck.id)?.name, 'ZZ-test-import')
  })

  it('refuse un nouveau deck au nom déjà pris au lieu d’écraser l’autre', { skip }, () => {
    const result = decks.save('alice', validDeck)
    assert.ok('error' in result && result.status === 409)
  })

  it('renommer un deck le garde au même endroit au lieu d’en créer un autre', { skip }, () => {
    const first = savedOk(decks.save('alice', { ...validDeck, name: 'ZZ-avant' }))
    const renamed = savedOk(decks.save('alice', { ...validDeck, name: 'ZZ-renommé', replaces: first.id }))
    assert.equal(renamed.id, first.id)
    assert.equal(renamed.name, 'ZZ-renommé')
    assert.equal(decks.list('alice').filter((d) => d.id === first.id).length, 1)
  })

  it('chaque compte ne voit, ne modifie et ne supprime que ses decks', { skip }, () => {
    const mine = savedOk(decks.save('alice', { ...validDeck, name: 'ZZ-privé' }))
    assert.equal(decks.get('bob', mine.id), undefined)
    assert.equal(decks.remove('bob', mine.id), false)
    const stolen = decks.save('bob', { ...validDeck, name: 'ZZ-vol', replaces: mine.id })
    assert.ok('error' in stolen && stolen.status === 404)
    assert.equal(decks.get('alice', mine.id)?.name, 'ZZ-privé')
  })

  it('les decks d’origine ne sont pas supprimables', { skip }, () => {
    const originals = readdirSync(DECKS_DIR).filter((f) => f.endsWith('.ydk'))
    const id = originals[0]?.replace(/\.ydk$/, '')
    if (!id) return
    assert.equal(decks.remove('alice', id), false)
    assert.ok(existsSync(path.join(DECKS_DIR, `${id}.ydk`)), 'le fichier d’origine reste en place')
  })
})

import { Buffer } from 'node:buffer'

describe('Import : un seul point d’entrée', () => {
  const enc = (codes: number[]): string => Buffer.from(Uint32Array.from(codes).buffer).toString('base64')
  before(() => loadData())

  it('lit un .ydk court (deck en cours de construction)', { skip }, async () => {
    const { kind, result } = await importDeck('#main\n89631139\n46986414\n#extra\n23995346\n')
    assert.equal(kind, 'ydk')
    assert.deepEqual(result.main, [89631139, 46986414])
    assert.deepEqual(result.extra, [23995346])
  })

  it('lit une YDKE courte', { skip }, async () => {
    const { kind, result } = await importDeck(`ygoprodeck://${enc([89631139, 89631139])}|${enc([23995346])}|`)
    assert.equal(kind, 'ydke')
    assert.equal(result.main.length, 2)
  })

  it('refuse un texte qui n’est pas un deck', { skip }, async () => {
    await assert.rejects(importDeck('bonjour, ceci n’est pas un deck'), /@imp\.format/)
  })

  it('refuse un .ydk dont aucune carte n’est connue', { skip }, async () => {
    await assert.rejects(importDeck('#main\n1\n2\n#extra\n'), /@imp\.noYdk/)
  })

  it('lit les sections d’une page YGOProDeck', { skip }, () => {
    const html = '<title>Mon deck - YGOPRODeck</title><div id="main_deck"><img data-card="89631139"><img data-card="89631139"></div><div id="extra_deck"><img data-card="23995346"></div><div id="side_deck"><img data-card="46986414"></div>'
    const r = deckFromHtml(html)
    assert.equal(r?.name, 'Mon deck')
    assert.deepEqual(r?.main, [89631139, 89631139])
    assert.deepEqual(r?.extra, [23995346])
  })
})
