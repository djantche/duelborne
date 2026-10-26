// Historique des duels : une ligne par duel terminé, rattachée aux comptes des joueurs.
import type { DuelResult } from './room.ts'
import type { Storage } from './store/types.ts'

/**
 * Enregistre un duel terminé. Le bac à sable et l'ordinateur contre l'ordinateur n'y figurent pas, ni un duel où personne n'a de compte
 * (rien à rattacher). La clé `record` contient les Decks : elle reste dans la base, elle n'est jamais envoyée à un client.
 */
export function recordDuel(store: Storage, r: DuelResult): boolean {
  if (r.mode === 'sandbox' || r.mode === 'aivai' || !r.players.some((p) => p.userId)) return false
  store.duels.insert({
    id: r.id,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    mode: r.mode,
    format: r.meta.format.id,
    challenge: r.meta.challenge,
    winner: String(r.winner),
    meta: r.meta,
    record: r.record,
    tournamentId: r.tournament?.id ?? null,
    matchId: r.tournament?.matchId ?? null,
    players: r.players.map((p) => ({ place: p.place, team: p.team, userId: p.userId, name: p.name, bot: p.bot, deckName: p.deckName, result: p.result })),
  })
  return true
}
