// Cérémonie de fin de tournoi : coupe, classement personnel et animation rejouable.
import type { JSX } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useId, useState } from 'preact/hooks'
import type { TournamentView } from '../../../shared/tournament.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { t, tx } from '../../i18n.ts'
import { finalPlacement } from './results.ts'

type Tier = 'gold' | 'silver' | 'bronze' | 'participant'
/** Une cérémonie automatique par tournoi et par participant pendant la session ; la page permet de la rejouer. */
const celebrated = new Set<string>()

function Trophy({ tier }: { tier: Tier }): JSX.Element {
  const id = useId()
  const metal = `${id}-metal`
  const stem = `${id}-stem`
  const bowl = tier === 'gold' ? 'M67 57h126l-10 64c-5 31-25 47-53 47s-48-16-53-47Z'
    : tier === 'silver' ? 'M73 59h114l-8 52-19 35-30 21-30-21-19-35Z'
      : tier === 'bronze' ? 'M75 67h110l-8 48c-4 27-23 46-47 46s-43-19-47-46Z'
        : 'M91 59h78l-5 70-34 36-34-36Z'
  return (
    <svg class="tn-trophy" viewBox="0 0 260 280" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="60" y1="72" x2="191" y2="130" gradientUnits="userSpaceOnUse">
          <stop stop-color="var(--cup-dark)" /><stop offset=".24" stop-color="var(--cup-mid)" />
          <stop offset=".44" stop-color="var(--cup-light)" /><stop offset=".64" stop-color="var(--cup-mid)" /><stop offset="1" stop-color="var(--cup-dark)" />
        </linearGradient>
        <linearGradient id={stem} x1="100" y1="170" x2="158" y2="240" gradientUnits="userSpaceOnUse">
          <stop stop-color="var(--cup-light)" /><stop offset=".45" stop-color="var(--cup-mid)" /><stop offset="1" stop-color="var(--cup-dark)" />
        </linearGradient>
      </defs>
      <ellipse cx="130" cy="260" rx="85" ry="9" fill="var(--cup-mid)" opacity=".16" />
      {tier !== 'participant' && <g stroke={`url(#${metal})`} stroke-width="12" stroke-linejoin="round">
        <path d="M74 70H43v29c0 32 18 45 49 46M186 70h31v29c0 32-18 45-49 46" />
      </g>}
      {tier === 'gold' && <path d="m91 40-7-23 29 12 17-24 17 24 29-12-7 23Z" fill={`url(#${metal})`} stroke="var(--cup-light)" />}
      <path d="M120 157h20v35c0 13 7 19 22 25H98c15-6 22-12 22-25Z" fill={`url(#${stem})`} />
      <path d={bowl} fill={`url(#${metal})`} stroke="var(--cup-light)" stroke-width="2" />
      <path d="m92 69 7 48c3 18 10 28 19 32" stroke="white" stroke-opacity=".32" stroke-width="5" stroke-linecap="round" />
      {tier === 'gold' ? <path d="m130 84 7 15 17 2-12 12 3 18-15-8-15 8 3-18-12-12 17-2Z" fill="var(--cup-dark)" stroke="var(--cup-light)" />
        : tier === 'silver' ? <path d="m130 87 17 23-17 23-17-23Z" fill="var(--cup-dark)" stroke="var(--cup-light)" />
          : <circle cx="130" cy="111" r="16" fill="var(--cup-dark)" stroke="var(--cup-light)" />}
      <path d="M96 213h68l9 13H87Z" fill={`url(#${metal})`} />
      <rect x="78" y="226" width="104" height="29" rx="5" fill="#131b31" stroke="var(--cup-mid)" stroke-width="2" />
      <rect x="110" y="233" width="40" height="13" rx="2" fill={`url(#${metal})`} />
      <path d="M64 255h132" stroke="var(--cup-light)" stroke-width="3" stroke-linecap="round" />
    </svg>
  )
}

export function TournamentFinish({ view, active }: { view: TournamentView; active: boolean }): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const person = view.playerList.find((p) => p.userId === (view.me?.userId ?? view.champion?.userId))
  const placement = person ? finalPlacement(view, person.userId) : null
  const key = `${view.id}:${view.me?.userId ?? 'observer'}`
  useEffect(() => {
    if (!active) { setOpen(false); return }
    if (!placement || celebrated.has(key)) return
    celebrated.add(key)
    setOpen(true)
  }, [active, key, placement?.rank])
  if (!person || !placement) return null
  const { rank, tied } = placement
  const tier: Tier = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'participant'
  const title = t(view.me ? `tournament.finish.${tier}` : 'tournament.finish.complete')
  const position = t(tied ? 'tournament.finish.placeTied' : 'tournament.finish.place', { rank, total: view.players })
  const close = (): void => setOpen(false)
  return (
    <>
      <section class={`tn-award ${tier}`} aria-label={t('tournament.finish.results')}>
        <Trophy tier={tier} />
        <div><small>{title}</small><h3>{tx(person.name)}</h3><p>{position}</p></div>
        <Button small act="tournament-celebrate" onClick={() => setOpen(true)}>{t('tournament.finish.replay')}</Button>
      </section>
      {active && open && createPortal(
        <Modal kind={`tn-ceremony ${tier}`} title={t('tournament.finish.results')} onBackdrop={close}
          actions={<IconButton icon="close" label={t('common.close')} onClick={close} />}>
          <div class="tn-ceremony-scene">
            <div class="tn-celebration-rays" aria-hidden="true" />
            <div class="tn-celebration-confetti" aria-hidden="true">{Array.from({ length: 32 }, (_, i) => <i key={i} style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--drift': `${(i % 2 ? 1 : -1) * (35 + i % 5 * 16)}px`, '--delay': `${i % 8 * .1}s` }} />)}</div>
            <p class="tn-ceremony-name">{view.name}</p>
            <div class="tn-cup-arrival"><Trophy tier={tier} /></div>
            <div class="tn-ceremony-caption">
              <h3>{title}</h3><p class="tn-ceremony-player">{tx(person.name)}</p>
              <p class="tn-ceremony-place">{position}</p>
              <p class="tn-ceremony-cup">{t(`tournament.finish.cup.${tier}`)}</p>
            </div>
          </div>
          <Button variant="primary" act="tournament-finish-continue" onClick={close}>{t('tournament.finish.table')}</Button>
        </Modal>, document.getElementById('ui') as HTMLElement,
      )}
    </>
  )
}
