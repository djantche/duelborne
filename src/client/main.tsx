// Point d'entrée du client : styles, écrans, connexion au serveur.
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/rajdhani/500.css'
import '@fontsource/rajdhani/700.css'
import './styles/base.css'
import './styles/card.css'
import './styles/board.css'
import './styles/fx.css'
import './styles/summon.css'
import './styles/rps.css'
import './styles/deck.css'
import './styles/menus.css'
import './styles/mobile.css'
import './styles/polish.css'
import './styles/account.css'
import './styles/auth.css'
import './styles/responsive.css'
import './styles/select.css'
import './styles/controls.css'
import './styles/duel-inspector.css'
import './styles/combobox.css'
import './styles/tournaments.css'
import './styles/avatar.css'

import { render } from 'preact'
import { useEffect } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ServerMessage } from '../shared/protocol.ts'
import { soundMenu, toggleFullscreen } from './app/actions.ts'
import { authLost, setUser } from './app/account.ts'
import { keepAwake } from './app/awake.ts'
import { connect, send } from './app/net.ts'
import { initPwa } from './app/pwa.ts'
import { closeMenu, redraw, setRenderer, toast } from './app/render.ts'
import { loadCardsWithProgress } from './app/loading.ts'
import { saved, store } from './app/store.ts'
import { isPage, navigate, restoredPage, startNavigation } from './app/navigation.ts'
import { receiveReplay } from './app/replays.ts'
import { selectTournament } from './app/tournaments.ts'
import { ReplayLibrary, ReplayControls } from './screens/Replays.tsx'
import { stopPlayback } from './screens/replay/playback.ts'
import type { ScreenName } from './app/store.ts'
import { pushState, resetDuel } from './screens/duel/controller.ts'
import { DuelOverlays, DuelScreen, RotateHint } from './screens/duel/Duel.tsx'
import { DeckScreen } from './screens/Deck.tsx'
import { HomeScreen, LoadingScreen } from './screens/Home.tsx'
import { LobbyScreen } from './screens/Lobby.tsx'
import { OptionsScreen } from './screens/Options.tsx'
import { RoomsScreen } from './screens/Rooms.tsx'
import { AccountScreen } from './screens/Account.tsx'
import { TournamentsScreen } from './screens/Tournaments.tsx'
import { setSortLocale } from './screens/deck/model.ts'
import { Toss } from './screens/Toss.tsx'
import { setScene, sfx } from './ui/audio.ts'
import { ConfirmModal } from './ui/ConfirmModal.tsx'
import { Menu } from './ui/Menu.tsx'
import { Icon } from './ui/Icon.tsx'
import { DeckPicker } from './ui/DeckPicker.tsx'
import { LOCALES, lang, t, tx } from './i18n.ts'

const visited = new Set<string>()

/** Les pages visitées restent montées : formulaires, défilement et fenêtres survivent à la navigation. */
/** Écrans où le téléphone ne doit pas se mettre en veille : attente des joueurs, duel, relecture. */
const AWAKE_SCREENS = new Set(['lobby', 'duel', 'replay'])

function App(): JSX.Element {
  if (isPage(store.screen)) visited.add(store.screen)
  useEffect(() => keepAwake(AWAKE_SCREENS.has(store.screen)), [store.screen])
  return (
    <>
      {store.screen === 'loading' && <LoadingScreen />}
      {(['home', 'deck', 'rooms', 'options', 'replays', 'account', 'tournaments'] as const).map((page) => visited.has(page) && (
        <section key={page} class={`app-page${store.screen === page ? ' page-enter' : ''}`} hidden={store.screen !== page} aria-hidden={store.screen !== page}>
          {page === 'home' ? <HomeScreen /> : page === 'deck' ? <DeckScreen /> : page === 'rooms' ? <RoomsScreen active={store.screen === page} /> : page === 'replays' ? <ReplayLibrary active={store.screen === page} /> : page === 'account' ? <AccountScreen /> : page === 'tournaments' ? <TournamentsScreen active={store.screen === page} /> : <OptionsScreen />}
        </section>
      ))}
      {store.screen === 'lobby' && store.room && <LobbyScreen room={store.room} />}
      {(store.screen === 'duel' || store.screen === 'replay') && <DuelScreen />}
      {store.screen === 'replay' && <ReplayControls />}
      {(store.screen === 'lobby' || store.screen === 'duel' || store.screen === 'replay') && <RotateHint />}
    </>
  )
}

/** Tout ce qui flotte par-dessus l'écran et ses effets (rendu dans #ui). */
function Overlays(): JSX.Element {
  return (
    <>
      {(store.screen === 'duel' || store.screen === 'replay') && <DuelOverlays />}
      {store.toss && <Toss t={store.toss} />}
      {store.deckPicker && store.screen === 'lobby' && <DeckPicker />}
      <Menu />
      <ConfirmModal />
      {store.connection === 'offline' && store.screen !== 'replay' && <div class="connection-status" role="status"><Icon name="computer" />{t('ui.reconnecting')}</div>}
      {store.toast && (
        <div class="toast" key={store.toast.id}>
          {store.toast.text}
        </div>
      )}
      {/* Plein écran et sons : toujours accessibles hors duel (dans le duel, ils sont avec les outils). */}
      <button type="button" class="fs-btn" data-act="fullscreen" title={t('duel.fullscreen')} aria-label={t('duel.fullscreen')} onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>
      <button type="button" class="fs-btn snd-btn" data-act="sound" title={t('duel.sounds')} aria-label={t('duel.sounds')} onClick={(ev) => soundMenu(ev.currentTarget)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4Zm12.5 1a3.5 3.5 0 0 1 0 4M18.5 7.5a7 7 0 0 1 0 9" />
        </svg>
      </button>
    </>
  )
}

const appRoot = document.getElementById('app') as HTMLElement
const uiRoot = document.getElementById('ui-root') as HTMLElement
setRenderer(() => {
  document.body.dataset.screen = store.screen
  render(<App />, appRoot)
  render(<Overlays />, uiRoot)
})

/** Change d'écran ; quitter le duel l'oublie. */
function go(screen: ScreenName): void {
  if (store.screen === 'duel' && screen !== 'duel') resetDuel()
  navigate(screen, true)
}

const REASONS = { kicked: 'net.kicked', reset: 'net.closed', closed: 'net.closed' } as const

function onServer(m: ServerMessage): void {
  switch (m.t) {
    case 'session':
      saved.set('token', m.token)
      store.name = m.name
      store.admin = m.admin
      store.decks = m.decks
      store.formats = m.formats
      // Le serveur a refusé le jeton de connexion (expiré, révoqué) : on l'oublie, on reste invité.
      if (m.authInvalid) authLost()
      else setUser(m.user)
      redraw()
      break
    case 'tournamentUpdate':
      store.tournamentRevision++
      if (store.screen !== 'tournaments') toast(t(m.reason === 'match' ? 'tournament.toastMatch' : m.reason === 'result' ? 'tournament.toastResult' : 'tournament.toastState'))
      redraw()
      break
    case 'home': {
      if (store.screen === 'replay' && !m.reason) break
      const tournament = !m.reason ? store.room?.tournament : null
      if (tournament) selectTournament(tournament.id)
      store.toss = null
      store.room = null
      store.deckPicker = null
      setScene('menu')
      // Une reconnexion ne doit pas éjecter l'utilisateur de son brouillon ou de ses réglages.
      go(tournament ? 'tournaments' : m.reason || !isPage(store.screen) && store.screen !== 'loading' ? 'home' : store.screen === 'loading' ? restoredPage() : store.screen)
      if (m.reason) toast(t(REASONS[m.reason]))
      break
    }
    case 'lobby': {
      store.toss = null
      store.room = m.room
      setScene('menu')
      go('lobby')
      break
    }
    case 'rooms':
      store.rooms = m.rooms
      if (store.screen === 'rooms') redraw()
      break
    case 'toss':
      store.toss = m.toss
      redraw()
      break
    case 'state':
      if (store.screen === 'replay') stopPlayback(false)
      if (m.room) store.room = m.room
      store.toss = null
      store.deckPicker = null
      setScene('duel')
      pushState(m)
      break
    case 'error':
      store.replaySavingId = null
      sfx('info')
      toast(tx(m.message))
      break
    case 'replay':
      void receiveReplay(m.replay)
      break
  }
}

document.addEventListener('fullscreenchange', () => document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement))

// Un menu ouvert se referme dès qu'on touche ailleurs.
document.addEventListener('pointerdown', (ev) => {
  const target = ev.target as HTMLElement
  if (!store.menu || target.closest('.actions')) return
  // Toucher la carte qui porte le menu le garde ouvert (le clic qui suit le confirme) : pas de disparition puis réapparition.
  if (store.menu.owner !== undefined && target.closest(`[data-uid="${store.menu.owner}"]`)) return
  closeMenu()
})

// Clic sur un bouton : petit bruit (le son d'une carte touchée est joué par l'écran de duel).
document.addEventListener('click', (ev) => {
  if ((ev.target as HTMLElement).closest('.btn, .entry, .deck, .phase.go, .actions button, .choice, .fs-btn')) sfx('button', { volume: 0.6, gap: 90 })
})

async function boot(): Promise<void> {
  startNavigation()
  setSortLocale(LOCALES[lang()]?._code ?? lang())
  redraw()
  try {
    await loadCardsWithProgress()
  } catch {
    toast(t('net.cardsFail'))
  }
  store.loading.phase = 'connect'
  redraw()
  connect(onServer)
}

initPwa()
void boot()
