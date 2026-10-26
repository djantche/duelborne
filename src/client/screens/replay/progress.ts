/**
 * Horloge de la relecture, en millisecondes de la chronologie à vitesse ×1, comme celle d'un lecteur vidéo :
 * en lecture, elle avance à vitesse strictement constante, sans jamais attendre le terrain.
 * Les sauts demandés (action précédente, suivante, tour, début) glissent linéairement jusqu'à leur cible.
 */
type Motion =
  | { kind: 'still' }
  | { kind: 'run'; from: number; startedAt: number }
  | { kind: 'glide'; from: number; to: number; startedAt: number; duration: number }

/** Mouvement linéaire en cours, pour l'animation de la barre : de `from` à `to` en `duration` ms réelles. */
export interface ProgressPlan { from: number; to: number; duration: number }

export class ReplayProgress {
  private time = 0
  private motion: Motion = { kind: 'still' }
  private rate = 1
  private end = 0
  private listeners = new Set<() => void>()

  /** Durée totale : l'horloge s'arrête d'elle-même à la fin. */
  setEnd(end: number): void { this.end = end; this.set(Math.min(this.time, end)) }
  total(): number { return this.end }
  value(now = performance.now()): number {
    const m = this.motion
    if (m.kind === 'still') return this.time
    if (m.kind === 'run') return Math.min(this.end, m.from + Math.max(0, now - m.startedAt) * this.rate)
    return m.from + (m.to - m.from) * Math.min(1, Math.max(0, now - m.startedAt) / m.duration)
  }
  running(): boolean { return this.motion.kind === 'run' }
  /** Vrai tant que la position change d'elle-même. */
  moving(now = performance.now()): boolean {
    const m = this.motion
    return m.kind === 'run' ? this.value(now) < this.end : m.kind === 'glide' && now < m.startedAt + m.duration
  }
  /** Ce que la barre doit animer à partir de maintenant ; null si elle est immobile. */
  plan(now = performance.now()): ProgressPlan | null {
    const m = this.motion
    const from = this.value(now)
    if (m.kind === 'run' && from < this.end) return { from, to: this.end, duration: (this.end - from) / this.rate }
    if (m.kind === 'glide' && now < m.startedAt + m.duration) return { from, to: m.to, duration: m.startedAt + m.duration - now }
    return null
  }
  /** Prévenu à chaque changement de mouvement (lecture, pause, saut, vitesse). */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private changed(motion: Motion): void { this.motion = motion; for (const listener of this.listeners) listener() }

  /** Position posée directement (curseur tenu sous le doigt ou la souris). */
  set(time: number): void { this.time = Math.max(0, Math.min(this.end, time)); this.changed({ kind: 'still' }) }
  /** Glisse jusqu'à `time` en 250 à 600 ms selon la distance, à vitesse constante. */
  glide(time: number): void {
    const from = this.value()
    this.time = Math.max(0, Math.min(this.end, time))
    const share = this.end > 0 ? Math.abs(this.time - from) / this.end : 0
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    this.changed(from === this.time || reduced ? { kind: 'still' } : { kind: 'glide', from, to: this.time, startedAt: performance.now(), duration: 250 + Math.min(1, share * 4) * 350 })
  }
  play(): void { this.changed({ kind: 'run', from: this.value(), startedAt: performance.now() }) }
  pause(): void { this.time = this.value(); this.changed({ kind: 'still' }) }
  speed(rate: number): void {
    const from = this.value()
    this.rate = rate
    if (this.motion.kind === 'run') this.changed({ kind: 'run', from, startedAt: performance.now() })
  }
}
