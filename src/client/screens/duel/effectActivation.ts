// Soulèvement bref de la carte physique à son emplacement ; l’aperçu de l’effet reste indépendant.
import { ghostOf, play, reducedMotion } from './anim.ts'

const MOTION = { dim: 120, lift: 1_240, clear: 140 } as const
export const ACTIVATION_LIFT_DURATION = MOTION.dim + MOTION.lift + MOTION.clear

export async function liftActivatedCard(uid: number | null, isCurrent?: () => boolean): Promise<void> {
  if (uid === null || isCurrent?.() === false) return
  const source = document.querySelector<HTMLElement>(`#app .card[data-uid="${uid}"]`)
  if (!source || getComputedStyle(source).visibility === 'hidden') return
  const rect = source.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const visibility = source.style.visibility
  const lift = Math.min(48, Math.max(12, rect.height * .2))
  const stage = document.createElement('div')
  stage.className = 'activation-stage'
  stage.setAttribute('aria-hidden', 'true')
  document.body.append(stage)
  const raised = ghostOf(source, rect)
  raised.classList.add('activation-lift')
  stage.append(raised)
  source.style.visibility = 'hidden'
  try {
    // Laisse d'abord le voile couvrir le duel : l'aperçu et la résolution attendent le retour de la carte.
    await play(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion() ? 80 : MOTION.dim, fill: 'forwards' })
    await play(raised, [
      { transform: 'translateY(0) scale(1)', filter: 'brightness(1) drop-shadow(0 0 8px rgba(255, 211, 125, .52))', offset: 0 },
      { transform: `translateY(${-lift}px) scale(1.1)`, filter: 'brightness(1.16) drop-shadow(0 0 17px rgba(255, 188, 82, .74))', offset: .38 },
      { transform: `translateY(${-lift}px) scale(1.1)`, filter: 'brightness(1.16) drop-shadow(0 0 17px rgba(255, 188, 82, .74))', offset: .65 },
      { transform: 'translateY(0) scale(1)', filter: 'brightness(1) drop-shadow(0 0 8px rgba(255, 211, 125, .52))', offset: 1 },
    ], { duration: reducedMotion() ? 120 : MOTION.lift, easing: 'cubic-bezier(.2,.75,.3,1)' })
    await play(stage, [{ opacity: 1 }, { opacity: 0 }], { duration: reducedMotion() ? 80 : MOTION.clear })
  } finally {
    for (const animation of stage.getAnimations({ subtree: true })) animation.cancel()
    stage.remove()
    if (source.isConnected) source.style.visibility = visibility
  }
}
