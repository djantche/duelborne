// Format portable : des instantanés publics et leurs événements, indépendant des versions du moteur de règles.
import { CHALLENGE_IDS, FORMAT_IDS, HANDICAP_IDS } from './formats.ts'
import type { DuelMeta } from './formats.ts'
import type { DuelPlayer, DuelView, GameEvent, LogEntry, MiniCard, RoomMode, Seat } from './protocol.ts'

/** Identité des decks au début du match, sans leur liste de cartes cachées. */
export interface ReplayDeck {
  seat: Seat
  name: string
  cover: number | null
}

export interface ReplayFrame {
  at: number
  view: Omit<DuelView, 'log'>
  logLength: number
  events: GameEvent[]
  /** Les deux mains au complet (identifiant de chaque carte, dans l'ordre de la main publique) : facultatif, absent des archives plus anciennes. */
  hands?: [(number | null)[], (number | null)[]]
}

export interface MatchReplay {
  /** Identifiant d'avant Duelborne, gardé : les archives déjà exportées restent lisibles et échangeables. */
  format: 'duel-lan-replay'
  version: 1
  id: string
  createdAt: number
  duration: number
  mode: RoomMode
  names: string[]
  /** Chaque duelliste à sa place, avec son avatar (absent des archives plus anciennes). */
  players?: DuelPlayer[]
  decks?: ReplayDeck[]
  /** Format, défi, réglages et tournoi de la partie (absent des archives faites avant son ajout). Jamais de liste de cartes cachées. */
  meta?: DuelMeta
  frames: ReplayFrame[]
  log: LogEntry[]
  cards: Record<number, MiniCard>
}

const str = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max

/** Les métadonnées d'une archive importée : des valeurs connues et de petites chaînes, rien d'autre. */
function validMeta(m: unknown): m is DuelMeta {
  if (!m || typeof m !== 'object') return false
  const o = m as DuelMeta
  const modes = ['ai', 'lan', 'team', 'sandbox', 'aivai']
  if (!modes.includes(o.mode) || !FORMAT_IDS.includes(o.format?.id) || !CHALLENGE_IDS.includes(o.challenge) || !HANDICAP_IDS.includes(o.handicap) || !str(o.theme, 30)) return false
  if (!['ready', 'unverified', 'missing'].includes(o.format.status) || !(o.format.region === null || o.format.region === 'TCG' || o.format.region === 'OCG') || !(o.format.version === null || str(o.format.version, 40))) return false
  const s = o.settings
  if (!s || ![s.turnTime, s.startLp, s.startHand, s.drawPerTurn].every((n) => Number.isFinite(n) && n >= 0 && n < 1e6) || !str(s.first, 10) || typeof s.shuffle !== 'boolean') return false
  if (o.first !== 0 && o.first !== 1) return false
  return o.tournament === undefined || (!!o.tournament && str(o.tournament.id, 40) && str(o.tournament.name, 60) && Number.isFinite(o.tournament.round))
}

/** Validation d'une archive avant son ajout à la bibliothèque. Les chaînes ne peuvent pas introduire de HTML. */
export function parseReplay(text: string): MatchReplay | null {
  try {
    if (text.length > 50_000_000) return null
    const r = JSON.parse(text, (_key, value: unknown) => typeof value === 'string' ? value.replaceAll('<', '‹').replaceAll('>', '›') : value) as MatchReplay
    if (!r || r.format !== 'duel-lan-replay' || r.version !== 1 || typeof r.id !== 'string' || !/^[\w-]{1,100}$/.test(r.id) || !Number.isFinite(r.createdAt) || r.createdAt < 0 || r.createdAt > 8.64e15 || !Number.isFinite(r.duration) || r.duration < 0) return null
    if (!Array.isArray(r.names) || r.names.length !== 2 || !r.names.every((n) => typeof n === 'string') || !Array.isArray(r.frames) || !r.frames.length || r.frames.length > 30_000 || !Array.isArray(r.log)) return null
    if (r.decks !== undefined && (!Array.isArray(r.decks) || r.decks.length > 4 || !r.decks.every((d) => d && (d.seat === 0 || d.seat === 1) && typeof d.name === 'string' && d.name.length <= 200 && (d.cover === null || Number.isSafeInteger(d.cover) && d.cover > 0)))) return null
    if (r.meta !== undefined && !validMeta(r.meta)) return null
    // Les joueurs ne servent qu'à l'affichage : une liste mal formée est ignorée plutôt que de refuser l'archive.
    if (r.players !== undefined && !(Array.isArray(r.players) && r.players.length <= 4 && r.players.every((p) => p && Number.isInteger(p.place) && p.place >= 0 && p.place < 4 && typeof p.name === 'string' && p.name.length <= 200 && (p.avatar === null || Number.isSafeInteger(p.avatar) && p.avatar > 0) && typeof p.bot === 'boolean'))) delete r.players
    const finite = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n)
    const card = (c: unknown): boolean => !!c && typeof c === 'object' && finite((c as { uid: number }).uid) && ((c as { cardId: number | null }).cardId === null || Number.isSafeInteger((c as { cardId: number }).cardId))
    if (!r.log.every((l) => l && finite(l.turn) && (l.seat === null || l.seat === 0 || l.seat === 1) && typeof l.text === 'string')) return null
    for (const f of r.frames) {
      const v = f?.view
      if (!v || !finite(f.at) || !Number.isInteger(f.logLength) || f.logLength < 0 || f.logLength > r.log.length || !Array.isArray(f.events) || !f.events.every((e) => e && typeof e.type === 'string')) return null
      if (!finite(v.turn) || !['draw','standby','main1','battle','main2','end'].includes(v.phase) || (v.you !== 0 && v.you !== 1) || (v.turnPlayer !== 0 && v.turnPlayer !== 1) || (v.winner !== null && v.winner !== 0 && v.winner !== 1 && v.winner !== 'draw') || !finite(v.startLp) || v.startLp <= 0 || !Array.isArray(v.chain) || !Array.isArray(v.players) || v.players.length !== 2) return null
      for (const p of v.players) {
        if (!p || !finite(p.lp) || !finite(p.deckCount) || ![p.hand, p.extra, p.graveyard, p.banished].every((list) => Array.isArray(list) && list.every(card))) return null
        if (!Array.isArray(p.monsters) || p.monsters.length > 7 || !p.monsters.every((m) => m === null || card(m.card) && ['atk','def'].includes(m.position) && typeof m.faceUp === 'boolean' && finite(m.materials) && (m.atk === null || finite(m.atk)) && (m.def === null || finite(m.def)))) return null
        if (!Array.isArray(p.spellTraps) || p.spellTraps.length > 6 || ![...p.spellTraps, p.fieldZone].every((s) => s === null || s && card(s.card) && typeof s.faceUp === 'boolean' && (s.scale === null || finite(s.scale)))) return null
        for (const z of [...p.monsters, ...p.spellTraps, p.fieldZone]) if (z?.counters && (!Array.isArray(z.counters) || !z.counters.every((c) => c && typeof c.name === 'string' && finite(c.count)))) return null
      }
      if (!v.chain.every((c) => c && Number.isSafeInteger(c.cardId) && (c.seat === 0 || c.seat === 1))) return null
      if (v.disabled && (!Array.isArray(v.disabled) || !v.disabled.every((s) => typeof s === 'string'))) return null
      // Les mains enregistrées doivent suivre exactement celles de la vue publique, sinon on les ignore.
      const h = f.hands
      if (h !== undefined && !(Array.isArray(h) && h.length === 2 && h.every((list, s) => Array.isArray(list) && list.length === v.players[s]?.hand.length && list.every((id) => id === null || Number.isSafeInteger(id))))) delete f.hands
      if (v.playing !== undefined && !(Array.isArray(v.playing) && v.playing.length === 2 && v.playing.every((place, team) => Number.isInteger(place) && place >= 0 && place < 4 && place % 2 === team))) delete v.playing
      v.prompt = null
      v.watching = true
      v.spectating = true
      v.waitingFor = null
    }
    if (!r.cards || typeof r.cards !== 'object' || !Object.entries(r.cards).every(([id, c]) => /^\d+$/.test(id) && c && typeof c.name === 'string' && finite(c.atk) && finite(c.def) && finite(c.level) && (c.desc === undefined || typeof c.desc === 'string'))) return null
    if (r.frames.at(-1)!.view.winner === null) return null
    return r
  } catch { return null }
}
