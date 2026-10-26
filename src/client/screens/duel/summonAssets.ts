import type { SummonAssets } from '../../../shared/summon.ts'
import { store } from '../../app/store.ts'
import { isLink } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'

let assets: SummonAssets = {}
let pending: Promise<SummonAssets> | null = null
let expires = 0

/** Ressources facultatives : une absence ne retarde ni n’empêche un duel. */
export function loadSummonAssets(): Promise<SummonAssets> {
  if (pending) return pending
  if (Date.now() < expires) return Promise.resolve(assets)
  pending = (async () => {
    try {
      const response = await fetch('/api/summon-assets', { signal: AbortSignal.timeout(1800) })
      if (response.ok) {
        const body: unknown = await response.json()
        if (body && typeof body === 'object' && !Array.isArray(body)) assets = body as SummonAssets
      }
    } catch { /* L’animation ordinaire reste disponible. */ }
    expires = Date.now() + 30_000
    pending = null
    return assets
  })()
  return pending
}

/** Seuls les grands monstres ont droit à leur illustration : Niveau ou Rang 5 et plus, Lien 3 et plus. */
export const summonIllustrated = (card: ClientCard): boolean => isLink(card) ? (card.linkval ?? 0) >= 3 : (card.level ?? 0) >= 5

export const hasSummonArtwork = (id: number): boolean => {
  const card = store.cards.get(id)
  return !!assets[id]?.image && !!card && summonIllustrated(card)
}
