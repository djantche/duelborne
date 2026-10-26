// Les matériaux se déforment dans un vortex GLSL avant le déploiement du monstre de Fusion.
import type { GameEvent } from '../../../shared/protocol.ts'
import { cardDom } from '../../ui/Card.tsx'
import type { ClientCard } from '../../ui/cardview.ts'
import { EASE_OUT, flyTo, getPlaybackRate, node, play, reducedMotion, sleep } from './anim.ts'
import { FUSION_MOTION as M } from './fusionMotion.ts'
import { createFusionVortex } from './fusionVortex.ts'

type Summon = Extract<GameEvent, { type: 'summon' }>
const WIDTH = 206, HEIGHT = 300

export async function fusionSummon(event: Summon, target: HTMLElement, cards: Map<number, ClientCard>, isCurrent?: () => boolean): Promise<void> {
  const materials = event.fusionMaterials?.map((card) => cards.get(card.cardId)).filter((card): card is ClientCard => !!card) ?? []
  const result = cards.get(event.cardId)
  if (!result || materials.length === 0 || isCurrent?.() === false) return
  const reduced = reducedMotion()
  const arena = (document.querySelector('.arena') ?? document.getElementById('app')!).getBoundingClientRect()
  const root = node('fusion-stage', `left:${arena.left}px;top:${arena.top}px;width:${arena.width}px;height:${arena.height}px;`)
  root.setAttribute('aria-hidden', 'true')
  const vortex = document.createElement('div')
  vortex.className = 'fusion-vortex'
  root.append(vortex)
  const cx = arena.width * .5, cy = arena.height * .43
  const height = Math.min(220, arena.height * .34, arena.width / (materials.length > 3 ? 3.9 : 3.2))
  const toTransform = (x: number, y: number, h: number, angle = 0, turnY = 0): string => `translate(${x - WIDTH / 2}px,${y - HEIGHT / 2}px) rotate(${angle}deg) rotateY(${turnY}deg) scale(${h / HEIGHT})`
  const face = (data: ClientCard): HTMLElement => {
    const holder = document.createElement('div')
    holder.className = 'fusion-card'
    const picture = cardDom(data, { size: 'md' })
    picture.style.cssText = 'width:100%;height:100%;transform:none;'
    holder.append(picture)
    root.append(holder)
    return holder
  }
  const positions = materials.map((_, index) => {
    if (materials.length === 2) return { x: cx + (index ? 1 : -1) * height * .48, y: cy + height * .12 }
    const angle = -Math.PI / 2 + index / materials.length * Math.PI * 2
    return { x: cx + Math.cos(angle) * height * .7, y: cy + Math.sin(angle) * height * .62 }
  })
  const images = materials.map((card) => {
    const holder = face(card)
    if (!reduced) {
      const image = document.createElement('img')
      image.className = 'fusion-material-scan'
      image.alt = ''
      image.src = `/data/images/small/${card.id}.jpg`
      // Le même scan sert à l’entrée DOM et à la texture GPU : aucune permutation visuelle pendant l’aspiration.
      image.onerror = () => image.remove()
      holder.append(image)
    }
    return holder
  })
  const shaderReady = reduced ? Promise.resolve(null) : createFusionVortex(root, arena.width, arena.height, { x: cx, y: cy }, images.map((image, index) => ({
    image: image.querySelector<HTMLImageElement>('.fusion-material-scan')!, ...positions[index]!, height,
  })))
  images.forEach((image, index) => { const p = positions[index]!; image.style.transform = toTransform(p.x, p.y, height); image.style.opacity = '0' })
  const visible = target.style.visibility
  target.style.visibility = 'hidden'
  const current = (): boolean => root.isConnected && isCurrent?.() !== false
  let burstTimer: ReturnType<typeof setTimeout> | undefined
  /** Éclair de fusion : un disque de lumière qui s'ouvre au centre et s'éteint. */
  const burst = (): void => {
    const flash = document.createElement('div')
    flash.className = 'fusion-flash'
    flash.style.cssText = `left:${cx}px;top:${cy}px;`
    root.append(flash)
    void play(flash, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0 }], { duration: 520, easing: EASE_OUT }).then(() => flash.remove())
  }
  try {
    // Entrée : le voile tombe et chaque matériau surgit à sa place, l'un après l'autre.
    void play(root, [{ opacity: 0 }, { opacity: 1 }], { duration: reduced ? 100 : M.enter, fill: 'forwards' })
    await Promise.all(images.map((image, index) => {
      const p = positions[index]!
      return play(image, reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
        { transform: toTransform(p.x, p.y + 18, height * .82), opacity: 0, filter: 'brightness(1.8)' },
        { transform: toTransform(p.x, p.y, height), opacity: 1, filter: 'brightness(1)' },
      ], { duration: reduced ? 100 : M.enter, delay: reduced ? 0 : index * 50, easing: EASE_OUT, fill: 'forwards' })
    }))
    if (!current()) return
    await sleep(reduced ? 160 : M.read)
    if (!current()) return
    if (reduced) {
      await Promise.all(images.map((image) => play(image, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })))
    } else {
      const shader = await shaderReady
      if (!current()) return
      // Déformation des sommets dans le shader ; mouvements DOM conservés si WebGL ou un scan manque.
      if (shader) images.forEach((image) => { image.style.visibility = 'hidden' })
      const jobs = shader ? [shader.play(M.swirl, current)] : images.map((image, index) => {
        const origin = positions[index]!
        const frames: Keyframe[] = []
        for (let step = 0; step <= 14; step++) {
          const t = step / 14
          const progress = t * t * (3 - 2 * t) * .35 + t * t * .65
          const turn = progress * Math.PI * 2.2
          const radius = Math.pow(1 - progress, 1.25)
          const dx = origin.x - cx, dy = origin.y - cy
          const x = cx + (dx * Math.cos(turn) - dy * Math.sin(turn)) * radius
          const y = cy + (dx * Math.sin(turn) + dy * Math.cos(turn)) * radius
          frames.push({ transform: toTransform(x, y, height * (1 - progress * .82), progress * 400), opacity: t < .82 ? 1 : 1 - (t - .82) / .18, filter: `brightness(${1 + progress * 1.6})`, offset: t })
        }
        return play(image, frames, { duration: M.swirl, easing: 'linear', fill: 'forwards' })
      })
      jobs.push(play(vortex, [{ transform: 'rotate(0deg) scale(.85)', opacity: .55 }, { transform: 'rotate(380deg) scale(1)', opacity: .9, offset: .7 }, { transform: 'rotate(620deg) scale(.25)', opacity: .2 }], { duration: M.swirl, fill: 'forwards' }))
      // L'éclair part juste avant la fin de l'aspiration : pas de temps mort entre les matériaux et le résultat.
      burstTimer = setTimeout(() => { if (current()) burst() }, M.swirl * .86 / getPlaybackRate())
      await Promise.all(jobs)
    }
    images.forEach((image) => image.remove())
    if (!current()) return
    // Déploiement : le monstre de Fusion naît de l'éclair en pivotant face à nous.
    const summoned = face(result)
    const resultHeight = Math.min(290, arena.height * .5, arena.width * .42 / .686)
    summoned.style.transform = toTransform(cx, cy, resultHeight)
    await play(summoned, reduced ? [{ opacity: 0 }, { opacity: 1 }] : [
      { transform: toTransform(cx, cy, resultHeight * .2, -18, 80), opacity: 0, filter: 'brightness(2.6)' },
      { transform: toTransform(cx, cy, resultHeight * 1.04, 2, -6), opacity: 1, filter: 'brightness(1.3)', offset: .68 },
      { transform: toTransform(cx, cy, resultHeight), opacity: 1, filter: 'brightness(1)' },
    ], { duration: reduced ? 120 : M.unfold, easing: EASE_OUT, fill: 'forwards' })
    if (!current()) return
    vortex.style.opacity = '0'
    await sleep(reduced ? 250 : M.reveal)
    if (!current()) return
    const from = summoned.getBoundingClientRect()
    summoned.style.visibility = 'hidden'
    void play(root, [{ opacity: 1 }, { opacity: 0 }], { duration: M.fade, fill: 'forwards' })
    await flyTo(target, from, { motion: 'summon', fromFace: cardDom(result, { size: 'md' }), fromAngle: 0, duration: reduced ? 120 : M.land, trail: false, impact: false })
  } finally {
    clearTimeout(burstTimer)
    ;(await shaderReady)?.dispose()
    target.style.visibility = visible
    for (const animation of root.getAnimations({ subtree: true })) animation.cancel()
    root.remove()
  }
}
