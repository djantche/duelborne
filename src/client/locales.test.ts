// Fichiers de langue : toutes les langues ont les mêmes clés, aucune clé utilisée dans le code n'est absente, aucune n'est orpheline.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const dir = new URL('./locales/', import.meta.url)
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
const tables = Object.fromEntries(files.map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Record<string, string>]))
const keys = (t: Record<string, string>): string[] => Object.keys(t).filter((k) => !k.startsWith('_'))
const base = (k: string): string => k.replace(/_(one|other)$/, '')

/** Les fichiers source (hors tests), pour y chercher les clés utilisées. */
function sources(root: URL): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(root.pathname)
  return out
}

describe('langues', () => {
  it('ont chacune un nom et un code', () => {
    for (const [id, t] of Object.entries(tables)) {
      assert.ok(t._name, `${id} : _name manquant`)
      assert.ok(t._code, `${id} : _code manquant`)
    }
  })

  it('ont exactement les mêmes clés que le français', () => {
    const fr = new Set(keys(tables.fr as Record<string, string>))
    for (const [id, t] of Object.entries(tables)) {
      const have = new Set(keys(t))
      const missing = [...fr].filter((k) => !have.has(k))
      const extra = [...have].filter((k) => !fr.has(k))
      assert.deepEqual({ missing: missing.slice(0, 10), extra: extra.slice(0, 10) }, { missing: [], extra: [] }, `${id} : clés différentes du français`)
    }
  })

  it('ne laissent aucune valeur vide', () => {
    for (const [id, t] of Object.entries(tables)) for (const k of keys(t)) assert.ok((t[k] as string).length > 0, `${id} : « ${k} » est vide`)
  })

  it('couvrent toutes les clés citées dans le code', () => {
    const known = new Set(keys(tables.fr as Record<string, string>).map(base))
    const code = [...sources(new URL('./', import.meta.url)), ...sources(new URL('../server/', import.meta.url)), ...sources(new URL('../shared/', import.meta.url))].join('\n')
    const used = new Set<string>()
    for (const m of code.matchAll(/\b(?:t|tr|msg|ref|has)\(\s*'([a-z][\w.-]*)'/gi)) used.add(m[1] as string)
    const missing = [...used].filter((k) => !known.has(k) && ![...known].some((n) => n.startsWith(`${k}.`)))
    assert.deepEqual(missing, [], 'clés utilisées mais absentes du français')
  })
})
