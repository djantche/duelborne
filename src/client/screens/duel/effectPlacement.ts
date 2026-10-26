import { fieldBeforeDraw } from './fieldTransition.ts'
import type { DuelView, GameEvent } from '../../../shared/protocol.ts'
import { redraw } from '../../app/render.ts'
import { duel } from './state.ts'
import { cardAngle, flyTo, sleep, reducedMotion } from './anim.ts'

type Link = Extract<GameEvent, { type: 'chain' }>

/** La pose annoncée par le serveur précède le soulèvement ; aucune destination n'est inventée. */
export async function placeEffectSource(link: Link, next?: DuelView, isCurrent?: () => boolean): Promise<boolean> {
  if (link.uid === null || !next || !duel.view || isCurrent?.() === false) return false
  const current = duel.view
  const sourceSeat = current.players.findIndex((player) => player.hand.some((card) => card.uid === link.uid))
  if (sourceSeat < 0) return false
  let destination: { seat: number; index: number; field: boolean } | undefined
  for (let seat = 0; seat < next.players.length; seat++) {
    const player = next.players[seat]!
    const index = player.spellTraps.findIndex((entry) => entry?.card.uid === link.uid)
    if (index >= 0) destination = { seat, index, field: false }
    if (player.fieldZone?.card.uid === link.uid) destination = { seat, index: 5, field: true }
  }
  if (!destination) return false
  const card = document.querySelector<HTMLElement>(`#app .hand .card[data-uid="${link.uid}"]`)
  if (!card) return false
  const from = card.getBoundingClientRect()
  const fromAngle = cardAngle(card)
  const fromEl = card.cloneNode(true) as HTMLElement
  const players = current.players.map((player) => ({ ...player, hand: player.hand.filter((entry) => entry.uid !== link.uid), spellTraps: [...player.spellTraps] })) as DuelView['players']
  const target = players[destination.seat]!
  if (destination.field) target.fieldZone = next.players[destination.seat]!.fieldZone
  else target.spellTraps[destination.index] = next.players[destination.seat]!.spellTraps[destination.index]!
  // La pose physique d'une carte Terrain ne valide pas encore son décor : l'effet doit se résoudre d'abord.
  duel.fieldCard ??= fieldBeforeDraw()?.key ?? '0:0'
  duel.view = { ...current, players }
  duel.version++
  redraw()
  const placed = document.querySelector<HTMLElement>(`#app .zone .card[data-uid="${link.uid}"]`)
  if (!placed) return false
  await flyTo(placed, from, { motion: 'set', fromAngle, fromEl, fromBack: fromEl.classList.contains('back') })
  if (isCurrent?.() === false) return true
  await sleep(reducedMotion() ? 60 : 160)
  return true
}
