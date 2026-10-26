// Annulation : éclaircissement bref, puis désaturation, sans nouvelle entrée de la carte.
import { cardDom } from '../../ui/Card.tsx'
import type { ClientCard } from '../../ui/cardview.ts'
import { centerOf, ghostOf, play, reducedMotion, sleep } from './anim.ts'

async function loseColor(face: HTMLElement): Promise<void> {
  face.style.filter = 'grayscale(1) brightness(.62)'
  await play(face, reducedMotion() ? [{ filter: 'grayscale(1) brightness(.62)' }] : [
    { filter: 'grayscale(0) brightness(1)' },
    { filter: 'grayscale(.35) brightness(2.8)', offset: .28 },
    { filter: 'grayscale(1) brightness(.62)' },
  ], { duration: reducedMotion() ? 100 : 320, easing: 'ease-out' })
}

/** Une carte déjà reposée reçoit le même signal à sa place, sans copie ni déplacement. */
export async function negateOnBoard(source: HTMLElement | null, isCurrent?: () => boolean): Promise<void> {
  if (!source?.isConnected || source.classList.contains('back') || isCurrent?.() === false) return
  const before = source.style.filter
  source.classList.add('effect-negated')
  try {
    await loseColor(source)
    if (isCurrent?.() === false) return
    await sleep(600)
  } finally {
    source.style.filter = before
    source.classList.remove('effect-negated')
  }
}

export async function negateCard(data: ClientCard | null, source: HTMLElement | null, stage: DOMRect, isCurrent?: () => boolean, presentation?: HTMLElement): Promise<void> {
  if (isCurrent?.() === false) return
  if (!presentation && source?.isConnected) return negateOnBoard(source, isCurrent)
  const mid = centerOf(stage)
  const height = Math.min(stage.height * .32, 230)
  const width = height * .686
  const g = presentation ?? ghostOf(cardDom(data, { size: 'md' }), new DOMRect(mid.x - width / 2, mid.y - height / 2, width, height))
  g.classList.add('negation', 'negated')
  const face = g.querySelector<HTMLElement>(':scope > .card')
  try {
    if (face) await loseColor(face)
    if (isCurrent?.() === false) return
    await sleep(600)
    if (!presentation && isCurrent?.() !== false) await play(g, [{ opacity: 1 }, { opacity: 0 }], { duration: 180 })
  } finally {
    if (!presentation) {
      for (const animation of g.getAnimations({ subtree: true })) animation.cancel()
      g.remove()
    }
  }
}
