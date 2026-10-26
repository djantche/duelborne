// Enregistrement depuis la vue publique, dès le début du match, même si un joueur se reconnecte plus tard.
import { randomUUID } from 'node:crypto'
import type { DuelMeta } from '../shared/formats.ts'
import type { MatchReplay, ReplayDeck } from '../shared/replay.ts'
import type { DuelPlayer, RoomMode } from '../shared/protocol.ts'
import type { Step } from './ocg/duel.ts'

export class ReplayRecorder {
  readonly replay: MatchReplay
  private last = ''
  constructor(mode: RoomMode, names: string[], decks?: ReplayDeck[], meta?: DuelMeta, players?: DuelPlayer[]) {
    this.replay = { format: 'duel-lan-replay', version: 1, id: randomUUID(), createdAt: Date.now(), duration: 0, mode, names, ...(players ? { players } : {}), decks, ...(meta ? { meta } : {}), frames: [], log: [], cards: {} }
  }
  record(step: Step): void {
    const { log, ...view } = step.watch.view
    const offset = step.watch.view.logOffset ?? Math.max(0, this.replay.log.length - log.length)
    this.replay.log.splice(offset, this.replay.log.length - offset, ...log)
    Object.assign(this.replay.cards, view.unknownCards)
    // Les deux mains au complet, lues dans la vue de chaque équipe (la vue publique ne les contient pas).
    const hands = [0, 1].map((team) => {
      const own = step.views.find((v, place) => v && place % 2 === team)
      if (own) Object.assign(this.replay.cards, own.unknownCards)
      return own?.players[team]?.hand.map((c) => c.cardId) ?? null
    })
    const snapshot = { ...view, unknownCards: {}, prompt: null, watching: true, spectating: true, waitingFor: null }
    const full = hands[0] && hands[1] ? ([hands[0], hands[1]] as [(number | null)[], (number | null)[]]) : null
    const key = JSON.stringify([snapshot, full])
    if (!step.watch.events.length && key === this.last) return
    this.last = key
    this.replay.frames.push({ at: Date.now() - this.replay.createdAt, view: snapshot, events: structuredClone(step.watch.events), logLength: offset + log.length, ...(full ? { hands: full } : {}) })
    this.replay.duration = Date.now() - this.replay.createdAt
  }
}
