// Règles d'une partie : format, défi, avantage de points de vie, thème. Partagé par le salon, les tournois et l'éditeur de deck.
import type { JSX } from 'preact'
import { CHALLENGE_IDS, CHALLENGE_RULES, HANDICAP_IDS } from '../../shared/formats.ts'
import type { ChallengeId, FormatId, FormatInfo, HandicapId } from '../../shared/formats.ts'
import { store } from '../app/store.ts'
import { cx } from './cx.ts'
import { Select } from './Select.tsx'
import { seriesLabel } from './DeckPicker.tsx'
import { t } from '../i18n.ts'

export const formatInfo = (id: FormatId): FormatInfo | undefined => store.formats.find((f) => f.id === id)

/** Nom court d'un format (« TCG », « Duel libre »). */
export const formatName = (id: FormatId): string => t(`format.${id}`)

/** Texte d'une limite connue d'un format (certaines donnent la version de la liste). */
const noteText = (info: FormatInfo, key: string): string => t(key, { version: info.version ?? '—' })

/** Étiquette de statut de la liste d'un format : prête, ou non vérifiée. Rien à dire pour le duel libre. */
export function FormatBadge({ id, plain }: { id: FormatId; plain?: boolean }): JSX.Element | null {
  const info = formatInfo(id)
  if (!info || (info.status === 'ready' && info.kind === 'none' && plain)) return null
  return (
    <span class={cx('fmt-badge', info.status)} title={info.notes.map((n) => noteText(info, n)).join('\n') || undefined}>
      {formatName(id)}
      {info.status === 'unverified' && <i>{info.synced && info.version ? t('format.syncedShort', { version: info.version }) : t('format.unverifiedShort')}</i>}
    </span>
  )
}

/** Ce que le format n'applique pas ou n'a pas vérifié, et d'où vient sa liste. */
export function FormatNotes({ id }: { id: FormatId }): JSX.Element | null {
  const info = formatInfo(id)
  if (!info || (!info.notes.length && !info.source)) return null
  return (
    <ul class="fmt-notes">
      {info.notes.map((n) => (
        <li key={n}>{noteText(info, n)}</li>
      ))}
      {info.source && <li class="src">{t('format.source', { source: info.source })}</li>}
    </ul>
  )
}

export function FormatSelect({ value, onChange, id }: { value: FormatId; onChange: (id: FormatId) => void; id?: string }): JSX.Element {
  // Un format sans liste ne se choisit pas : il n'apparaît que s'il est déjà celui de la salle.
  const choices = store.formats.filter((f) => f.status !== 'missing' || f.id === value).map((f) => ({ value: f.id, label: formatName(f.id), hint: f.status === 'unverified' ? (f.synced && f.version ? t('format.syncedShort', { version: f.version }) : t('format.unverifiedShort')) : undefined }))
  return <Select id={id} value={value} onChange={(v) => onChange(v as FormatId)} choices={choices.length ? choices : [{ value: 'casual', label: formatName('casual') }]} />
}

/** Texte d'un défi avec ses seuils. */
export const challengeText = (c: ChallengeId): string => t(`challenge.${c}.text`, { gy: CHALLENGE_RULES.graveyard, wall: CHALLENGE_RULES.monsterWall, ban: CHALLENGE_RULES.banished, turns: CHALLENGE_RULES.sprintTurns })

export function ChallengeSelect({ value, onChange }: { value: ChallengeId; onChange: (c: ChallengeId) => void }): JSX.Element {
  return <Select value={value} onChange={(v) => onChange(v as ChallengeId)} choices={CHALLENGE_IDS.map((c) => ({ value: c, label: t(`challenge.${c}`) }))} />
}

export function HandicapSelect({ value, onChange, team }: { value: HandicapId; onChange: (h: HandicapId) => void; team: boolean }): JSX.Element {
  const label = (h: HandicapId): string => {
    if (h === 'none') return t('handicap.none')
    const [side, bonus] = h.split(':') as [string, string]
    return t('handicap.bonus', { who: t(side === '0' ? (team ? 'lobby.team1' : 'lobby.player1') : team ? 'lobby.team2' : 'lobby.player2'), lp: bonus })
  }
  return <Select value={value} onChange={(v) => onChange(v as HandicapId)} choices={HANDICAP_IDS.map((h) => ({ value: h, label: label(h) }))} />
}

/** Séries de decks du jeu qui peuvent servir de thème. */
export const themes = (): string[] => [...new Set(store.decks.filter((d) => !d.id.startsWith('user-')).map((d) => d.series))]

export function ThemeSelect({ value, onChange }: { value: string; onChange: (theme: string) => void }): JSX.Element {
  return <Select value={value} onChange={onChange} choices={[{ value: '', label: t('theme.any') }, ...themes().map((s) => ({ value: s, label: seriesLabel(s) }))]} />
}

/** Résumé des règles particulières d'une salle, en étiquettes (rien pour une partie ordinaire). */
export function RuleTags({ format, challenge, theme, handicap, tournament }: { format: FormatId; challenge: ChallengeId; theme: string; handicap?: HandicapId; tournament?: string }): JSX.Element | null {
  const tags = [
    tournament ? <span class="rule-tag tour" key="t">{tournament}</span> : null,
    format !== 'casual' ? <FormatBadge id={format} key="f" /> : null,
    challenge !== 'none' ? <span class="rule-tag" key="c" title={challengeText(challenge)}>{t(`challenge.${challenge}`)}</span> : null,
    theme ? <span class="rule-tag" key="th">{seriesLabel(theme)}</span> : null,
    handicap && handicap !== 'none' ? <span class="rule-tag" key="h">{t('handicap.tag')}</span> : null,
  ].filter(Boolean)
  return tags.length ? <span class="rule-tags">{tags}</span> : null
}
