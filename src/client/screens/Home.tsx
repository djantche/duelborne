// Accueil : nom du joueur et choix du mode de jeu.
import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { RoomMode } from '../../shared/protocol.ts'
import { send } from '../app/net.ts'
import { navigate } from '../app/navigation.ts'
import { saved, store } from '../app/store.ts'
import { openTournaments } from '../app/tournaments.ts'
import { CardBack } from '../ui/Card.tsx'
import { sfx } from '../ui/audio.ts'
import { cx } from '../ui/cx.ts'
import { Icon } from '../ui/Icon.tsx'
import type { IconName } from '../ui/Icon.tsx'
import { isDefaultName, t } from '../i18n.ts'

export const Logo = (): JSX.Element => (
  <div class="logo" role="img" aria-label="Duelborne">
    <span aria-hidden="true">DUEL</span>
    <em aria-hidden="true">BORNE</em>
  </div>
)

/** Enregistre le nom saisi et le transmet au serveur s'il a changé. */
function commitName(): void {
  // Le nom d'un compte est son nom public : il se change dans le profil.
  if (store.user) return
  const input = document.querySelector<HTMLInputElement>('input[name="name"]')
  const name = (input?.value ?? '').trim().slice(0, 24) || t('home.defaultName')
  if (name === store.name) return
  store.name = name
  saved.set('name', name)
  send({ t: 'rename', name })
}

type Panel = 'solo' | 'multi'

/** Une entrée du menu : icône, titre, courte description ; `opens` : elle ouvre un sous-menu (chevron). */
function Entry({ icon, title, text, act, mode, menu, opens, active, i, onClick }: { icon: IconName; title: string; text: string; act: string; mode?: RoomMode; menu?: Panel; opens?: boolean; active?: boolean; i: number; onClick: () => void }): JSX.Element {
  return (
    <button type="button" class={cx('entry', active && 'active')} style={{ '--i': i }} data-act={act} data-mode={mode} data-menu={menu} aria-expanded={opens ? active : undefined} onClick={() => { sfx('button', { volume: 0.6 }); onClick() }}>
      <Icon name={icon} />
      <span>
        <b>{title}</b>
        <small>{text}</small>
      </span>
      {opens && <i class="chev" aria-hidden="true" />}
    </button>
  )
}

function Mode({ mode, icon, title, text, i }: { mode: RoomMode; icon: IconName; title: string; text: string; i: number }): JSX.Element {
  const play = (): void => {
    commitName()
    send({ t: 'play', mode })
  }
  return <Entry icon={icon} title={title} text={text} act="play" mode={mode} i={i} onClick={play} />
}

/** Flèches haut et bas : passe d'une entrée à l'autre du menu ; droite : ouvre le sous-menu ; gauche ou Échap : le referme. */
function arrows(ev: KeyboardEvent, back?: () => void): void {
  const nav = ev.currentTarget as HTMLElement
  const items = [...nav.querySelectorAll<HTMLButtonElement>('.entry')]
  const at = items.indexOf(document.activeElement as HTMLButtonElement)
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault()
    const next = items[(at + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]
    next?.focus()
    sfx('menu', { volume: 0.25, gap: 40 })
  } else if (ev.key === 'ArrowRight' && items[at]?.getAttribute('aria-expanded') !== null && at >= 0) {
    ev.preventDefault()
    items[at]?.click()
  } else if ((ev.key === 'ArrowLeft' || ev.key === 'Escape') && back) {
    ev.preventDefault()
    back()
  }
}

/** Cartes qui dérivent lentement au fond de l'écran-titre (positions fixes, pour ne pas bouger d'un rendu à l'autre). */
const DRIFT = [
  [8, 0, 34, -14],
  [22, 9, 26, 10],
  [41, 4, 40, -6],
  [63, 12, 30, 16],
  [79, 2, 36, -10],
  [92, 7, 28, 8],
] as const

export function HomeScreen(): JSX.Element {
  const [panel, setPanel] = useState<Panel | null>(() => { const p = saved.get('home-panel'); return p === 'solo' || p === 'multi' ? p : null })
  const [closing, setClosing] = useState(false)
  const closingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sub = useRef<HTMLElement>(null)
  const menu = useRef<HTMLElement>(null)
  // Un sous-menu qui s'ouvre prend le focus clavier (sa première entrée).
  useEffect(() => {
    saved.set('home-panel', panel ?? '')
    if (panel) sub.current?.querySelector<HTMLButtonElement>('.entry')?.focus({ preventScroll: true })
  }, [panel])
  const open = (screen: 'deck' | 'rooms' | 'options' | 'replays' | 'account' | 'tournaments'): void => {
    commitName()
    navigate(screen)
  }
  const toggle = (p: Panel): void => {
    clearTimeout(closingTimer.current)
    setClosing(false)
    if (panel === p) close()
    else setPanel(p)
  }
  const close = (): void => {
    const was = panel
    setClosing(true)
    clearTimeout(closingTimer.current)
    closingTimer.current = setTimeout(() => {
      setPanel(null)
      setClosing(false)
      if (store.screen === 'home') menu.current?.querySelector<HTMLButtonElement>(`[data-menu="${was}"]`)?.focus({ preventScroll: true })
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160)
  }
  return (
    <div class={cx('screen home', panel && 'has-sub')}>
      <div class="home-glow" aria-hidden="true" />
      <div class="home-drift" aria-hidden="true">
        {DRIFT.map(([x, delay, dur, rot], i) => (
          <span key={i} style={{ left: `${x}%`, animationDelay: `-${delay}s`, animationDuration: `${dur}s`, '--rot': `${rot}deg` }}>
            <CardBack size="sm" />
          </span>
        ))}
      </div>
      <section class="title">
        <div class="deco">
          <CardBack size="md" />
          <CardBack size="md" />
          <CardBack size="md" />
        </div>
        <Logo />
        <label class="field">
          <small>{t('home.name')}</small>
          <input name="name" maxLength={24} value={store.user ? store.user.displayName : isDefaultName(store.name) ? '' : store.name} placeholder={t('home.defaultName')} autocomplete="off" disabled={!!store.user} title={store.user ? t('home.nameAccount') : undefined} onChange={commitName} />
        </label>
      </section>
      <nav class="menu" ref={menu} aria-label={t('home.menu')} onKeyDown={(ev) => arrows(ev)}>
        <Entry icon="computer" title={t('home.solo')} text={t('home.soloText')} act="menu" menu="solo" opens active={panel === 'solo'} i={0} onClick={() => toggle('solo')} />
        <Entry icon="users" title={t('home.multi')} text={t('home.multiText')} act="menu" menu="multi" opens active={panel === 'multi'} i={1} onClick={() => toggle('multi')} />
        <Entry icon="deck" title={t('home.deck')} text={t('home.deckText')} act="deck" i={2} onClick={() => open('deck')} />
        <Entry icon="history" title={t('replay.library')} text={t('replay.homeText')} act="replays" i={3} onClick={() => open('replays')} />
        <Entry icon="shield" title={store.user ? t('home.account', { name: store.user.displayName }) : t('home.login')} text={store.user ? t('home.accountText') : t('home.loginText')} act="account" i={4} onClick={() => open('account')} />
        <Entry icon="gear" title={t('home.options')} text={t('home.optionsText')} act="options" i={5} onClick={() => open('options')} />
      </nav>
      {panel && (
        <nav class={cx('submenu', closing && 'leaving')} key={panel} ref={sub} aria-label={panel === 'solo' ? t('home.solo') : t('home.multi')} onKeyDown={(ev) => arrows(ev, close)}>
          <header>
            <button type="button" class="sub-back" data-act="menu-back" aria-label={t('common.back')} onClick={close}>
              <Icon name="back" />
            </button>
            <h2>{panel === 'solo' ? t('home.solo') : t('home.multi')}</h2>
          </header>
          {panel === 'solo' ? (
            <>
              <Mode mode="ai" icon="computer" title={t('home.ai')} text={t('home.aiText')} i={0} />
              <Mode mode="aivai" icon="computer" title={t('home.aivai')} text={t('home.aivaiText')} i={1} />
              <Entry icon="flag" title={t('home.soloTournament')} text={t('home.soloTournamentText')} act="solo-tournament" i={2} onClick={() => { commitName(); openTournaments('solo') }} />
              <Mode mode="sandbox" icon="target" title={t('home.sandbox')} text={t('home.sandboxText')} i={3} />
            </>
          ) : (
            <>
              <Entry icon="users" title={t('home.rooms')} text={t('home.roomsText')} act="rooms" i={0} onClick={() => open('rooms')} />
              <Mode mode="lan" icon="sword" title={t('home.lan')} text={t('home.lanText')} i={1} />
              <Mode mode="team" icon="team" title={t('home.team')} text={t('home.teamText')} i={2} />
              <Entry icon="flag" title={t('home.tournaments')} text={t('home.tournamentsText')} act="tournaments" i={3} onClick={() => { commitName(); openTournaments('friends') }} />
            </>
          )}
        </nav>
      )}
    </div>
  )
}

/** Écran de démarrage : barre d'avancement du chargement des cartes, puis attente du serveur. */
export function LoadingScreen(): JSX.Element {
  const { progress, phase } = store.loading
  const percent = progress === null ? null : Math.round(progress * 100)
  const label = phase === 'connect' ? t('home.connecting') : percent === null ? t('home.loading') : t('home.loadingPct', { pct: percent })
  return (
    <div class="screen">
      <div class="glass">
        <Logo />
        <div class="load-bar" role="progressbar" aria-label={t('home.loading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase === 'connect' ? 100 : (percent ?? undefined)} aria-valuetext={label} data-indeterminate={phase === 'cards' && percent === null ? '' : undefined}>
          <i style={{ width: `${phase === 'connect' ? 100 : (percent ?? 0)}%` }} />
        </div>
        <p class={cx('muted', phase === 'connect' && 'pulse')} role="status">
          {label}
        </p>
      </div>
    </div>
  )
}
