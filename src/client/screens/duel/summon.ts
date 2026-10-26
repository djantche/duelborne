import type { GameEvent, MonsterView } from '../../../shared/protocol.ts'
import { t } from '../../i18n.ts'
import { stopSummonChants, summonChant } from '../../ui/audio.ts'
import { esc, isLink, nameOf, stat } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { EASE_OUT, node, play, reducedMotion, sleep } from './anim.ts'
import { loadSummonAssets, summonIllustrated } from './summonAssets.ts'
import { SUMMON_MOTION as M } from './summonMotion.ts'

let cancelScene: (() => void) | null = null
export const resetSummonPresentation = (): void => { cancelScene?.(); cancelScene = null; stopSummonChants() }

/** Ne crée aucune scène avant que l’image soit prête ; les données tardives ne réactivent jamais un duel quitté. */
async function picture(url: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  const image = new Image()
  image.alt = ''
  return new Promise((resolve) => {
    const finish = (ok: boolean): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      image.onload = image.onerror = null
      if (!ok) image.removeAttribute('src')
      resolve(ok ? image : null)
    }
    const abort = (): void => finish(false)
    const timer = setTimeout(abort, 1800)
    image.onload = () => finish(true)
    image.onerror = abort
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else image.src = url
  })
}

export async function summonPresentation(event: Extract<GameEvent, { type: 'summon' }>, card: ClientCard, monster?: MonsterView, isCurrent?: () => boolean): Promise<void> {
  if (document.hidden || isCurrent?.() === false) return
  const asset = (await loadSummonAssets())[card.id]
  if (isCurrent?.() === false || document.hidden) return
  if (!asset?.image || !summonIllustrated(card)) {
    if (asset?.chant) summonChant(asset.chant, isCurrent)
    return
  }
  resetSummonPresentation()
  const controller = new AbortController()
  let root: HTMLElement | null = null
  let stopSound = (): void => {}
  const cleanup = (): void => {
    controller.abort()
    stopSound()
    root?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
    root?.remove()
  }
  cancelScene = cleanup
  const visibility = (): void => { if (document.hidden) cleanup() }
  document.addEventListener('visibilitychange', visibility)
  try {
    const image = await picture(asset.image, controller.signal)
    if (!image || controller.signal.aborted || isCurrent?.() === false || document.hidden) return
    const reduced = reducedMotion()
    const name = nameOf(card)
    const level = Math.max(0, Math.min(13, card.level ?? 0))
    const xyz = card.frameType.startsWith('xyz')
    const badge = isLink(card) ? t('fx.summonLink', { n: card.linkval ?? 0 }) : t(xyz ? 'fx.summonRank' : 'fx.summonLevel', { n: card.level ?? 0 })
    const stats = isLink(card)
      ? t('fx.summonLinkStats', { atk: stat(monster?.atk ?? card.atk), n: card.linkval ?? 0 })
      : t('fx.summonStats', { atk: stat(monster?.atk ?? card.atk), def: stat(monster?.def ?? card.def) })
    root = node(`summon-stage${reduced ? ' reduced' : ''}`, '', `<div class="summon-rays" aria-hidden="true"></div><div class="summon-halo" aria-hidden="true"></div><div class="summon-figure"></div><div class="summon-caption"><small>${esc(t(`fx.summon.${event.mode}`))}</small><div class="summon-level${xyz ? ' rank' : ''}" aria-label="${esc(badge)}">${isLink(card) ? `<span>${esc(badge)}</span>` : `<span aria-hidden="true">${Array.from({ length: level }, () => '<i>★</i>').join('')}</span>`}</div><h2>${esc(name)}</h2><p>${esc(stats)}</p></div>`)
    // Recouvre momentanément les fenêtres de consultation, sans les fermer ni modifier leur lecture.
    document.body.append(root)
    document.dispatchEvent(new Event('duel-summon-presentation'))
    root.setAttribute('role', 'status')
    root.setAttribute('aria-label', t('fx.summonAnnounce', { name }))
    root.querySelector('.summon-figure')!.append(image)
    const figure = root.querySelector<HTMLElement>('.summon-figure')!
    stopSound = asset.chant ? summonChant(asset.chant, isCurrent) : () => {}
    await Promise.all([
      play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 100 : M.enter, fill: 'forwards' }),
      play(figure, reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
        { transform: 'translateY(5%) scale(.78)', opacity: 0, filter: 'brightness(1.8)' },
        { transform: 'translateY(0) scale(1.025)', opacity: 1, filter: 'brightness(1.12)', offset: .7 },
        { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
      ], { duration: reduced ? 100 : M.enter, easing: EASE_OUT, fill: 'forwards' }),
    ])
    if (controller.signal.aborted || isCurrent?.() === false) return
    await sleep(reduced ? 650 : M.read)
    if (controller.signal.aborted || isCurrent?.() === false) return
    await play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 100 : M.leave, fill: 'forwards' })
  } finally {
    document.removeEventListener('visibilitychange', visibility)
    cleanup()
    if (cancelScene === cleanup) cancelScene = null
  }
}
