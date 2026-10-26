// Chargement des cartes avec barre d'avancement.
//
// La barre affiche le vrai téléchargement. Mais si tout arrive trop vite pour qu'on la voie (cache, réseau local), elle serait
// pleine avant d'avoir été regardée : dans ce cas seulement, l'avancement affiché est ralenti par un plafond qui monte avec le temps.
// Un chargement lent n'est pas touché (le plafond est déjà dépassé). Avec la préférence de réduction des mouvements, il n'y a ni
// plafond ni attente.
import { redraw } from './render.ts'
import { loadCards, store } from './store.ts'

/** Durée minimale pendant laquelle la barre se remplit quand le chargement réel est plus court. */
const MIN_VISIBLE_MS = 800

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Le plafond démarre vite puis s'attarde, comme un vrai chargement. */
const easeOut = (x: number): number => 1 - (1 - x) ** 3

export async function loadCardsWithProgress(): Promise<void> {
  const began = performance.now()
  const smooth = !reducedMotion()
  /** Avancement réel du téléchargement (null : taille inconnue). */
  let real: number | null = 0
  let finished = false
  /** Plafond de l'affichage : atteint 1 au bout de MIN_VISIBLE_MS (le temps écoulé compte, pas le nombre d'images). */
  const ceiling = (): number => (smooth ? easeOut(Math.min(1, (performance.now() - began) / MIN_VISIBLE_MS)) : 1)
  let frame = 0
  const paint = (): void => {
    const shown = real === null ? null : Math.min(real, ceiling())
    if (shown !== store.loading.progress) {
      store.loading.progress = shown
      redraw()
    }
  }
  const loop = (): void => {
    paint()
    if (!finished || ceiling() < 1) frame = requestAnimationFrame(loop)
  }
  store.loading = { progress: 0, phase: 'cards' }
  loop()
  try {
    await loadCards((done, total) => {
      // Taille inconnue : barre indéterminée jusqu'à la fin.
      real = total ? Math.min(0.99, done / total) : null
    })
  } catch (e) {
    cancelAnimationFrame(frame)
    throw e
  }
  real = 1
  finished = true
  // Chargement trop rapide : on laisse la barre finir de se remplir. Le minuteur suffit si l'onglet est caché (pas d'images dessinées).
  const remaining = smooth ? MIN_VISIBLE_MS - (performance.now() - began) : 0
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  cancelAnimationFrame(frame)
  store.loading.progress = 1
  redraw()
}
