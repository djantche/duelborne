// Salons du réseau : les parties ouvertes, que l'on peut rejoindre (une place libre) ou regarder (spectateur).
// La liste se rafraîchit toute seule tant que cet écran est ouvert.
import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import type { RoomSummary } from '../../shared/protocol.ts'
import { send } from '../app/net.ts'
import { navigate } from '../app/navigation.ts'
import { store } from '../app/store.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { cx } from '../ui/cx.ts'
import { Icon } from '../ui/Icon.tsx'
import { RuleTags } from '../ui/rules.tsx'
import { t, tx } from '../i18n.ts'

function RoomRow({ r }: { r: RoomSummary }): JSX.Element {
  const half = r.seats.length / 2
  const team = (i: number): string => {
    const names = r.seats.filter((_, k) => k % 2 === i).map((s) => (s ? tx(s.name) : null))
    return names.map((n) => n ?? '—').join(' & ')
  }
  const free = r.seats.filter((s) => s === null).length
  return (
    <li class={cx('room', `st-${r.state}`)}>
      <div class="room-head">
        <span class="room-mode">
          <Icon name={half > 1 ? 'team' : 'users'} />
          {half > 1 ? t('rooms.2v2') : t('rooms.1v1')}
        </span>
        <span class={cx('room-state', `st-${r.state}`)}>
          {t(`rooms.state.${r.state}`)}
          {r.state === 'duel' && r.turn > 0 ? ` · ${t('rooms.turn', { n: r.turn })}` : ''}
        </span>
      </div>
      <div class="room-vs">
        <b>{team(0)}</b>
        <i>vs</i>
        <b>{team(1)}</b>
      </div>
      <RuleTags format={r.format} challenge={r.challenge} theme={r.theme} />
      <div class="room-foot">
        <small>
          {free > 0 && r.state === 'lobby' ? t('rooms.free', { n: free }) : ''}
          {r.spectators > 0 ? ` · ${t('rooms.spectators', { n: r.spectators })}` : ''}
        </small>
        <div class="room-actions">
          {r.open && (
            <Button small variant="primary" act="room-join" data-room={r.id} onClick={() => send({ t: 'join', room: r.id, spectate: false })}>
              {t('rooms.join')}
            </Button>
          )}
          {r.watchable && (
            <Button small act="room-watch" data-room={r.id} onClick={() => send({ t: 'join', room: r.id, spectate: true })}>
              {t('rooms.watch')}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

export function RoomsScreen({ active = true }: { active?: boolean }): JSX.Element {
  useEffect(() => {
    if (!active) return
    send({ t: 'rooms' })
    const timer = setInterval(() => send({ t: 'rooms' }), 2000)
    return () => clearInterval(timer)
  }, [active])
  const back = (): void => {
    navigate('home')
  }
  return (
    <div class="screen rooms">
      <header>
        <IconButton icon="back" label={t('common.back')} act="back" onClick={back} />
        <div class="lobby-title">
          <small>{t('home.multi')}</small>
          <h1>{t('rooms.title')}</h1>
        </div>
      </header>
      <ul class="room-list">
        {store.rooms.map((r) => (
          <RoomRow key={r.id} r={r} />
        ))}
        {!store.rooms.length && (
          <li class="room-empty">
            <b>{t('rooms.none')}</b>
            <small>{t('rooms.noneText')}</small>
          </li>
        )}
      </ul>
      <footer>
        <Button variant="primary" act="room-new-lan" onClick={() => send({ t: 'play', mode: 'lan' })}>
          {t('rooms.new1')}
        </Button>
        <Button act="room-new-team" onClick={() => send({ t: 'play', mode: 'team' })}>
          {t('rooms.new2')}
        </Button>
      </footer>
    </div>
  )
}
