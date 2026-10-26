// Repli hors ligne : conserve les cartes complètes et en extrait les illustrations absentes.
// Outil de préparation uniquement ; nécessite ImageMagick (`magick`).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const cards = JSON.parse(readFileSync(path.join(root, 'data/cards.json'), 'utf8'))
const provenance = path.join(root, 'data/cropped-from-small.json')
const generated = existsSync(provenance) ? JSON.parse(readFileSync(provenance, 'utf8')) : []
const missing = []
for (const card of cards) {
  const output = path.join(root, 'data/images/cropped', `${card.id}.jpg`)
  if (existsSync(output)) continue
  const input = path.join(root, 'data/images/small', `${card.id}.jpg`)
  if (!existsSync(input)) { missing.push(card.id); continue }
  const dimensions = spawnSync('magick', ['identify', '-format', '%w %h', input], { encoding: 'utf8' })
  if (dimensions.error) throw dimensions.error
  if (dimensions.status !== 0) throw new Error(dimensions.stderr)
  const [width, height] = dimensions.stdout.trim().split(' ').map(Number)
  const geometry = `${Math.round(width * .77)}x${Math.round(height * .53)}+${Math.round(width * .11)}+${Math.round(height * .18)}`
  const crop = spawnSync('magick', [input, '-crop', geometry, '+repage', '-quality', '95', output], { encoding: 'utf8' })
  if (crop.error) throw crop.error
  if (crop.status !== 0) throw new Error(crop.stderr)
  generated.push({ id: card.id, source: `images/small/${card.id}.jpg`, output: `images/cropped/${card.id}.jpg`, method: `ImageMagick crop ${geometry}, JPEG quality 95` })
}
writeFileSync(provenance, JSON.stringify(generated, null, 2) + '\n')
console.log(`${generated.length} illustrations extraites des cartes complètes ; ${missing.length} images toujours absentes.`)
if (missing.length) process.exitCode = 1
