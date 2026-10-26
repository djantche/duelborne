// Salon d'une salle : un écran « versus ». Chaque place montre son joueur, son deck (une vignette qui ouvre le choix de deck)
// et, pour l'ordinateur, son niveau ; les réglages de la partie se déplient en dessous ; « Commencer » est au centre, en bas.
import type { JSX } from 'preact'
import { AI_LEVELS, SETTING_CHOICES } from '../../shared/protocol.ts'
import type { AiLevel, DuelSettings, LobbySeat, RoomInfo, RoomMode } from '../../shared/protocol.ts'
import { kickOthers, leaveRoom } from '../app/actions.ts'
import { send } from '../app/net.ts'
import { store } from '../app/store.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { imgUrl } from '../ui/cardview.ts'
import { cx } from '../ui/cx.ts'
import { deckOf, openDeckPicker, seriesLabel } from '../ui/DeckPicker.tsx'
import { Icon } from '../ui/Icon.tsx'
import { Select } from '../ui/Select.tsx'
import type { Choice } from '../ui/Select.tsx'
import { ChallengeSelect, FormatNotes, FormatSelect, HandicapSelect, RuleTags, ThemeSelect, challengeText } from '../ui/rules.tsx'
import { t, tx } from '../i18n.ts'

const MODE_TITLE: Record<RoomMode, string> = { ai: 'home.ai', aivai: 'home.aivai', lan: 'home.lan', team: 'home.team', sandbox: 'home.sandbox' }

/** Vignette du deck d'une place : l'illustration de sa carte emblème, son nom ; un clic ouvre le choix (si on peut le changer). */
function DeckSlot({ s, place, editable }: { s: LobbySeat; place: number; editable: boolean }): JSX.Element {
  const d = s.deckInfo ?? deckOf(s.deck)
  const random = !d && s.bot
  return (
    <button type="button" class={cx('deck-slot', !d && 'empty', random && 'random', editable && 'can')} data-act="pick-deck" data-seat={place} disabled={!editable} onClick={() => openDeckPicker(place, s.bot, s.deck, s.name, s.randomSeries)}>
      <span class="slot-art" style={d ? { backgroundImage: `url(${imgUrl(d.cover)})` } : undefined}>
        {!d && <Icon name={random ? 'shuffle' : 'deck'} />}
      </span>
      <span class="slot-text">
        <small>{d ? seriesLabel(d.series) : t('lobby.deck')}</small>
        <b>{d ? d.name : random ? (s.randomSeries ? t('picker.randomIn', { series: seriesLabel(s.randomSeries) }) : t('lobby.randomDeck')) : t('lobby.chooseDeck')}</b>
        {d && <em>{t('lobby.cards', { n: d.mainCount })}{d.extraCount ? ` + ${d.extraCount} ${t('lobby.extra')}` : ''}</em>}
      </span>
      {editable && <span class="slot-change">{d || random ? t('lobby.change') : t('lobby.choose')}</span>}
      {s.legal === false && s.issue && (
        <span class="slot-issue" role="alert">
          <Icon name="info" />
          {tx(s.issue)}
        </span>
      )}
    </button>
  )
}

/** Niveau d'un ordinateur : trois boutons (débutant, confirmé, expert), plutôt qu'une liste. */
function LevelPicker({ level, place }: { level: AiLevel; place: number }): JSX.Element {
  return (
    <div class="levels" role="radiogroup" aria-label={t('lobby.levelLabel')}>
      {AI_LEVELS.map((l, i) => (
        <button type="button" key={l.id} role="radio" aria-checked={level === l.id} class={cx('lvl', level === l.id && 'on')} data-act="ai-level" data-seat={place} data-level={l.id} onClick={() => level !== l.id && send({ t: 'aiLevel', level: l.id, seat: place })}>
          <i class="level-meter" aria-hidden="true"><Icon name="computer" /><span>{[0, 1, 2].map((n) => <b key={n} class={n <= i ? 'lit' : ''} />)}</span></i>
          {t(`level.${l.id}`)}
        </button>
      ))}
    </div>
  )
}

/** Une place de la salle. `team` : salle par équipes (places libres à prendre ou à confier à l'ordinateur). */
function SeatCard({ seat: s, place, you, team, mode, locked }: { seat: LobbySeat | null; place: number; you: number; team: boolean; mode: RoomMode; locked: boolean }): JSX.Element {
  const mine = place === you
  if (!s) {
    if (!team) {
      return (
        <div class="seat waiting" data-seat={place}>
          <small class="seat-role">{t('lobby.foe')}</small>
          <b class="seat-name">{t('lobby.waiting')}</b>
          <span class="seat-hint">{t('lobby.waitingHint')}</span>
          <span class="seat-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )
    }
    return (
      <div class="seat empty" data-seat={place}>
        <small class="seat-role">{t('lobby.freeSeat')}</small>
        <div class="seat-actions">
          <Button small act="sit" data-seat={place} onClick={() => send({ t: 'seat', seat: place })}>
            {t('lobby.sit')}
          </Button>
          <Button small icon="computer" act="bot-add" data-seat={place} onClick={() => send({ t: 'bot', seat: place, add: true })}>
            {t('lobby.computer')}
          </Button>
        </div>
      </div>
    )
  }
  const aivai = mode === 'aivai'
  const role = mine ? t('lobby.you') : aivai ? t(place === 0 ? 'lobby.player1' : 'lobby.player2') : s.bot ? t('lobby.computer') : team && place % 2 === you % 2 ? t('lobby.mate') : t('lobby.foe')
  // On choisit son propre deck (tant qu'on n'est pas prêt) et celui des ordinateurs.
  const editable = !locked && ((mine && !s.ready) || s.bot)
  return (
    <div class={cx('seat on', s.ready && !s.bot && 'ready', mine && 'mine', s.bot && 'bot')} data-seat={place}>
      <div class="seat-head">
        <Icon name={s.bot ? 'computer' : 'users'} />
        <span>
          <small class="seat-role">{role}</small>
          <b class="seat-name">{tx(s.name)}</b>
        </span>
        {!s.bot && <em class={cx('seat-state', s.ready && 'ok', !s.connected && 'off')}>{!s.connected ? t('lobby.offline') : s.ready ? t('lobby.ready') : mine ? '' : t('lobby.choosing')}</em>}
        {s.bot && team && <IconButton icon="close" label={t('lobby.removeBot')} class="mini" act="bot-remove" data-seat={place} onClick={() => send({ t: 'bot', seat: place, add: false })} />}
      </div>
      <DeckSlot s={s} place={place} editable={editable} />
      {s.bot && s.level && (locked ? <small>{t(`level.${s.level}`)}</small> : <LevelPicker level={s.level} place={place} />)}
    </div>
  )
}

const minutes = (s: number): string => (s === 0 ? t('lobby.unlimited') : s < 60 ? `${s} s` : `${s / 60} min`)

/** Liste déroulante d'un réglage de la partie. */
function Setting({ label, value, onChange, choices, custom }: { label: string; value: string; onChange: (value: string) => void; choices: Choice[]; custom?: JSX.Element }): JSX.Element {
  return (
    <div class="setting">
      <small>{label}</small>
      {custom ?? <Select value={value} choices={choices} onChange={onChange} />}
    </div>
  )
}

/** Réglages de la partie : tout joueur de la salle peut les changer avant le début (sauf dans un match de tournoi). */
function Settings({ s, team, sandbox, aivai, locked }: { s: DuelSettings; team: boolean; sandbox: boolean; aivai: boolean; locked: boolean }): JSX.Element {
  const set = (settings: Partial<DuelSettings>): void => send({ t: 'settings', settings })
  if (locked) {
    return (
      <div class="settings locked">
        <p class="muted">{t('lobby.lockedSettings', { time: minutes(s.turnTime), lp: s.startLp, hand: s.startHand })}</p>
        <RuleTags format={s.format} challenge={s.challenge} theme={s.theme} handicap={s.handicap} />
        {s.challenge !== 'none' && <p class="muted">{challengeText(s.challenge)}</p>}
      </div>
    )
  }
  const numeric = (key: keyof typeof SETTING_CHOICES, label: string, text: (v: number) => string): JSX.Element => (
    <Setting label={label} value={String(s[key])} onChange={(v) => set({ [key]: Number(v) })} choices={SETTING_CHOICES[key].map((v) => ({ value: String(v), label: text(v) }))} />
  )
  const changed = s.turnTime !== 300 || s.startLp !== 8000 || s.startHand !== 5 || s.drawPerTurn !== 1 || s.first !== 'coin' || !s.shuffle || s.format !== 'casual' || s.challenge !== 'none' || s.handicap !== 'none' || s.theme !== ''
  return (
    <details class="settings" open={changed}>
      <summary>
        {t('lobby.settings')}{' '}
        <span>
          {sandbox || aivai ? `${s.startLp} LP` : `${t('lobby.perMove', { time: minutes(s.turnTime) })} · ${s.startLp} LP`}
        </span>
      </summary>
      <div class="settings-grid">
        {!sandbox && !aivai && numeric('turnTime', t('lobby.turnTime'), minutes)}
        {numeric('startLp', t('lobby.lp'), (v) => `${v} LP`)}
        {numeric('startHand', t('lobby.hand'), (v) => t('lobby.cards', { n: v }))}
        {numeric('drawPerTurn', t('lobby.draw'), (v) => t('lobby.cards', { n: v }))}
        {!sandbox && (
          <Setting
            label={t('lobby.first')}
            value={aivai && (s.first === 'coin' || s.first === 'rps') ? 'random' : String(s.first)}
            onChange={(v) => set({ first: v === 'coin' || v === 'rps' || v === 'random' ? v : v === '0' ? 0 : 1 })}
            choices={[
              // Entre ordinateurs, personne ne tire au sort : le pile ou face et le pierre-feuille-ciseaux n'ont pas de sens.
              ...(aivai ? [] : [{ value: 'coin', label: t('lobby.coin') }, { value: 'rps', label: t('lobby.rps') }]),
              { value: 'random', label: t('lobby.random') },
              { value: '0', label: team ? t('lobby.team1') : t('lobby.player1') },
              { value: '1', label: team ? t('lobby.team2') : t('lobby.player2') },
            ]}
          />
        )}
        <Setting label={t('lobby.format')} value={s.format} onChange={() => {}} choices={[]} custom={<FormatSelect value={s.format} onChange={(format) => set({ format })} />} />
        {!sandbox && <Setting label={t('lobby.challenge')} value={s.challenge} onChange={() => {}} choices={[]} custom={<ChallengeSelect value={s.challenge} onChange={(challenge) => set({ challenge })} />} />}
        {!sandbox && <Setting label={t('lobby.handicap')} value={s.handicap} onChange={() => {}} choices={[]} custom={<HandicapSelect value={s.handicap} team={team} onChange={(handicap) => set({ handicap })} />} />}
        {!sandbox && <Setting label={t('lobby.theme')} value={s.theme} onChange={() => {}} choices={[]} custom={<ThemeSelect value={s.theme} onChange={(theme) => set({ theme })} />} />}
        <Setting
          label={t('lobby.decks')}
          value={String(s.shuffle)}
          onChange={(v) => set({ shuffle: v === 'true' })}
          choices={[
            { value: 'true', label: t('lobby.shuffled') },
            { value: 'false', label: t('lobby.unshuffled') },
          ]}
        />
      </div>
      <FormatNotes id={s.format} />
      {s.challenge !== 'none' && <p class="muted">{challengeText(s.challenge)}</p>}
      <p class="muted">{sandbox ? t('lobby.sandboxNote') : t('lobby.timeNote')}</p>
    </details>
  )
}


export function LobbyScreen({ room }: { room: RoomInfo }): JSX.Element {
  const me = room.seats[room.you] ?? null
  const sandbox = room.mode === 'sandbox'
  const aivai = room.mode === 'aivai'
  const ai = room.mode === 'ai' || sandbox
  const team = room.mode === 'team'
  const seat = (place: number): JSX.Element => <SeatCard seat={room.seats[place] ?? null} place={place} you={room.you} team={team} mode={room.mode} locked={!!room.tournament} />
  const others = room.seats.some((s, i) => s && !s.bot && i !== room.you)
  const full = room.seats.every((s) => s)
  const ready = aivai || (!!me?.deck && me.legal !== false)
  return (
    <div class="lobby">
      <header>
        <IconButton icon="back" label={t('common.back')} act="leave" onClick={leaveRoom} />
        <div class="lobby-title">
          <small>{t('lobby.room')}</small>
          <h1>{room.tournament ? room.tournament.name : t(MODE_TITLE[room.mode])}</h1>
          <RuleTags format={room.settings.format} challenge={room.settings.challenge} theme={room.settings.theme} handicap={room.settings.handicap} tournament={room.tournament ? t('tournament.round', { n: room.tournament.round }) : undefined} />
        </div>
        {store.admin && others && (
          <Button small act="kick" onClick={kickOthers}>
            {t('lobby.kick')}
          </Button>
        )}
      </header>
      {/* Par équipes : places paires contre places impaires. En duel simple : toi (ou l'ordinateur 1), puis l'adversaire. */}
      <div class={cx('versus', team && 'teams')}>
        {team ? (
          <>
            <div class="team">
              <small>{t('lobby.team1')}</small>
              {seat(0)}
              {seat(2)}
            </div>
            <span class="vs">VS</span>
            <div class="team">
              <small>{t('lobby.team2')}</small>
              {seat(1)}
              {seat(3)}
            </div>
          </>
        ) : (
          <>
            {seat(aivai ? 0 : room.you)}
            <span class="vs">VS</span>
            {seat(aivai ? 1 : room.you === 0 ? 1 : 0)}
          </>
        )}
      </div>
      <Settings s={room.settings} team={team} sandbox={sandbox} aivai={aivai} locked={!!room.tournament} />
      <footer>
        <Button variant="primary" act="ready" disabled={!ready} onClick={() => send({ t: 'ready', ready: aivai ? true : !me?.ready })}>
          {aivai ? t('lobby.start') : me?.ready ? t('lobby.cancel') : ai ? t('lobby.start') : t('lobby.readyBtn')}
        </Button>
        <p class="muted">
          {aivai ? t('lobby.hintAivai') : !me?.deck ? t('lobby.hintDeck') : me.legal === false ? t('lobby.hintIllegal') : !full ? t('lobby.hintFree') : me?.ready ? t('lobby.hintWait') : sandbox ? t('lobby.hintSandbox') : ai ? t('lobby.hintAi') : t('lobby.hintAll')}
        </p>
      </footer>
    </div>
  )
}
