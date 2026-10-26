// Explorer les choix qui composent un effet avec le vrai moteur : coûts, cibles, matériaux,
// options et déclenchements. Une position dont notre effet n'est pas résolu ne vaut pas un résultat acquis.
import type { Answer, DuelView } from '../../shared/protocol.ts'
import type { Duel } from '../ocg/duel.ts'
import { branchKnowledge, knownView, rememberSimulation, type Knowledge } from './knowledge.ts'

export interface Move {
  answer: Answer
  target?: number | null
  prior: number
  bonus?: number
  tempo?: number
}

export interface Simulation {
  duel: Duel
  knowledge: Knowledge
  drew: boolean
  score: number
  /** Tempo des réponses secondaires, le coup initial étant évalué par son appelant. */
  tempo: number
}

interface Node {
  duel: Duel
  knowledge: Knowledge
  drew: boolean
  tempo: number
  steps: number
  target?: number | null
}

interface Options {
  place: number
  width: number
  nodes: number
  deadline: number
  choices(view: DuelView): Move[]
  judge(view: DuelView, knowledge: Knowledge): number
}

const yieldLoop = (): Promise<void> => new Promise((r) => setImmediate(r))

/** Donne une réponse, en mémorisant seulement la fin de notre tour et les identités à masquer. */
function answer(node: Node, value: Answer, place: number): boolean {
  const w = node.duel.waiting
  if (!w) return false
  const seat = node.knowledge.seat
  const before = new Set(node.duel.currentView(place).players[seat].hand.map((c) => c.uid))
  const steps = node.duel.answer(w.seat, w.prompt.id, value)
  if (typeof steps === 'string') return false
  node.steps++
  for (const step of steps) {
    const view = step.views[place]
    if (view) rememberSimulation(view, node.knowledge)
    if (view && view.turn === node.knowledge.rootTurn) node.knowledge.endPosition = view
    if ((step.events[place] ?? []).some((e) => e.type === 'draw' && e.player === seat)) node.drew = true
    // Les vues intermédiaires permettent aussi de masquer une carte piochée puis déplacée par le même effet.
    if (node.drew && view) for (const card of view.players[seat].hand) if (!before.has(card.uid)) node.knowledge.drawn?.add(card.uid)
  }
  return true
}

/**
 * Renvoie une copie appartenant à l'appelant, qui doit la détruire. Toutes les autres copies sont libérées ici.
 * L'adversaire refuse ses réponses facultatives ; aucune sélection dans ses ressources cachées n'est jouée.
 */
export async function simulate(duel: Duel, move: Move, k: Knowledge, options: Options): Promise<Simulation | null> {
  let remaining = options.nodes
  const seat = k.seat
  const result = (node: Node): Simulation => ({ ...node, score: options.judge(node.duel.currentView(options.place), node.knowledge) + node.tempo })

  const walk = async (node: Node): Promise<Simulation | null> => {
    let retained = false
    try {
      while (!node.duel.finished && !node.drew && node.steps < 120) {
        const w = node.duel.waiting
        if (!w || w.prompt.kind === 'idle' || w.prompt.kind === 'battle') break
        const p = w.prompt
        if (w.seat % 2 !== seat) {
          if (p.kind === 'chain' && !p.forced) {
            if (!answer(node, null, options.place)) return null
          } else if (p.kind === 'chain' && p.forced && p.options.length === 1
            && p.options[0]!.uid !== null && !node.knowledge.hidden.has(p.options[0]!.uid!)) {
            if (!answer(node, p.options[0]!.id, options.place)) return null
          } else if (p.kind === 'yesno') {
            if (!answer(node, 0, options.place)) return null
          } else break
          continue
        }
        // Les décisions d'attaque appartiennent au coup initial, et ne sont pas réinterprétées par un script.
        if (p.kind === 'yesno' && p.direct && node.target !== undefined) {
          if (!answer(node, node.target === null ? 1 : 0, options.place)) return null
          continue
        }
        if (p.kind === 'cards' && p.attackerUid !== undefined && node.target !== undefined) {
          const index = p.cards.findIndex((c) => c.uid === node.target)
          node.target = undefined
          if (index < 0 || !answer(node, [index], options.place)) return null
          continue
        }
        const view = knownView(node.duel.currentView(options.place), node.knowledge)
        const choices = options.choices(view).sort((a, b) => b.prior - a.prior)
        if (!choices.length) return null
        if (choices.length === 1 || remaining <= 0 || performance.now() >= options.deadline) {
          // Le budget n'autorise plus de copies, mais on termine la résolution avant de juger ses gains.
          const chosen = choices.find((choice) => answer(node, choice.answer, options.place))
          if (!chosen) return null
          node.tempo += chosen.tempo ?? 0
          continue
        }
        let best: Simulation | null = null
        try {
          for (const choice of choices.slice(0, options.width)) {
            if (remaining <= 0 || performance.now() >= options.deadline) break
            remaining--
            await yieldLoop()
            const child: Node = { ...node, duel: node.duel.fork(), knowledge: branchKnowledge(node.knowledge), tempo: node.tempo + (choice.tempo ?? 0) }
            let accepted: boolean
            try {
              accepted = answer(child, choice.answer, options.place)
            } catch {
              child.duel.destroy()
              continue
            }
            if (!accepted) { child.duel.destroy(); continue }
            const candidate = await walk(child)
            if (!candidate) continue
            if (!best || candidate.score > best.score) {
              best?.duel.destroy()
              best = candidate
            } else candidate.duel.destroy()
          }
          if (!best) {
            const fallback = choices.find((choice) => answer(node, choice.answer, options.place))
            if (!fallback) return null
            node.tempo += fallback.tempo ?? 0
            continue
          }
          const picked = best
          best = null
          return picked
        } finally {
          best?.duel.destroy()
        }
      }
      // Atteindre le garde-fou sur une de nos questions n'est pas une résolution réussie.
      if (node.steps >= 120 && !node.duel.finished && !node.drew) return null
      const complete = result(node)
      retained = true
      return complete
    } finally {
      if (!retained) node.duel.destroy()
    }
  }

  const root: Node = { duel: duel.fork(), knowledge: branchKnowledge(k), drew: false, tempo: 0, steps: 0, target: move.target }
  try {
    if (!answer(root, move.answer, options.place)) {
      root.duel.destroy()
      return null
    }
  } catch (error) {
    root.duel.destroy()
    throw error
  }
  return walk(root)
}
