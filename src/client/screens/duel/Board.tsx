// Le terrain : tapis incliné, zones, piles et mains. Aucune logique de jeu ici : tout vient de la vue envoyée
// par le serveur, et les surbrillances de la question en cours (voir prompt.ts).
import type { JSX, TargetedKeyboardEvent } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { CardView, CounterView, DuelView, MonsterView, PlayerView, Seat, SpellTrapView } from '../../../shared/protocol.ts'
import { store } from '../../app/store.ts'
import { Stat } from '../../ui/Stat.tsx'
import { Card, CardBack } from '../../ui/Card.tsx'
import { imgUrl, isLink } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import { PHASE_NAME } from '../../ui/i18n.ts'
import type { Marks } from './prompt.ts'
import { duel } from './state.ts'
import type { Side } from './state.ts'
import { t } from '../../i18n.ts'

const cardOf = (c: CardView): ClientCard | null => (c.cardId === null ? null : (store.cards.get(c.cardId) ?? null))
const pileKey = (event: TargetedKeyboardEvent<HTMLDivElement>): void => {
  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    event.currentTarget.click()
  }
}

/** « Compteur Parchemin » → « Parchemin » : le jeton dit déjà qu'il s'agit d'un compteur. */
export const counterLabel = (name: string): string => name.replace(/^(?:Compteur|Counter)\s+(?:d[eu']\s*|de la\s+|des\s+)?/i, '').replace(/^\(?"(.*)"\)?$/, '$1') || name

/** Compteurs posés sur une carte : un jeton par type, avec le nombre et le nom. */
export function Counters({ list, big }: { list?: CounterView[]; big?: boolean }): JSX.Element | null {
  if (!list?.length) return null
  return (
    <div class={cx('ctrs', big && 'big')}>
      {list.map((c) => (
        <span class="ctr" key={c.name} title={`${c.count} × ${c.name}`}>
          <i>{c.count}</i>
          <em>{big ? c.name : counterLabel(c.name)}</em>
        </span>
      ))}
    </div>
  )
}

interface ZoneProps {
  side: Side
  marks: Marks
}

/** Ce que la question en cours fait à une zone : proposée, déjà cochée, ou inutilisable. */
function zoneState(keys: string[], marks: Marks): { cls: string; place: number | undefined } {
  const place = keys.map((k) => marks.places.get(k)).find((i) => i !== undefined)
  return { cls: cx(place !== undefined && 'placeable', keys.some((k) => marks.placed.has(k)) && 'placed', keys.some((k) => marks.disabled.has(k)) && 'disabled'), place }
}

/** Numéro de maillon de la carte `uid` dans la chaîne en cours de construction ou de résolution (null : hors chaîne). */
function chainNo(uid: number): number | null {
  const at = duel.chainUids.indexOf(uid)
  return at < 0 ? null : at + 1
}

/** Pastille du maillon, posée sur la carte source pendant toute la chaîne. */
function ChainNo({ uid, side }: { uid: number; side: Side }): JSX.Element | null {
  const n = chainNo(uid)
  return n === null ? null : <b class={`chain-no ${side}`} key={`chain-${n}`} aria-label={t('duel.chainLink', { n })}>{n}</b>
}

/**
 * @param keys identifiants de la zone (« siège:m:rang »), pour le choix d'une zone par le joueur.
 *             Une Zone Monstre Extra en porte deux : elle est partagée par les deux joueurs.
 */
function MonsterZone({ m, side, marks, keys, extra }: ZoneProps & { m: MonsterView | null; keys: string[]; extra?: boolean }): JSX.Element {
  const { cls: state, place: placeAt } = zoneState(keys, marks)
  const cls = cx('zone mz', extra && 'emz', state)
  if (!m) return <div class={cls} data-zk={keys.join(' ')} data-place={placeAt} />
  const data = cardOf(m.card)
  const uid = m.card.uid
  const common = { uid, area: 'monster', side, class: cx(side === 'foe' && 'reversed', m.position === 'def' && 'rot', marks.cards.get(uid)), lv: marks.lv.get(uid) }
  // Ligne ATK / DEF actuelles : la valeur utile selon la position est mise en avant, et une valeur
  // modifiée par un effet est colorée (vert = bonus, rouge = malus).
  const tone = (now: number | null, base: number | null | undefined): string => (now === null || base == null || base < 0 || now === base ? '' : now > base ? 'up' : 'down')
  return (
    <div class={cls} data-zk={keys.join(' ')} data-place={placeAt} data-pile-tip={m.materials ? t('duel.materialCount', { n: m.materials }) : undefined} tabIndex={m.materials ? 0 : undefined}>
      <div class="slot">{m.faceUp ? <Card card={data} {...common} /> : <CardBack {...common} peekId={m.card.cardId} />}</div>
      <ChainNo uid={uid} side={side} />
      {m.faceUp && m.atk !== null && (
        <div class={`statline ${m.position} ${side}`}>
          <b class={`a ${tone(m.atk, data?.atk)}`}>
            <Stat id={`${uid}:a`} value={m.atk} />
          </b>
          <i>/</i>
          {data && isLink(data) ? <b class="d">L{data.linkval ?? ''}</b> : <b class={`d ${tone(m.def, data?.def)}`}>
              <Stat id={`${uid}:d`} value={m.def} />
            </b>}
        </div>
      )}
      {!!m.materialCards?.length && (
        <div class={cx('xyz-stack', side)} aria-hidden="true">
          {m.materialCards.slice(-3).map((id, i, list) => (
            <i key={`${id}:${i}`} class="xyz-mat" data-card={id} style={{ '--k': list.length - 1 - i, zIndex: i + 1 }}>
              <Card card={store.cards.get(id) ?? null} size="md" />
            </i>
          ))}
        </div>
      )}
      <Counters list={m.counters} />
    </div>
  )
}

function SpellTrapZone({ z, side, marks, zk, area = 'st' }: ZoneProps & { z: SpellTrapView | null; zk: string; area?: string }): JSX.Element {
  const { cls: state, place } = zoneState([zk], marks)
  if (!z) return <div class={cx('zone sz', area === 'field' && 'fieldz', state)} data-zk={zk} data-place={place} />
  const uid = z.card.uid
  const data = cardOf(z.card)
  const common = { uid, area, side, class: cx(side === 'foe' && 'reversed', data && `frame-${data.frameType}`, marks.cards.get(uid)), lv: marks.lv.get(uid) }
  return (
    <div class={cx('zone sz', state)} data-zk={zk} data-place={place}>
      <div class="slot">{z.faceUp ? <Card card={data} {...common} /> : <CardBack {...common} peekId={z.card.cardId} />}</div>
      <ChainNo uid={uid} side={side} />
      {z.scale !== null && (
        <span class="scale" title={t('card.scaleTip')}>
          {z.scale}
        </span>
      )}
      <Counters list={z.counters} />
    </div>
  )
}

function Pile({ kind, count, side, label, marks }: ZoneProps & { kind: 'deck' | 'extra'; count: number; label: string }): JSX.Element {
  const tip = t('duel.pileCount', { zone: label, count: t('viewer.cards', { n: count }) })
  return (
    <div class={cx('zone pile', kind, marks.piles.get(`${side}:${kind}`))} data-pile={kind} data-side={side} data-count={t('viewer.cards', { n: count })} data-pile-tip={tip} aria-label={tip} role="button" tabIndex={0} onKeyDown={pileKey}>
      {count > 0 && (
        <div class="slot stack">
          <CardBack class={side === 'foe' ? 'reversed' : undefined} />
        </div>
      )}
      <small>{label}</small>
    </div>
  )
}

/**
 * Les cartes bannies : une zone de ténèbres au bord du terrain, au-dessus du Cimetière. Elle dure toute la partie (vide, elle dort) ;
 * les cartes qu'on y envoie y sont englouties en spirale.
 */
function Banished({ p, side }: { p: PlayerView; side: Side }): JSX.Element {
  const n = p.banished.length
  const tip = t('duel.pileCount', { zone: t('duel.banished'), count: t('viewer.cards', { n }) })
  const fx = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    // Stage est reconstruit après chaque état : les effets ambiants reprennent
    // la même horloge pour conserver leur phase, même après un bannissement.
    for (const animation of fx.current?.getAnimations({ subtree: true }) ?? []) {
      if (animation.effect?.getTiming().iterations === Infinity) animation.startTime = 0
    }
  }, [])
  return (
    <div class={cx('zone pile void', n > 0 ? 'filled' : 'dormant')} data-pile="banished" data-side={side} data-count={t('viewer.cards', { n })} data-pile-tip={tip} aria-label={tip} role="button" tabIndex={0} onKeyDown={pileKey}>
      <div class="void-fx" ref={fx} style={`--phase:${side === 'me' ? 0 : 11}`} aria-hidden="true">
        <i class="void-haze" />
        <i class="void-swirl a" />
        <i class="void-swirl b" />
        <div class="void-core">
          <i class="void-depth" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} class="void-soul-drift-x" style={`--i:${i}`}>
              <span class="void-soul-drift-y">
                <svg class="void-soul" viewBox="0 0 32 52" focusable="false">
                  <path class="void-soul-body" d="M16 3C8 3 5 9 6 16c1 6 6 8 3 16L3 46l10-8-2 11 9-12 1 9c2-8 8-13 7-20-1-5-5-6-3-12C27 8 23 3 16 3Z" />
                  <path class="void-soul-face" d="M10 12c4 0 5 3 3 6-3 0-4-3-3-6Zm12-1c1 4-1 6-4 7-1-3 0-6 4-7Zm-6 9c4 0 4 8 0 10-4-2-4-10 0-10Z" />
                </svg>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Graveyard({ p, side, marks }: ZoneProps & { p: PlayerView }): JSX.Element {
  const top = p.graveyard[p.graveyard.length - 1]
  const tip = t('duel.pileCount', { zone: t('duel.grave'), count: t('viewer.cards', { n: p.graveyard.length }) })
  return (
    <div class={cx('zone pile gy', marks.piles.get(`${side}:gy`))} data-pile="gy" data-side={side} data-count={t('viewer.cards', { n: p.graveyard.length })} data-pile-tip={tip} aria-label={tip} role="button" tabIndex={0} onKeyDown={pileKey}>
      {top && (
        <div class="slot">
          <Card card={cardOf(top)} uid={top.uid} area="gy" side={side} class={cx(side === 'foe' && 'reversed', marks.cards.get(top.uid))} />
        </div>
      )}
      <small>{t('duel.grave')}</small>
    </div>
  )
}

/** Une moitié de terrain. Celle de l'adversaire est en miroir (ses zones de gauche sont à notre droite). */
function Half({ p, side, seat, marks, art }: ZoneProps & { p: PlayerView; seat: Seat; art?: number | null }): JSX.Element {
  const flip = <T,>(a: T[]): T[] => (side === 'foe' ? [...a].reverse() : a)
  const monsters = flip(p.monsters.slice(0, 5).map((m, i) => <MonsterZone key={i} m={m} side={side} marks={marks} keys={[`${seat}:m:${i}`]} />))
  const spells = flip(p.spellTraps.map((z, i) => <SpellTrapZone key={i} z={z} side={side} marks={marks} zk={`${seat}:s:${i}`} />))
  const field = p.fieldZone ? (
    <SpellTrapZone z={p.fieldZone} side={side} marks={marks} zk={`${seat}:s:5`} area="field" />
  ) : (
    <div class={cx('zone sz fieldz', zoneState([`${seat}:s:5`], marks).cls)} data-zk={`${seat}:s:5`} data-place={zoneState([`${seat}:s:5`], marks).place}>
      <small>{t('duel.field')}</small>
    </div>
  )
  const gy = <Graveyard p={p} side={side} marks={marks} />
  const deck = <Pile kind="deck" count={p.deckCount} side={side} label={t('duel.deck')} marks={marks} />
  const extra = <Pile kind="extra" count={p.extra.length} side={side} label={t('duel.extra')} marks={marks} />
  const mrow = (
    <div class="row mrow">
      {side === 'me' ? field : gy}
      {monsters}
      {side === 'me' ? gy : field}
      {side === 'foe' && (
        <div class="direct">
          <Icon name="sword" />
          <span>{t('duel.direct')}</span>
        </div>
      )}
    </div>
  )
  const srow = (
    <div class="row srow">
      {side === 'me' ? extra : deck}
      {spells}
      {side === 'me' ? deck : extra}
    </div>
  )
  return (
    <div class={cx('half', side, art != null && 'has-art')} data-side={side} style={art != null ? `--half-art:url(${imgUrl(art)})` : undefined}>
      {side === 'me' ? [mrow, srow] : [srow, mrow]}
    </div>
  )
}

/** Temps laissé au joueur attendu, sous le nom de la phase (rouge sous 30 secondes). Se met à jour tout seul. */
function PhaseClock({ v }: { v: DuelView }): JSX.Element {
  const [, tick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(timer)
  }, [])
  const c = duel.clock
  const shown = !!c && v.winner === null
  const left = shown && c ? Math.max(0, Math.ceil((c.end - performance.now()) / 1000)) : 0
  const side: Side = c?.seat === v.you && !v.watching ? 'me' : 'foe'
  // L'emplacement reste réservé : le nom de la phase ne bouge pas quand le compte à rebours apparaît.
  return (
    <span class={cx('phase-clock', shown && side, shown && left <= 30 && 'low')} aria-hidden={!shown || undefined}>
      {shown ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''}
    </span>
  )
}

/**
 * Milieu du terrain, toujours une rangée complète : les zones bannies aux bords, le nom de la phase et le temps au centre.
 * Avec les Zones Monstre Extra, les deux zones partagées, au-dessus de nos zones 2 et 4, encadrent la phase ; sans elles, leur place reste vide.
 */
function Middle({ v, marks }: { v: DuelView; marks: Marks }): JSX.Element {
  const foeSeat: Seat = v.you === 0 ? 1 : 0
  const me = v.players[v.you]
  const foe = v.players[foeSeat]
  const gap = <div class="zone gap" />
  // Notre zone extra n°5 est la zone n°6 de l'adversaire, et inversement.
  const cell = (mine: 5 | 6): JSX.Element => {
    if (!v.extraZones) return gap
    const theirs = mine === 5 ? 6 : 5
    const keys = [`${v.you}:m:${mine}`, `${foeSeat}:m:${theirs}`]
    const m = me.monsters[mine] ?? null
    return m ? <MonsterZone m={m} side="me" marks={marks} keys={keys} extra /> : <MonsterZone m={foe.monsters[theirs] ?? null} side="foe" marks={marks} keys={keys} extra />
  }
  return (
    <div class="row midrow">
      <Banished p={foe} side="foe" />
      {gap}
      {cell(5)}
      <div class="zone gap label">
        <em class="phase-name">{PHASE_NAME[v.phase]}</em>
        <PhaseClock v={v} />
      </div>
      {cell(6)}
      {gap}
      <Banished p={me} side="me" />
    </div>
  )
}

function Hand({ p, side, marks }: ZoneProps & { p: PlayerView }): JSX.Element {
  const n = p.hand.length
  // Éventail stable, plus serré chez l’adversaire ; aucun mouvement 3D au pointeur.
  const step = side === 'foe' ? Math.min(2, 16 / Math.max(1, n)) : Math.min(3, 22 / Math.max(1, n))
  const overlap = -Math.min(0.36, 0.2 + Math.max(0, n - 6) * 0.025)
  return (
    <div class={`hand ${side}`} style={`--n:${n}`}>
      {p.hand.map((c, i) => (
        <div class={cx('hcard', c.cardId !== null && 'known', c.cardId !== null && side === 'me' && duel.raised === c.uid && 'raised')} key={c.uid} style={`--a:${((i - (n - 1) / 2) * step).toFixed(2)}deg;--ov:${overlap}`}>
          <div class="hlift">
            <Card card={cardOf(c)} size="md" uid={c.uid} area="hand" side={side} class={cx(side === 'foe' && 'reversed', marks.cards.get(c.uid))} lv={marks.lv.get(c.uid)} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Magie Terrain face recto d'un joueur (identifiant de la carte), sinon null. */
const faceUpField = (p: PlayerView): number | null => (p.fieldZone?.faceUp ? p.fieldZone.card.cardId : null)

/** Mains et tapis. Reconstruit à chaque nouvel état (voir duel.version) : les animations y travaillent librement. */
export function Stage({ v, marks }: { v: DuelView; marks: Marks }): JSX.Element {
  const foeSeat: Seat = v.you === 0 ? 1 : 0
  const me = v.players[v.you]
  const foe = v.players[foeSeat]
  // Une seule Magie Terrain en jeu : son illustration couvre tout le tapis. Une chacun : chacune couvre son côté.
  const presented = duel.fieldCard?.split(':').map(Number)
  const mine = presented ? presented[0] || null : faceUpField(me)
  const theirs = presented ? presented[1] || null : faceUpField(foe)
  const shared = mine !== null && theirs !== null ? null : (mine ?? theirs)
  const split = mine !== null && theirs !== null
  const key = mine === null && theirs === null ? undefined : `${mine ?? 0}:${theirs ?? 0}`
  return (
    <div class="stage">
      <Hand p={foe} side="foe" marks={marks} />
      <div class="mat-wrap">
        <div class={cx('mat', shared !== null && 'has-field')} id="mat" data-field={key} style={shared !== null ? `--field-art:url(${imgUrl(shared)})` : undefined}>
          <Half p={foe} side="foe" seat={foeSeat} marks={marks} art={split ? theirs : null} />
          <Middle v={v} marks={marks} />
          <Half p={me} side="me" seat={v.you} marks={marks} art={split ? mine : null} />
        </div>
      </div>
      <Hand p={me} side="me" marks={marks} />
    </div>
  )
}
