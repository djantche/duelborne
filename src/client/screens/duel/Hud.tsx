// Colonne de droite et repères du duel : points de vie, phases, chaîne en cours, journal.
import type { JSX } from 'preact'
import type { DuelPlayer, DuelView, LogEntry, PlayerView, Seat } from '../../../shared/protocol.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Icon } from '../../ui/Icon.tsx'
import type { IconName } from '../../ui/Icon.tsx'
import { store } from '../../app/store.ts'
import { redraw } from '../../app/render.ts'
import { parseMsg } from '../../../shared/msg.ts'
import { soundMenu, toggleFullscreen } from '../../app/actions.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { imgUrl, nameOf } from '../../ui/cardview.ts'
import { cx } from '../../ui/cx.ts'
import { phases } from '../../ui/i18n.ts'
import { chooseOptionById, inspectCard, offBoardMenu, openLog, surrender } from './controller.ts'
import { activePrompt } from './prompt.ts'
import { duel } from './state.ts'
import { duelistName } from './perspective.ts'
import type { Side } from './state.ts'
import { t, tx } from '../../i18n.ts'

/** Duel par équipes : les deux duellistes de l'équipe, celui qui a la main en avant. */
function Members({ members, playing }: { members: DuelPlayer[]; playing: number | undefined }): JSX.Element {
  return (
    <ul class="hud-members">
      {members.map((m) => {
        const name = tx(m.name)
        const on = playing === m.place
        return (
          <li key={m.place} class={cx('hud-member', on && 'on', playing !== undefined && !on && 'idle')} title={name}>
            <Avatar card={m.avatar} bot={m.bot} name={name} />
            <b class="hud-member-name">{name}</b>
            {on && <span class="hud-member-mark" role="img" aria-label={t('duel.hasHand')} title={t('duel.hasHand')}><Icon name="play" /></span>}
          </li>
        )
      })}
    </ul>
  )
}

export function Hud({ v, p, side, name, online }: { v: DuelView; p: PlayerView; side: Side; name: string; online: boolean }): JSX.Element {
  const active = (side === 'me') === (v.turnPlayer === v.you)
  const pct = `${Math.max(0, Math.min(100, (p.lp / v.startLp) * 100))}%`
  const team: Seat = side === 'me' ? v.you : v.you === 0 ? 1 : 0
  const members = duel.players.filter((m) => m.place % 2 === team)
  const solo = members.length === 1 ? members[0] : undefined
  return (
    <div class={cx('hud', side, active && 'active', members.length > 1 && 'team')} data-side={side}>
      <div class="hud-top">
        {members.length > 1 ? <Members members={members} playing={v.playing?.[team]} /> : (
          <span class="hud-who">
            <Avatar card={solo?.avatar ?? null} bot={solo?.bot} name={name} />
            <b class="hud-name">{name}</b>
          </span>
        )}
        {/* Par équipes, l'anneau du coéquipier qui a la main dit déjà quel camp joue : le nom garde la place. */}
        {!online ? <span class="tag off">{t('duel.offline')}</span> : active && members.length < 2 ? <span class="tag">{t('duel.plays')}</span> : null}
      </div>
      <div class="lp">
        <span class="lp-num">{p.lp}</span>
        <small>LP</small>
      </div>
      <div class="lp-bar">
        <i class="lp-ghost" style={{ width: pct }} />
        <i class="lp-fill" style={{ width: pct }} />
      </div>
      <div class="hud-meta">
        <span>
          <Icon name="hand" />{t('duel.hand')} <b>{p.hand.length}</b>
        </span>
        <span>
          <Icon name="deck" />{t('duel.deck')} <b>{p.deckCount}</b>
        </span>
        <span>
          <Icon name="grave" />{t('duel.grave')} <b>{p.graveyard.length}</b>
        </span>
      </div>
    </div>
  )
}

export function Phases({ v }: { v: DuelView }): JSX.Element {
  const prompt = activePrompt()
  const options = prompt?.kind === 'idle' || prompt?.kind === 'battle' ? prompt.options : []
  const go = { battle: options.find((o) => o.action === 'toBattle'), main2: options.find((o) => o.action === 'toMain2'), end: options.find((o) => o.action === 'toEnd') }
  // Effets de cartes sans emplacement visible (Deck) : proposés dans un menu à part.
  const offBoard = options.filter((o) => o.uid === null && o.cardId !== null)
  const mine = v.turnPlayer === v.you
  // Par équipes : le duelliste qui a la main pour l'équipe du tour, nommé plutôt que « ton coéquipier ».
  const lead = v.playing ? duel.players.find((m) => m.place === v.playing?.[v.turnPlayer]) : undefined
  return (
    <div class={`phases ${mine ? 'mine' : 'theirs'}`}>
      <div class="turn-label">
        <small>{t('duel.turn', { n: v.turn })}</small>
        <b>{mine && !v.spectating && !v.watching ? t('duel.yourTurn') : lead ? t('duel.turnOf', { name: tx(lead.name) }) : v.watching ? t('duel.turnOf', { name: duelistName(duel.names, v.turnPlayer) }) : !mine ? t('duel.foeTurn') : t('duel.mateTurn')}</b>
      </div>
      <div class="pills">
        {phases().map((ph) => {
          const option = go[ph.id as keyof typeof go]
          return (
            <button type="button" key={ph.id} class={cx('phase', ph.id === v.phase && 'on', option && 'go')} aria-label={ph.label} title={ph.label} disabled={!option} data-act={option ? 'option' : undefined} data-id={option?.id} onClick={() => option && chooseOptionById(option.id)}>
              <b>{ph.short}</b>
              <span>{ph.label}</span>
            </button>
          )
        })}
      </div>
      {offBoard.length > 0 && (
        <Button small act="offboard" onClick={(ev) => offBoardMenu(ev.currentTarget)}>
          {t('duel.others', { n: offBoard.length })}
        </Button>
      )}
      <Button variant="primary" class="end" act={go.end ? 'option' : undefined} disabled={!go.end} onClick={() => go.end && chooseOptionById(go.end.id)}>
        {t('duel.endTurn')}
      </Button>
      <div class="tools">
        <IconButton icon="fullscreen" label={t('duel.fullscreen')} act="fullscreen" onClick={toggleFullscreen} />
        <IconButton icon="sound" label={t('duel.sounds')} act="sound" onClick={(ev) => soundMenu(ev.currentTarget)} />
        <IconButton icon="log" label={t('duel.log')} act="log" onClick={openLog} />
        <IconButton icon="keyboard" class="keys-btn" label={t('keys.title')} act="keys" onClick={() => { duel.keysHelp = true; redraw() }} />
        {store.screen !== 'replay' && <IconButton icon="flag" label={t(store.room?.tournament && v.winner !== null ? 'tournament.return' : v.watching ? 'duel.quit' : 'duel.surrender')} variant="danger" act="surrender" onClick={surrender} />}
      </div>
    </div>
  )
}

/** Maillons de la chaîne en cours, du premier au dernier : les cartes elles-mêmes, dans l'ordre. */
export function ChainBar({ v }: { v: DuelView }): JSX.Element | null {
  const chain = duel.chainShown ?? v.chain
  if (!chain.length || (chain.length < 2 && !duel.chainLong)) return null
  return (
    <div class="chainbar" role="list" aria-label={t('duel.chain')}>
      {chain.map((c, i) => {
        const data = store.cards.get(c.cardId)
        return (
          <div key={i} role="listitem" class={cx('link', c.seat === v.you ? 'me' : 'foe')}>
            {data && <Card card={data} size="sm" />}
            <b>{i + 1}</b>
          </div>
        )
      })}
    </div>
  )
}

/** Texte d'une ligne du journal : les cartes citées (« ⟦numéro|nom⟧ ») deviennent des liens vers leur fiche. */
function logText(text: string): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = []
  let last = 0
  for (const m of text.matchAll(/⟦(\d+)\|([^⟧]*)⟧/g)) {
    out.push(text.slice(last, m.index))
    const id = Number(m[1])
    const known = store.cards.get(id)
    out.push(
      <button type="button" class="cardref" data-card={id} key={`${m.index}`} onClick={() => inspectCard(id)}>
        {known ? nameOf(known) : (m[2] as string)}
      </button>,
    )
    last = (m.index ?? 0) + m[0].length
  }
  out.push(text.slice(last))
  return out
}

/** Journal du duel : un en-tête par tour, une ligne par action (bleu : toi, rouge : adversaire), cartes cliquables. */
export function logCategory(text: string): 'effects' | 'combat' | 'moves' {
  const key = parseMsg(text)?.key ?? ''
  return /activate|resolve|negated|targets|counter/.test(key) ? 'effects' : /attacks|combat|damage|gain|attackNegated/.test(key) ? 'combat' : 'moves'
}

export function LogLines({ v, filter, rich = false }: { v: DuelView; filter?: (line: LogEntry) => boolean; rich?: boolean }): JSX.Element {
  let turn = -1
  return (
    <>
      {v.log.flatMap((l, i) => {
        const ref = parseMsg(l.text)
        if (ref?.key === 'log.turn' || filter && !filter(l)) return []
        const head = l.turn !== turn
        turn = l.turn
        // Les maillons d'une chaîne, leur résolution et les cibles sont en retrait.
        const chain = ref?.key === 'log.resolve' || ref?.key === 'log.targets' || (ref?.key === 'log.activate' && !!ref.params.prefix)
        const category = logCategory(l.text)
        const icon: IconName = category === 'effects' ? 'bolt' : category === 'combat' ? 'sword' : /summon|special|flipSummon/.test(ref?.key ?? '') ? 'summon' : /draw/.test(ref?.key ?? '') ? 'hand' : /Grave|destroyed|tribute/.test(ref?.key ?? '') ? 'grave' : 'deck'
        return [head ? <div key={`turn-${i}`} class="turn-head">{t('duel.turn', { n: l.turn })}</div> : null, (
          <div key={i} class={cx('line', l.seat === null ? 'sys' : l.seat === v.you ? 'mine' : 'theirs', chain && 'chain')}>
            {rich && <span class="log-icon"><Icon name={icon} /></span>}
            <span class="log-message">{logText(tx(l.text))}</span>
            {rich && <small class="log-index">{String(i + 1).padStart(2, '0')}</small>}
          </div>
        )]
      })}
    </>
  )
}
