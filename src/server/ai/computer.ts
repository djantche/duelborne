// Les trois niveaux analysent leurs coups avec le moteur, avec des budgets de recherche différents.
// Le bac à sable garde un adversaire passif ; bot.ts sert aussi de secours aux réponses refusées.
import type { AiLevel, Answer } from '../../shared/protocol.ts'
import type { Duel } from '../ocg/duel.ts'
import { Bot } from './bot.ts'
import { Planner } from './planner.ts'
import { playbookFor } from './playbooks/index.ts'

export class Computer {
  level: AiLevel
  private readonly passive: boolean
  /** Scripts de deck (playbooks/) : vrai par défaut ; faux pour comparer (tools/ai/arena.ts) ou pour un adversaire sans script. */
  private readonly scripts: boolean
  private brain: { place: number; level: AiLevel; bot: Bot; planner: Planner | null } | null = null

  constructor(level: AiLevel, { passive = false, scripts = true } = {}) {
    this.level = level
    this.passive = passive
    this.scripts = scripts
  }

  /** Nouveau duel : on repart de zéro (suivi du tour, cible retenue…). */
  reset(): void {
    this.brain = null
  }

  /**
   * Réponse à la question posée à cette place ; undefined : aucune réponse acceptable (l'ordinateur abandonne).
   * @param attempt nombre de réponses à cette question déjà refusées par le moteur
   */
  async choose(duel: Duel, place: number, attempt: number): Promise<Answer | undefined> {
    if (!this.brain || this.brain.place !== place || this.brain.level !== this.level) {
      const seat = place % 2 === 0 ? 0 : 1
      // Le Débutant analyse sans script de deck ; les deux autres niveaux peuvent ajouter ces connaissances.
      const playbook = this.passive || !this.scripts || this.level === 'easy' ? null : playbookFor(duel.deckOf(seat))
      this.brain = { place, level: this.level, bot: new Bot(seat, { passive: this.passive, playbook }), planner: this.passive ? null : new Planner(place, this.level, playbook) }
    }
    const { bot, planner } = this.brain
    return planner ? planner.choose(duel, attempt) : bot.choose(duel.currentView(place), attempt)
  }
}
