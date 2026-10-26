import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { SummonAssets } from '../../shared/summon.ts'
import { DATA_DIR } from '../paths.ts'

const DIRECTORY = 'images/master-duel-monsters'
let cached: SummonAssets = {}
let knownIds = new Set<number>()
let expires = 0

/** Ne publie que les originaux déjà téléchargés et les sons effectivement présents. */
export function summonAssets(): SummonAssets {
  if (Date.now() < expires) return cached
  const assets: SummonAssets = {}
  const known = new Set<number>()
  const index = path.join(DATA_DIR, DIRECTORY, 'by-card.json')
  if (existsSync(index)) {
    try {
      const body = JSON.parse(readFileSync(index, 'utf8'))
      for (const [id, value] of Object.entries(body.cards ?? {})) {
        if (!/^[1-9]\d*$/.test(id) || !value || typeof value !== 'object') continue
        const card = value as { images?: { path?: string }[] }
        if (!Array.isArray(card.images)) continue
        known.add(Number(id))
        const image = card.images.find((entry) => typeof entry?.path === 'string'
          && entry.path.startsWith(`${DIRECTORY}/`) && path.posix.dirname(entry.path) === DIRECTORY
          && !entry.path.includes('\\') && /\.png$/i.test(entry.path) && existsSync(path.join(DATA_DIR, entry.path)))?.path
        if (image) assets[id] = { image: `/data/${image.split('/').map(encodeURIComponent).join('/')}` }
      }
    } catch (error) {
      console.warn('[invocations] Index des illustrations illisible :', (error as Error).message)
    }
  }
  const chants = path.join(DATA_DIR, 'sounds/summon')
  if (existsSync(chants)) {
    try {
      for (const entry of readdirSync(chants, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const match = /^([1-9]\d*)\.(?:wav|ogg|mp3|flac)$/i.exec(entry.name)
        if (!entry.isFile() || !match) continue
        const id = match[1]!
        assets[id] ??= {}
        assets[id].chant ??= `/data/sounds/summon/${encodeURIComponent(entry.name)}`
      }
    } catch (error) {
      console.warn('[invocations] Sons locaux illisibles :', (error as Error).message)
    }
  }
  cached = assets
  knownIds = known
  expires = Date.now() + 30_000
  return assets
}

export function summonIllustrationIds(): ReadonlySet<number> { summonAssets(); return knownIds }
