import type { AiLevel } from '../../shared/protocol.ts'
import type { ChallengeId, FormatId, HandicapId } from '../../shared/formats.ts'
import type { BestOf, TournamentKind, TournamentMode } from '../../shared/tournament.ts'
import { t, tx } from '../i18n.ts'
import { api } from './api.ts'
import { navigate } from './navigation.ts'
import { redraw } from './render.ts'
import { saved } from './store.ts'

/** Le brouillon d'un tournoi en cours de création : il survit à un changement de page. */
export interface TournamentDraft {
  name: string
  kind: TournamentKind
  bestOf: BestOf
  size: number
  format: FormatId
  deck: string
  aiDeck: string
  aiLevel: AiLevel
  turnTime: number
  startLp: number
  startHand: number
  drawPerTurn: number
  challenge: ChallengeId
  handicap: HandicapId
  theme: string
}

export const newDraft = (mode: TournamentMode): TournamentDraft => ({
  name: '', kind: 'single', bestOf: 1, size: mode === 'solo' ? 4 : 8, format: 'casual', deck: '', aiDeck: '', aiLevel: 'normal',
  turnTime: mode === 'solo' ? 0 : 300, startLp: 8000, startHand: 5, drawPerTurn: 1, challenge: 'none', handicap: 'none', theme: '',
})

export const tournamentPage = {
  mode: (saved.get('tournament-mode') === 'solo' ? 'solo' : 'friends') as TournamentMode,
  open: saved.get('tournament-open'),
  /** La page de création est ouverte (le tournoi ouvert, s'il y en a un, passe après). */
  creating: false,
  draft: null as TournamentDraft | null,
}

export function selectTournament(id: string | null): void {
  tournamentPage.open = id
  tournamentPage.creating = false
  if (id) saved.set('tournament-open', id)
  else saved.remove('tournament-open')
  redraw()
}

export function openTournaments(mode: TournamentMode): void {
  if (tournamentPage.mode !== mode) tournamentPage.draft = null
  tournamentPage.mode = mode
  saved.set('tournament-mode', mode)
  selectTournament(null)
  navigate('tournaments')
}

/** Ouvre la page de création : le brouillon précédent est repris s'il existe. */
export function openCreateTournament(): void {
  tournamentPage.draft ??= newDraft(tournamentPage.mode)
  tournamentPage.creating = true
  redraw()
}

export function closeCreateTournament(): void {
  tournamentPage.creating = false
  redraw()
}

export type TournamentReply = { error?: string }

export async function callTournament<T extends TournamentReply = TournamentReply>(path: string, method: string, json?: unknown): Promise<{ error: string | null; body: T | null }> {
  try {
    const r = await api<T>(path, { method, ...(json !== undefined ? { json } : {}) })
    return { error: r.ok ? null : r.body?.error ? tx(r.body.error) : t('auth.failed'), body: r.body }
  } catch {
    return { error: t('auth.unreachable'), body: null }
  }
}
