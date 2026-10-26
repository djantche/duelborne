import { resetFieldTransition } from './fieldTransition.ts'
// Chorégraphie : transforme les événements du moteur en animations.
//
// Un nouvel état arrive avec la liste de ce qui vient de se passer. On joue d'abord, sur
// l'ANCIEN plateau, ce qui détruit ou frappe (attaque, éclats, dégâts) : playPre.
// Le plateau est ensuite redessiné, puis playPost anime ce qui est apparu ou a bougé
// (invocations, pioche, changements de position).
import { duel, trackEffect } from './state.ts'
import { duelistName } from './perspective.ts'
import { redraw } from '../../app/render.ts'
import type { DuelView, GameEvent, Seat, SummonKind, Zone } from '../../../shared/protocol.ts'
import {
  EASE_IN,
  EASE_OUT,
  arrow,
  backDom,
  banner,
  resetBanners,
  beam,
  blast,
  hitFlash,
  screenPunch,
  shockwave,
  debris,
  centerOf,
  cardAngle,
  countTo,
  dist,
  flash,
  floatText,
  flipperOf,
  flyCard,
  flyTo,
  ghostOf,
  impact,
  node,
  pillar,
  play,
  ring,
  reducedMotion,
  settle,
  summonSeal,
  turnCard,
  uprightRect,
  uprightOf,
  shake,
  shakeArena,
  crush,
  sleep,
  slash,
  sparks,
  stamp,
  vanishTo,
  vignette,
  vortex,
} from './anim.ts'
import type { Pt } from './anim.ts'
import { cardDom } from '../../ui/Card.tsx'
import { PHASE_NAME } from '../../ui/i18n.ts'
import { flipCoins, rollDice } from './throw.tsx'
import { showdown } from './clash.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { endJingle, sfx } from '../../ui/audio.ts'
import { t as tr, tx } from '../../i18n.ts'
import { esc as escHtml } from '../../ui/cardview.ts'
import { resetReveals, showRevealed } from './reveal.ts'
import { negateCard } from './negation.tsx'
import { chainPresentation } from './chainPresentation.ts'
import { placeEffectSource } from './effectPlacement.ts'
import { fusionSummon } from './fusion.ts'
import { resetSummonPresentation, summonPresentation } from './summon.ts'
import { MOTION } from './motion.ts'
import type { MotionKind } from './motion.ts'

type MoveEvent = Extract<GameEvent, { type: 'move' }>

export interface SeqCtx {
  /** Une navigation a invalidé la séquence : aucune nouvelle scène ne doit démarrer. */
  isCurrent?: () => boolean
  you: Seat
  nextView?: DuelView
  /** Points de vie de départ, pour la jauge. */
  startLp: number
  /** Duel par équipes : c'est le coéquipier qui joue pour notre équipe. */
  spectating: boolean
  watching?: boolean
  cards: Map<number, ClientCard>
}

export interface Snap {
  el: HTMLElement
  rect: DOMRect
  area: string
  side: string
  angle: number
}

const app = document.getElementById('app') as HTMLElement
const cardEl = (uid: number): HTMLElement | null => app.querySelector<HTMLElement>(`.card[data-uid="${uid}"]`)

/**
 * Magie ou Piège posée face verso qui s'active : elle se retourne d'abord sur place, pour que le soulèvement et la lueur
 * montrent sa face. Le redessin de l'état suivant la garde face recto.
 */
async function revealSetSource(uid: number | null, data: ClientCard, isCurrent?: () => boolean): Promise<void> {
  if (uid === null || isCurrent?.() === false) return
  const card = cardEl(uid)
  if (!card?.classList.contains('back') || !card.closest('.zone') || (card.dataset.area !== 'st' && card.dataset.area !== 'field')) return
  sfx('flip')
  const before = card.cloneNode(true) as HTMLElement
  const size = card.classList.contains('md') ? 'md' : 'sm'
  const keep = [...card.classList].filter((c) => !['card', 'sm', 'md', 'lg', 'back'].includes(c)).join(' ')
  card.replaceWith(cardDom(data, { uid, area: card.dataset.area, side: card.dataset.side, size, class: keep }))
  const fresh = cardEl(uid)
  if (fresh) await turnCard(fresh, before, cardAngle(before))
}
const one = (sel: string): HTMLElement | null => app.querySelector<HTMLElement>(sel)
const sideOf = (ctx: SeqCtx, p: Seat): 'me' | 'foe' => (p === ctx.you ? 'me' : 'foe')

/** ATK / DEF affichées avant le redessin, pour animer les changements. */
let statsBefore = new Map<number, string>()

/** Position de toutes les cartes visibles, relevée juste avant de redessiner le plateau. */
export function snapshot(): Map<number, Snap> {
  const map = new Map<number, Snap>()
  statsBefore = new Map()
  for (const el of app.querySelectorAll<HTMLElement>('.card[data-uid]')) {
    const uid = Number(el.dataset.uid)
    map.set(uid, { el, rect: el.getBoundingClientRect(), area: el.dataset.area ?? '', side: el.dataset.side ?? '', angle: cardAngle(el) })
    const stats = el.closest('.zone')?.querySelector('.statline')?.textContent
    if (stats) statsBefore.set(uid, stats)
  }
  return map
}

/**
 * Mélange de la main : chaque carte se retourne, toutes se rassemblent en un paquet, se coupent en deux tas qui
 * s'entrecroisent (deux fois), puis restent empilées jusqu'à ce que la nouvelle main soit distribuée (voir playPost).
 */
async function shuffleHandOut(side: string): Promise<boolean> {
  const hand = one(`.hand.${side}`)
  // Les cartes qui viennent d'atterrir à l'extrémité de la main (retour en main) entrent dans le mélange avec les autres.
  const arrivals = landed.get(side) ?? []
  landed.delete(side)
  const cards = hand ? [...hand.querySelectorAll<HTMLElement>('.hcard .card')] : []
  if (!hand || cards.length + arrivals.length < 2) return false
  const mid = centerOf(hand.getBoundingClientRect())
  const jobs: Promise<void>[] = []
  const ghosts: HTMLElement[] = []
  const items = [...cards.map((card) => ({ card, r: uprightRect(card.getBoundingClientRect(), cardAngle(card)), angle: cardAngle(card), real: true })), ...arrivals.map((a) => ({ card: a.card, r: a.rect, angle: a.angle, real: false }))]
  const n = items.length
  items.forEach(({ card, r, angle, real }, i) => {
    const c = centerOf(r)
    const f = flipperOf(uprightOf(card), backDom(), r)
    const base = side === 'foe' ? 180 : 0
    ghosts.push(f.g)
    f.g.style.perspective = '900px'
    if (real) card.style.visibility = 'hidden'
    const gx = mid.x - c.x
    const gy = mid.y - c.y - 10
    const left = i % 2 === 0
    const k = Math.floor(i / 2)
    const stack = `translate(${gx}px,${gy - k * 1.6}px) scale(.92) rotate(${base}deg)`
    const split = (dir: number): string => `translate(${gx + dir * r.width * 0.7}px,${gy + dir * 8}px) scale(.92) rotate(${base + dir * 11}deg)`
    const delay = (i / n) * 140
    jobs.push(
      play(
        f.g,
        [
          { transform: `rotate(${angle}deg)`, offset: 0 },
          { transform: `translate(${gx * 0.5}px,${gy * 0.5 - 40}px) scale(1.05) rotate(${base + (left ? -6 : 6)}deg)`, offset: 0.16 },
          { transform: stack, offset: 0.3 },
          { transform: split(left ? -1 : 1), offset: 0.46 },
          { transform: `translate(${gx}px,${gy - (left ? n : 0) * 0.6 - k * 1.6}px) scale(.92) rotate(${base}deg)`, offset: 0.62 },
          { transform: split(left ? 1 : -1), offset: 0.78 },
          { transform: stack, offset: 0.92 },
          { transform: stack, offset: 1 },
        ],
        { duration: 1120, delay, easing: 'ease-in-out', fill: 'forwards' },
      ),
    )
    jobs.push(play(f.inner, [{ transform: 'rotateY(0deg)', offset: 0 }, { transform: 'rotateY(180deg)', offset: 0.2 }, { transform: 'rotateY(180deg)', offset: 1 }], { duration: 1120, delay, easing: 'ease-in-out', fill: 'forwards' }))
  })
  sfx('shuffle')
  setTimeout(() => sfx('shuffle', { gap: 0 }), 480)
  setTimeout(() => sfx('shuffle', { gap: 0 }), 900)
  await Promise.all(jobs)
  ghosts.forEach((g) => g.remove())
  return true
}

/** Cartes qui viennent d'atterrir à l'extrémité d'une main (par côté), en attendant le mélange de cette main. */
const landed = new Map<string, { card: HTMLElement; rect: DOMRect; angle: number }[]>()

/** Place d'une carte qui s'ajoute à la main, à son extrémité : dans le prolongement de l'éventail (n : rang d'arrivée du lot). */
function handTail(side: string, like: DOMRect, n: number): DOMRect {
  const hand = one(`.hand.${side}`)
  if (!hand) return like
  const cards = [...hand.querySelectorAll<HTMLElement>('.hcard .card')]
  const last = cards[cards.length - 1]
  const prev = cards[cards.length - 2]
  const w = last?.offsetWidth || like.width
  const h = last?.offsetHeight || like.height
  let c = centerOf(hand.getBoundingClientRect())
  if (last) {
    const a = centerOf(last.getBoundingClientRect())
    const b = prev ? centerOf(prev.getBoundingClientRect()) : { x: a.x - w * 0.6, y: a.y }
    c = { x: a.x + (a.x - b.x) * (n + 1), y: a.y + (a.y - b.y) * (n + 1) }
  }
  // La main adverse est volontairement partiellement hors écran : respecter son éventail.
  c = { x: Math.max(w * 0.15, Math.min(innerWidth - w * 0.15, c.x)), y: Math.max(-h * 0.8, Math.min(innerHeight + h * 0.8, c.y)) }
  return new DOMRect(c.x - w / 2, c.y - h / 2, w, h)
}

/** Mélange d'un Deck : quelques cartes s'écartent de la pile de part et d'autre, puis y reviennent. */
async function riffle(side: string): Promise<void> {
  const pile = pileRect('deck', side)
  if (!pile) return
  const rect = cardRectAt(pile)
  const jobs: Promise<void>[] = []
  for (let i = 0; i < 8; i++) {
    const g = ghostCard(null, rect)
    g.querySelector('.card')?.classList.toggle('reversed', side === 'foe')
    const dir = i % 2 ? 1 : -1
    const dx = dir * rect.width * (0.5 + (i % 3) * 0.14)
    g.style.filter = 'drop-shadow(0 8px 10px rgba(0,0,0,.5))'
    jobs.push(
      play(
        g,
        [
          { transform: `translateY(${-i * 0.7}px)` },
          { transform: `translate(${dx}px,${-14 - i * 2}px) rotate(${dir * (7 + i * 2)}deg)`, offset: 0.26 },
          { transform: `translate(${-dx * 0.6}px,${-6 - i}px) rotate(${-dir * 7}deg)`, offset: 0.58 },
          { transform: `translateY(${-i * 0.7}px) rotate(0deg)`, offset: 0.86 },
          { transform: 'none' },
        ],
        { duration: 680, delay: i * 30, easing: 'ease-in-out' },
      ).then(() => g.remove()),
    )
  }
  await Promise.all(jobs)
  ring(centerOf(rect), '#c9d6ff', rect.height * 1.1, 320)
}

/** Centre d'un élément dans le repère du tapis (insensible à l'inclinaison 3D). */
function matPos(el: HTMLElement): Pt {
  let x = el.offsetWidth / 2
  let y = el.offsetHeight / 2
  let n: HTMLElement | null = el
  while (n && !n.classList.contains('mat')) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent as HTMLElement | null
  }
  return { x, y }
}

// ───────────────────────────── Avant le redessin ─────────────────────────────

const LIFT = 'translate3d(0,0,48px) scale(1.08)'

/**
 * Une attaque déclarée peut rester en suspens le temps que l'adversaire décide de répondre (le
 * plateau est alors redessiné entre-temps). On garde donc la flèche et l'attaquant soulevé jusqu'au
 * choc, ou jusqu'à ce que l'attaque n'ait plus lieu.
 */
let pendingAim: ReturnType<typeof arrow> | null = null
let pendingAttacker: number | null = null

/** Maillons de la chaîne (rang → carte), conservés après la résolution pour identifier une annulation annoncée ensuite. */
const chainLinks = new Map<number, Extract<GameEvent, { type: 'chain' }>>()

/** La barre de chaîne suit la séquence : un maillon y entre dès son activation. */
function showChainLink(link: Extract<GameEvent, { type: 'chain' }>): void {
  const before = link.index === 1 ? [] : (duel.chainShown ?? duel.view?.chain ?? []).slice(0, link.index - 1)
  duel.chainShown = [...before, { cardId: link.cardId, seat: link.player }]
  duel.chainUids = [...duel.chainUids.slice(0, link.index - 1), link.uid]
  duel.chainLong = duel.chainShown.length >= 2
  redraw()
}

/** Quand le maillon `index` commence à se résoudre, les maillons suivants ont fini leur effet : ils quittent la barre. */
function settleChainLinks(index: number): void {
  const shown = duel.chainShown ?? duel.view?.chain ?? []
  if (shown.length >= 2) duel.chainLong = true
  duel.chainUids = duel.chainUids.slice(0, index - 1)
  if (shown.length <= index) return redraw()
  duel.chainShown = shown.slice(0, index)
  redraw()
}

/** La fiche de la carte dont l'effet agit s'affiche (sauf si le joueur en a épinglé une autre), son effet surligné. */
function showEffect(link: Extract<GameEvent, { type: 'chain' }>): void {
  duel.activeEffect = { cardId: link.cardId, uid: link.uid, n: link.effect ?? 0, label: link.label, index: link.index }
  if (!duel.pinned && !duel.sheet) {
    duel.focusId = link.cardId
    duel.focusUid = link.uid
  }
  redraw()
}

const pileRect = (kind: 'deck' | 'gy' | 'extra' | 'void', side: string): DOMRect | null => one(`.pile.${kind}[data-side="${side}"]`)?.getBoundingClientRect() ?? null
/** Pile d'une zone (les cartes bannies sont englouties par la zone des ténèbres, sinon près du Cimetière quand il n'y a pas la place). */
const pileOfZone = (zone: Zone, side: string): DOMRect | null => (zone === 'deck' ? pileRect('deck', side) : zone === 'extra' ? pileRect('extra', side) : zone === 'banished' ? (pileRect('void', side) ?? pileRect('gy', side)) : zone === 'graveyard' ? pileRect('gy', side) : null)

/** Copie flottante d'une carte à l'emplacement `rect` : face visible si on la connaît, dos sinon. */
function ghostCard(data: ClientCard | null, rect: DOMRect, from?: HTMLElement | null): HTMLElement {
  if (from && !from.classList.contains('back')) return ghostOf(from, rect)
  return ghostOf(cardDom(data, { size: 'md' }), rect)
}

/** Rectangle d'une carte de terrain centré sur une pile (les piles sont des zones carrées, un peu plus grandes que la carte). */
function cardRectAt(pile: DOMRect): DOMRect {
  const h = pile.height * 0.935
  const w = h * 0.686
  const c = centerOf(pile)
  return new DOMRect(c.x - w / 2, c.y - h / 2, w, h)
}

function clearPendingAttack(): void {
  pendingAim?.remove()
  pendingAim = null
  pendingAttacker = null
}

/** Quitter une partie ne laisse ni flèche, ni carte flottante, ni scène à rejouer dans la suivante. */
export function resetSequence(): void {
  resetSummonPresentation()
  resetFieldTransition()
  chainPresentation.reset()
  document.querySelectorAll('.fusion-pending').forEach((zone) => zone.classList.remove('fusion-pending'))
  resetReveals()
  resetBanners()
  clearPendingAttack()
  chainLinks.clear()
  duel.chainShown = null
  duel.chainUids = []
  duel.chainLong = false
  landed.clear()
  statsBefore.clear()
  for (const el of document.querySelectorAll<HTMLElement>('#fx > *, #ui > :not(#ui-root), body > .activation-stage')) {
    for (const animation of el.getAnimations({ subtree: true })) animation.cancel()
    el.remove()
  }
}

/** Mise en scène d'un déplacement de carte (défausse, bannissement, retour dans le Deck...). Le terrain est encore celui d'avant. */
async function moveCard(e: MoveEvent, delay: number, ctx: SeqCtx, handled: Set<number>, toHandNow = false, arrival = 0): Promise<void> {
  if (delay) await sleep(delay)
  const side = sideOf(ctx, e.player)
  const destinationSide = sideOf(ctx, e.toPlayer ?? e.player)
  const el = e.uid === null ? null : cardEl(e.uid)
  const knownId = e.cardId ?? (el && !el.classList.contains('back') ? Number(el.dataset.card) : null)
  const data = knownId === null ? null : (ctx.cards.get(knownId) ?? null)
  const fromPile = pileOfZone(e.from, side)
  // Un matériel Xyz qui se détache part du monstre qui le portait.
  const holderId = e.fromHolder ?? e.into
  const holderEl = e.from === 'overlay' && holderId !== undefined ? cardEl(holderId) : null
  // La carte détachée part de sa place sous le monstre (le matériel couché), sinon du monstre lui-même.
  const matEl = holderEl && e.cardId !== null ? (holderEl.closest('.zone')?.querySelector<HTMLElement>(`.xyz-mat[data-card="${e.cardId}"]`) ?? holderEl.closest('.zone')?.querySelector<HTMLElement>('.xyz-mat')) : null
  const holder = (matEl ?? holderEl)?.getBoundingClientRect() ?? null
  const r0 = el ? el.getBoundingClientRect() : (holder ?? (fromPile ? cardRectAt(fromPile) : null))
  // Le fantôme porte l'orientation du départ ; les deux faces restent dessinées debout.
  const fromAngle = el ? cardAngle(el) : matEl ? (side === 'foe' ? 270 : 90) : holderEl ? cardAngle(holderEl) : side === 'foe' ? 180 : 0
  const src = r0 ? uprightRect(r0, fromAngle) : null
  const toPile = e.how === 'toHand' || e.how === 'material' ? null : pileOfZone(e.to, destinationSide)
  const receiver = e.how === 'material' && e.into !== undefined ? cardEl(e.into) : null
  const receiverZone = e.intoIndex !== undefined ? one(`.zone[data-zk~="${e.toPlayer ?? e.player}:m:${e.intoIndex}"]`) : null
  const targetAngle = e.how === 'material' ? destinationSide === 'foe' ? 270 : 90 : receiver ? cardAngle(receiver) : destinationSide === 'foe' ? 180 : 0
  // Le porteur peut encore être dans l'Extra Deck : viser sa zone d'arrivée, pas sa carte de départ.
  const materialBase = receiverZone ? cardRectAt(receiverZone.getBoundingClientRect()) : receiver?.closest('.zone') ? uprightRect(receiver.getBoundingClientRect(), cardAngle(receiver)) : null
  const target = e.how === 'material' && materialBase ? new DOMRect(materialBase.left + materialBase.width * .07, materialBase.top + materialBase.height * .17, materialBase.width * .86, materialBase.height * .86) : toPile ? cardRectAt(toPile) : null
  const color = MOTION[e.how].color
  if (!src) return
  const from = centerOf(src)

  // Retour en main / ajout en main. Deux cas :
  //  • la main va se mélanger juste après (le moteur l'annonce, et rend alors toutes ses cartes méconnaissables) : la
  //    carte vole ICI, avant le mélange, jusqu'à l'extrémité de la main, comme une pioche, puis rejoint le paquet ;
  //  • sinon, la carte garde son identité : le vol est joué après le redessin (playPost), vers sa vraie place.
  if (e.how === 'toHand') {
    sfx('draw')
    ring(from, color, 170, 420)
    if (!toHandNow) {
      return
    }
    const slot = handTail(destinationSide, src, arrival)
    // Ce qu'on voit au départ : la face si on la connaît (terrain, Cimetière, cartes bannies), un dos sinon (Deck, carte cachée).
    const faceUp = el ? !el.classList.contains('back') : data !== null
    const face = el ? uprightOf(el) : data ? cardDom(data, { size: 'md' }) : backDom()
    // La main de l'adversaire se voit de dos ; la nôtre garde la face qu'on connaît.
    const flip = faceUp && destinationSide === 'foe'
    const resting = flip || !faceUp ? backDom() : face
    const lander = flip ? flipperOf(face, resting, slot) : ghostOf(face, slot)
    if (el) {
      el.style.visibility = 'hidden'
      if (e.uid !== null) handled.add(e.uid)
    }
    await flyCard(lander, src, slot, { motion: 'toHand', fromAngle, toAngle: destinationSide === 'foe' ? 180 : 0, flip })
    ;(lander instanceof HTMLElement ? lander : lander.g).remove()
    // Elle reste à l'extrémité de la main (posée comme une carte de la main) jusqu'au mélange.
    landed.set(destinationSide, [...(landed.get(destinationSide) ?? []), { card: resting, rect: slot, angle: destinationSide === 'foe' ? 180 : 0 }])
    return
  }
  const dst = target ?? new DOMRect(src.left, src.top - 40, src.width, src.height)

  // Face de départ : celle de la carte sur le terrain ; une carte sortie d'une pile est un dos (Deck, Extra Deck) ou une face (Cimetière).
  const startsBack = el ? el.classList.contains('back') : !(e.fromFaceUp ?? false) && (e.from === 'deck' || e.from === 'extra' || data === null)
  const startEl = el ? uprightOf(el) : startsBack ? backDom() : cardDom(data, { size: 'md' })
  // Face d'arrivée : le Cimetière et les cartes bannies montrent la carte ; le Deck et l'Extra Deck, un dos.
  const endsFaceUp = (e.faceUp ?? (e.to === 'graveyard' || e.to === 'banished')) && data !== null
  const endsBack = e.how === 'material' ? data === null : !endsFaceUp
  const flip = startsBack !== endsBack
  const endEl = endsBack ? backDom() : e.how === 'material' ? startEl : cardDom(data, { size: 'md' })
  const lander = flip ? flipperOf(startEl, endEl, dst) : ghostOf(startEl, dst)
  if (el) {
    el.style.visibility = 'hidden'
    handled.add(e.uid as number)
  }
  if (matEl) matEl.style.visibility = 'hidden'
  const zone = toPile ? (one(`.pile[data-side="${destinationSide}"][data-pile="${e.to === 'graveyard' ? 'gy' : e.to}"]`) ?? (e.to === 'banished' ? one(`.pile.gy[data-side="${destinationSide}"]`) : null)) : null
  if (holderEl) {
    ring(from, '#ffe9a8', Math.max(src.width, src.height) * 1.4, 420)
    const chip = holderEl.closest('.zone')?.querySelector('.mats')
    if (chip) void play(chip, [{ scale: '1.5', filter: 'brightness(2)' }, { scale: '1', filter: 'none' }], { duration: 360 })
  }
  const fly = (impact = true): Promise<void> => flyCard(lander, src, dst, { motion: e.how, fromAngle, toAngle: targetAngle, flip, zone, impact })
  const done = (): void => (lander instanceof HTMLElement ? lander : lander.g).remove()

  switch (e.how) {
    case 'discard':
      sfx('carddrop')
      ring(from, color, 170, 420)
      void floatText({ x: from.x, y: src.top - 12 }, tr('fx.discard'), 'lose', { rise: 22, duration: 900 })
      await fly()
      sparks(centerOf(dst), color, 10, 0.7)
      break
    case 'mill':
      sfx('carddrop')
      ring(from, color, 150, 380)
      await fly()
      sparks(centerOf(dst), color, 10, 0.7)
      break
    case 'banish': {
      sfx('banished')
      vortex(from, color, Math.max(src.width, src.height) * 1.8, 640)
      flash(from, color, 220, 400)
      void floatText({ x: from.x, y: src.top - 12 }, tr('fx.banished'), 'cnt', { rise: 22, duration: 900 })
      await fly()
      // Au bord du gouffre, la carte tourne en spirale en rapetissant et disparaît : la zone des ténèbres flambe quand elle l'avale.
      vortex(centerOf(dst), '#8a5cff', Math.max(dst.width, dst.height) * 1.7, 620)
      const hole = one(`.pile.void[data-side="${destinationSide}"]`)
      hole?.classList.add('swallow')
      window.setTimeout(() => hole?.classList.remove('swallow'), 900)
      await play(lander instanceof HTMLElement ? lander : lander.g, [{ transform: `rotate(${targetAngle}deg) scale(1)`, opacity: 1 }, { transform: `rotate(${targetAngle + 200}deg) scale(.6)`, opacity: 0.9, offset: 0.5, filter: 'brightness(.7) hue-rotate(220deg)' }, { transform: `rotate(${targetAngle + 540}deg) scale(.04)`, opacity: 0, filter: 'brightness(.2) hue-rotate(260deg)' }], { duration: 620, easing: 'cubic-bezier(.55,0,.8,.4)' })
      break
    }
    case 'toDeck':
    case 'toExtra':
      sfx('shuffle')
      ring(from, color, 150, 380)
      await fly()
      ring(centerOf(dst), color, Math.max(dst.width, dst.height) * 1.25, 420)
      sparks(centerOf(dst), color, 8, 0.6)
      break
    case 'material':
      sfx('equip', { volume: 0.7 })
      void beam(from, centerOf(dst), color, 380)
      vortex(centerOf(dst), color, Math.max(dst.width, dst.height) * 1.4, 560)
      await fly(false)
      await play(lander instanceof HTMLElement ? lander : lander.g, [{ transform: `rotate(${targetAngle}deg)`, opacity: 1 }, { transform: `rotate(${targetAngle}deg)`, opacity: 0 }], { duration: 260, easing: 'ease-in' })
      break
    default:
      // Envoyée au Cimetière (coût, effet) : elle se détache, se retourne si elle était face verso, et se pose sur la pile.
      sfx('carddrop')
      await fly()
      sparks(centerOf(dst), color, 8, 0.6)
  }
  done()
}

export async function playPre(events: GameEvent[], ctx: SeqCtx): Promise<Set<number>> {
  /** Cartes dont la disparition a déjà été animée ici. */
  const handled = new Set<number>()
  const preannounced = new Set<number>()
  const announce = async (link: Extract<GameEvent, { type: 'chain' }>): Promise<void> => {
    if (link.index === 1) chainLinks.clear()
    chainLinks.set(link.index, link)
    const data = ctx.cards.get(link.cardId)
    if (!data) {
      showChainLink(link)
      trackEffect(link)
      showEffect(link)
      return
    }
    if (await placeEffectSource(link, ctx.nextView, ctx.isCurrent) && link.uid !== null) handled.add(link.uid)
    if (ctx.isCurrent?.() === false) return
    await revealSetSource(link.uid, data, ctx.isCurrent)
    if (ctx.isCurrent?.() === false) return
    await chainPresentation.activate(link, data, ctx.you, ctx.isCurrent, () => {
      sfx(link.index > 1 ? 'chain' : 'activate')
      showChainLink(link)
      trackEffect(link)
      showEffect(link)
    })
  }
  const arena = one('.arena') ?? app
  let lastImpact: Pt | null = null
  // Nouveau tour, nouvelle phase ou nouvelle attaque : l'attaque en suspens n'est plus d'actualité.
  if (events.some((e) => e.type === 'turn' || e.type === 'phase' || e.type === 'attack')) clearPendingAttack()
  for (const event of events) if (event.type === 'turn' || event.type === 'start') {
    chainPresentation.reset()
    chainLinks.clear()
    trackEffect(event)
  }
  landed.clear()
  // Les mains que le moteur mélange dans ce lot (une carte qui y rentre vole avant le mélange).
  const shuffling = new Set(events.some((e) => e.type === 'start') ? [] : events.flatMap((e) => (e.type === 'shuffle' ? [sideOf(ctx, e.player)] : [])))

  for (let i = 0; i < events.length; i++) {
    if (ctx.isCurrent?.() === false) break
    const e = events[i] as GameEvent
    const movingUid = 'uid' in e ? e.uid : null
    if (movingUid !== null && (e.type === 'tribute' || e.type === 'destroy' || (e.type === 'move' && !['toField', 'create', 'toHand'].includes(e.how)))) {
      const activation = events.slice(i + 1).find((later): later is Extract<GameEvent, { type: 'chain' }> => later.type === 'chain' && later.uid === movingUid && !preannounced.has(later.index))
      if (activation) { await announce(activation); preannounced.add(activation.index) }
      if (ctx.isCurrent?.() === false) return handled
    }

    switch (e.type) {
      // ── Déclaration d'attaque : l'attaquant se soulève et vise sa cible ──
      case 'attack': {
        const card = cardEl(e.attackerUid)
        const slot = card?.parentElement
        if (!card || !slot) break
        slot.classList.add('attacking')
        const target = e.targetUid === null ? null : cardEl(e.targetUid)
        const victimHalf = one(`.half[data-side="${sideOf(ctx, e.player) === 'me' ? 'foe' : 'me'}"] .mrow`)
        const to = target ? centerOf(target.getBoundingClientRect()) : victimHalf ? centerOf(victimHalf.getBoundingClientRect()) : null
        target?.classList.add('aimed')
        if (!reducedMotion()) await play(slot, [{ transform: 'translate3d(0,0,0) scale(1)' }, { transform: LIFT }], { duration: 220, easing: EASE_OUT, fill: 'forwards' })
        if (to) {
          pendingAim = arrow(centerOf(card.getBoundingClientRect()))
          pendingAim.aim(to, true)
        }
        pendingAttacker = e.attackerUid
        await sleep(reducedMotion() ? 100 : 340)
        break
      }

      // ── Monstre face verso attaqué : il se retourne ──
      case 'flip': {
        const card = cardEl(e.uid)
        const data = ctx.cards.get(e.cardId)
        if (!card || !data) break
        sfx('flip')
        const before = card.cloneNode(true) as HTMLElement
        card.replaceWith(cardDom(data, { uid: e.uid, area: 'monster', side: card.dataset.side, class: `rot aimed${card.classList.contains('reversed') ? ' reversed' : ''}` }))
        const fresh = cardEl(e.uid)
        if (fresh) await turnCard(fresh, before, cardAngle(before))
        break
      }

      // ── Le choc ──
      case 'battle': {
        const card = cardEl(e.attackerUid)
        const slot = card?.parentElement
        if (!card || !slot) break
        const target = e.targetUid === null ? null : cardEl(e.targetUid)
        const mine = card.dataset.side === 'me'
        const victimRow = one(`.half[data-side="${mine ? 'foe' : 'me'}"] .mrow`)
        const goal = target?.parentElement ?? victimRow
        const from = matPos(slot)
        const g = goal ? matPos(goal) : from
        // Attaque directe : on fonce droit devant, à peine recentré.
        const dx = target ? g.x - from.x : (g.x - from.x) * 0.3
        const dy = g.y - from.y
        const reach = target ? 0.72 : 0.95
        const reduced = reducedMotion()
        const power = Math.min(2.1, 0.7 + e.attackerValue / 3200) * (e.targetUid === null ? 1.1 : 1)
        const contact = `translate3d(${dx * reach}px,${dy * reach}px,26px) scale(1.1)`

        // La flèche de visée disparaît quand l'attaquant s'élance.
        clearPendingAttack()
        slot.classList.remove('held')
        const attackFrom = centerOf(card.getBoundingClientRect())
        const attackTo = goal ? centerOf(goal.getBoundingClientRect()) : attackFrom
        if (!reduced) {
          // Le recul laisse lire la force emmagasinée, puis la carte accélère jusqu'au contact.
          const windup = `translate3d(${-dx * 0.14}px,${-dy * 0.14}px,68px) scale(1.16)`
          await play(slot, [
            { transform: LIFT },
            { transform: windup },
          ], { duration: 180, easing: EASE_OUT, fill: 'forwards' })
          void beam(attackFrom, attackTo, mine ? '#ffbf73' : '#ff9686', 170)
          await play(slot, [{ transform: windup }, { transform: contact }], { duration: 155, easing: EASE_IN, fill: 'forwards' })
        }
        target?.classList.remove('aimed')

        const aRect = card.getBoundingClientRect()
        const tRect = target?.getBoundingClientRect() ?? victimRow?.getBoundingClientRect() ?? aRect
        const a = centerOf(aRect)
        const t = centerOf(tRect)
        const hit: Pt = target ? { x: t.x + (a.x - t.x) * 0.3, y: t.y + (a.y - t.y) * 0.3 } : t
        lastImpact = hit

        slot.closest('.zone')?.classList.add('incoming')
        target?.closest('.zone')?.classList.add('incoming')
        const blocked = e.targetPosition === 'def' && e.targetValue !== null && e.attackerValue <= e.targetValue
        sfx(e.targetUid === null ? 'directattack' : 'attack')
        if (reduced) {
          ring(hit, blocked ? '#6cc6ff' : '#ffb347', 100, 180)
        } else if (blocked) {
          // Défense qui tient : bouclier bleu plutôt qu'explosion.
          flash(hit, '#bfe6ff', 240)
          shockwave(hit, '#6cc6ff', 300, 520)
          ring(hit, '#6cc6ff', 260)
          ring(hit, '#6cc6ff', 170, 380)
          sparks(hit, '#9fdcff', 12, 0.8)
          debris(hit, '#bfe6ff', 8, 0.7)
          screenPunch(0.65)
        } else {
          // Plus l'attaque est forte, plus le choc est fort (2000 ATK : ordinaire ; 4000 et plus : le plateau tremble).
          impact(hit, { big: e.targetUid === null, color: mine ? '#ffb347' : '#ff6b5a', power, angle: Math.atan2(attackTo.y - attackFrom.y, attackTo.x - attackFrom.x) * 180 / Math.PI })
        }
        shake(arena, blocked ? 5 : Math.min(19, 8 + power * 4))
        const tslot = target?.parentElement
        if (tslot && !reduced) {
          const recoil = blocked ? 0.025 : Math.min(0.12, 0.055 * power)
          const pushed = `translate3d(${dx * recoil}px,${dy * recoil}px,0) rotate(${(dx >= 0 ? 1 : -1) * (blocked ? 2 : 6)}deg) scale(${blocked ? 0.97 : 0.9})`
          void play(tslot, [
            { transform: 'none' },
            { transform: pushed, offset: 0.12 },
            { transform: pushed, offset: 0.3 },
            { transform: 'scale(1.035)', offset: 0.66 },
            { transform: 'none' },
          ], { duration: 460, easing: EASE_OUT })
        }
        // Un instant d'arrêt : le choc a le temps d'être vu avant que les valeurs s'affichent.
        await sleep(reduced ? 40 : blocked ? 75 : Math.min(155, 85 + power * 25))

        // Valeurs comparées, affichées au-dessus de chaque carte.
        const cmp = e.targetValue === null ? 1 : Math.sign(e.attackerValue - e.targetValue)
        // Les deux valeurs s'affichent de part et d'autre du point d'impact, côté attaquant / côté cible.
        const dir = dx >= 0 ? 1 : -1
        const labelY = Math.min(aRect.top, tRect.top) - 18
        const gap = target ? 84 : 0
        void floatText({ x: hit.x - dir * gap, y: labelY }, `<small>${tr('card.atk')}</small>${e.attackerValue}`, cmp > 0 ? 'win' : cmp < 0 ? 'lose' : 'tie', { rise: 26, duration: 1300 })
        if (target && e.targetValue !== null) {
          const label = e.targetPosition === 'def' ? tr('card.def') : tr('card.atk')
          void floatText({ x: hit.x + dir * gap, y: labelY }, `<small>${label}</small>${e.targetValue}`, cmp < 0 || (cmp === 0 && e.targetPosition === 'def') ? 'win' : cmp > 0 ? 'lose' : 'tie', { rise: 26, duration: 1300 })
        }

        await sleep(reduced ? 80 : 140)
        if (!reduced) await play(slot, [
          { transform: contact },
          { transform: `translate3d(${-dx * 0.025}px,${-dy * 0.025}px,6px) scale(.985)`, offset: 0.8 },
          { transform: 'translate3d(0,0,0) scale(1)' },
        ], { duration: 340, easing: EASE_OUT })
        settle(slot)
        slot.classList.remove('attacking')
        break
      }

      // ── Destruction : la carte éclate sur place, puis file se poser sur sa pile. Les destructions simultanées (Trou Noir…) partent ensemble ──
      case 'destroy': {
        const group: Extract<GameEvent, { type: 'destroy' }>[] = []
        let j = i
        while (events[j]?.type === 'destroy') group.push(events[j++] as Extract<GameEvent, { type: 'destroy' }>)
        i = j - 1
        const battle = events.some((x) => x.type === 'battle')
        await Promise.all(
          group.map(async (d, n) => {
            await sleep(reducedMotion() ? 0 : Math.min(n, 4) * 45)
            const card = cardEl(d.uid)
            if (!card) return
            sfx('destroyed', { gap: 60 })
            await crush(card, n === 0 && !battle ? () => {
              // Un seul choc d'ensemble, synchronisé avec la rupture du premier groupe de fragments.
              const power = Math.min(1.5, 0.85 + group.length * 0.12)
              screenPunch(power)
              shake(arena, 7 * power)
              hitFlash(0.65)
            } : undefined)
            if (ctx.cards.get(d.cardId)?.frameType === 'token') {
              await play(card, [{ opacity: 1, filter: 'brightness(2)' }, { opacity: 0, filter: 'brightness(3) blur(5px)' }], { duration: 300, fill: 'forwards' })
              handled.add(d.uid)
              return
            }
            const to = d.to ?? 'graveyard'
            const how = to === 'banished' ? 'banish' : to === 'deck' ? 'toDeck' : to === 'extra' ? 'toExtra' : to === 'hand' ? 'toHand' : 'toGrave'
            await moveCard({ type: 'move', player: d.player, toPlayer: d.toPlayer, faceUp: d.faceUp, uid: d.uid, cardId: d.cardId, from: card.dataset.area === 'st' || card.dataset.area === 'field' ? 'spellTrap' : 'monster', to, how }, 0, ctx, handled, to === 'hand' && shuffling.has(sideOf(ctx, d.toPlayer ?? d.player)), n)
            // Une carte qui rentre en main vole après le redessin, vers sa vraie place (playPost).
            if (to !== 'hand') handled.add(d.uid)
          }),
        )
        break
      }

      // ── Tribut : la carte se dissout en lumière ──
      case 'tribute': {
        const card = cardEl(e.uid)
        if (!card) break
        const c = centerOf(card.getBoundingClientRect())
        sfx('banished', { volume: 0.7 })
        ring(c, '#ffd76a', 200)
        summonSeal(c, card.getBoundingClientRect().height * 1.8, '#ffe9a8', undefined, 620)
        sparks(c, '#ffe9a8', 12, 0.7)
        await play(card, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.7)', offset: 0.6 }, { filter: 'brightness(1.3)' }], { duration: 280, easing: 'ease-in' })
        const to = e.to ?? 'graveyard'
        const how = to === 'banished' ? 'banish' : to === 'deck' ? 'toDeck' : to === 'extra' ? 'toExtra' : to === 'hand' ? 'toHand' : 'toGrave'
        const data = ctx.cards.get(Number(card.dataset.card))
        if (data?.frameType === 'token') {
          handled.add(e.uid)
          await play(card, [{ opacity: 1 }, { opacity: 0, translate: '0 -30px', filter: 'brightness(3) blur(4px)' }], { duration: 320, fill: 'forwards' })
        } else await moveCard({ type: 'move', player: e.player, toPlayer: e.toPlayer, faceUp: e.faceUp, uid: e.uid, cardId: data?.id ?? null, from: 'monster', to, how }, 0, ctx, handled, to === 'hand' && shuffling.has(sideOf(ctx, e.toPlayer ?? e.player)))
        card.closest('.zone')?.classList.add('incoming')
        break
      }

      // ── Activation : aperçu public de la carte sur le terrain ──
      case 'chain': {
        if (!preannounced.has(e.index)) await announce(e)
        break
      }

      // ── Résolution : même aperçu, avant les conséquences de l’effet ──
      case 'chainResolve': {
        settleChainLinks(e.index)
        const link = chainLinks.get(e.index)
        const data = link ? ctx.cards.get(link.cardId) : undefined
        if (!link || !data) {
          await chainPresentation.resolve(e.index, ctx.isCurrent)
          trackEffect(e)
          redraw()
          break
        }
        if (!await chainPresentation.resolve(e.index, ctx.isCurrent)) {
          await chainPresentation.activate(link, data, ctx.you, ctx.isCurrent, () => {
            sfx('info', { volume: 0.45 })
            showChainLink(link)
            trackEffect(link)
            showEffect(link)
          })
          await chainPresentation.resolve(e.index, ctx.isCurrent)
        } else {
          sfx('info', { volume: 0.45 })
          showEffect(link)
        }
        trackEffect(e)
        redraw()
        break
      }

      // ── Effet qui agit sans passer par la chaîne (effet continu, règle spéciale d'une carte) ──
      case 'cardHint': {
        // Indication d'un effet continu, pas une activation : aucun zoom ni interruption.
        break
      }

      // ── Cartes ciblées par un effet ──
      case 'target': {
        sfx('target')
        for (const uid of e.uids) {
          const card = cardEl(uid)
          if (!card) continue
          card.classList.add('aimed')
          ring(centerOf(card.getBoundingClientRect()), '#ff7a66', 190, 520)
          setTimeout(() => card.classList.remove('aimed'), 900)
        }
        await sleep(360)
        break
      }

      // ── Cartes montrées à ce joueur (carte ajoutée à la main par l'adversaire, etc.) ──
      case 'reveal': {
        if (ctx.watching || e.player !== ctx.you) showRevealed(e.cardIds.flatMap((id) => ctx.cards.get(id) ?? []))
        break
      }

      // ── Effet annulé : sceau d'interdiction et perte des couleurs sur la carte concernée ──
      case 'chainNegated': {
        const visible = duel.view?.chain[e.index - 1]
        const link = chainLinks.get(e.index) ?? (visible ? { type: 'chain' as const, cardId: visible.cardId, player: visible.seat, uid: null, index: e.index } : null)
        const data = link ? ctx.cards.get(link.cardId) : undefined
        sfx('target', { volume: 0.85, rate: 0.72 })
        if (link) showEffect(link)
        trackEffect(e)
        // Une résolution annoncée après l'annulation ne rejoue pas une présentation en couleur.
        chainLinks.delete(e.index)
        redraw()
        if (!await chainPresentation.negate(e.index, data ?? null, ctx.isCurrent)) {
          await negateCard(data ?? null, link?.uid != null ? cardEl(link.uid) : null, arena.getBoundingClientRect(), ctx.isCurrent)
        }
        break
      }

      case 'attackNegated': {
        clearPendingAttack()
        sfx('destroyed', { volume: 0.6 })
        await sleep(520)
        break
      }

      // ── Cartes qui changent de zone : défausse, bannissement, retour dans le Deck... ──
      case 'move': {
        // Une carte qui arrive sur le terrain est animée après le redessin (playPost), depuis sa pile.
        if (e.how === 'toField' || e.how === 'create') break
        // Les déplacements de même nature qui se suivent partent ensemble, légèrement décalés.
        const group: MoveEvent[] = []
        let j = i
        while (events[j]?.type === 'move' && (events[j] as MoveEvent).how === e.how) group.push(events[j++] as MoveEvent)
        i = j - 1
        await Promise.all(group.map((m, n) => moveCard(m, Math.min(n * (m.how === 'mill' ? 85 : 110), 660), ctx, handled, m.how === 'toHand' && shuffling.has(sideOf(ctx, m.toPlayer ?? m.player)), n)))
        break
      }

      // ── Main mélangée : les cartes se rassemblent et se mélangent (la nouvelle main est distribuée après le redessin) ──
      case 'shuffle': {
        if (events.some((x) => x.type === 'start')) break
        await shuffleHandOut(sideOf(ctx, e.player))
        break
      }

      // ── Dé, pièce ──
      case 'dice':
      case 'coin': {
        const mid = centerOf(arena.getBoundingClientRect())
        sfx(e.type === 'dice' ? 'diceroll' : 'coinflip')
        // Le DuelCanvas passe déjà la main une fois la scène finie : les latences intégrées sont neutralisées.
        if (e.type === 'dice') await rollDice(mid, e.results, true)
        else await flipCoins(mid, e.results, true)
        break
      }

      // ── Pierre-feuille-ciseaux : les deux cartes se découvrent et s'entrechoquent, la perdante est détruite ──
      case 'rps': {
        const foeSeat: Seat = ctx.you === 0 ? 1 : 0
        const label = (seat: Seat): string => escHtml(ctx.watching ? duelistName(duel.names, seat) : seat === ctx.you ? tr('rps.you') : tr('rps.opponent'))
        await showdown(e.hands[ctx.you], e.hands[foeSeat], { me: label(ctx.you), foe: label(foeSeat), draw: tr('rps.drawStamp') }, arena)
        break
      }

      // ── Dégâts : le nombre file vers les LP du joueur touché ──
      case 'damage':
      case 'recover':
      case 'cost': {
        const side = sideOf(ctx, e.player)
        const hud = one(`.hud[data-side="${side}"]`)
        const num = hud?.querySelector<HTMLElement>('.lp-num')
        const half = one(`.half[data-side="${side}"]`)
        const start = lastImpact ?? (half ? centerOf(half.getBoundingClientRect()) : { x: innerWidth / 2, y: innerHeight / 2 })
        const to = num ? centerOf(num.getBoundingClientRect()) : undefined
        const gain = e.type === 'recover'
        sfx(gain ? 'gainlp' : 'damage', { gap: 200 })
        if (e.type === 'damage' && side === 'me') vignette()
        if (e.type === 'damage') screenPunch(Math.min(2, 0.5 + e.amount / 2000))
        if (e.type === 'damage' && e.amount >= 2000) hitFlash(Math.min(2, e.amount / 2000))
        if (num) void floatText(start, `${gain ? '+' : '−'}${e.amount}`, gain ? 'heal' : `dmg ${e.type === 'cost' ? 'cost' : ''} ${e.amount >= 2000 ? 'huge' : ''}`, { to, toEl: num, duration: 950 })
        await sleep(420)
        if (hud && num) {
          if (!gain) {
            // L'en-tête n'est pas reconstruit d'un état à l'autre : on retire la classe pour pouvoir rejouer l'éclair.
            hud.classList.add('hit')
            setTimeout(() => hud.classList.remove('hit'), 520)
            shake(hud, 6)
          }
          const pct = `${Math.max(0, Math.min(100, (e.lp / ctx.startLp) * 100))}%`
          hud.querySelector<HTMLElement>('.lp-fill')?.style.setProperty('width', pct)
          hud.querySelector<HTMLElement>('.lp-ghost')?.style.setProperty('width', pct)
          await countTo(num, e.lp, 520)
        }
        lastImpact = null
        break
      }


    }
  }
  return handled
}

// ───────────────────────────── Scène de fin ─────────────────────────────

/** Destruction visuelle du seul côté perdant. Les règles et les piles ne sont pas modifiées. */
async function knockout(side: 'me' | 'foe', ctx: SeqCtx): Promise<void> {
  const cards = [...app.querySelectorAll<HTMLElement>(`.half.${side} .card, .hand.${side} .card`)]
  await Promise.all(cards.map(async (card, i) => {
    await sleep(reducedMotion() ? 0 : Math.min(i * 65, 420))
    if (ctx.isCurrent?.() === false) return
    sfx('destroyed', { volume: .8, gap: 90 })
    if (!reducedMotion()) await crush(card)
    card.style.visibility = 'hidden'
  }))
  if (ctx.isCurrent?.() === false) return
  app.querySelectorAll<HTMLElement>(`.half.${side} .statline, .half.${side} .ctrs, .half.${side} .count, .half.${side} .mats, .half.${side} .scale`).forEach((el) => { el.style.visibility = 'hidden' })
  await sleep(reducedMotion() ? 140 : 400)
}

/**
 * Une victoire qui a une cause visible (les cinq pièces d'Exodia, les monstres du coup fatal, l'effet qui a fait les dégâts) ne s'annonce pas d'un seul mot :
 * le terrain se vide, les cartes qui ont rempli la condition se posent au centre, une à une, puis seulement vient l'écran de résultat.
 */
async function winFinale(e: Extract<GameEvent, { type: 'win' }>, ctx: SeqCtx): Promise<void> {
  const fin = e.finale
  if (!fin || fin.kind !== 'special' || e.winner === 'draw' || ctx.isCurrent?.() === false) return
  const won = e.winner === ctx.you || ctx.watching
  const color = won ? '#ffd76a' : '#ff6a5a'
  const stage = (one('.arena') ?? app).getBoundingClientRect()
  const mid = centerOf(stage)
  const cards = fin.cards.map((id) => ctx.cards.get(id) ?? null)

  // 1. Le terrain se vide : chaque carte s'efface en se contractant, l'une après l'autre.
  const all = [...app.querySelectorAll<HTMLElement>('.mat .card, .hand .card, .pile .card, .mat .ctrs, .mat .statline, .mat .mats, .mat .scale')]
  sfx('shuffle', { volume: 0.5 })
  all.forEach((el, i) => void play(el, [{ opacity: 1, scale: '1', filter: 'none' }, { opacity: 0, scale: '0.3', filter: 'blur(6px) brightness(2.4)' }], { duration: 560, delay: Math.min(i * 26, 760), easing: EASE_IN, fill: 'forwards' }))
  const dim = node('finale-dim')
  void play(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out', fill: 'forwards' })
  await sleep(Math.min(all.length * 26, 760) + 700)
  if (ctx.isCurrent?.() === false) return dim.remove()

  // 2. Les cartes de la victoire se posent au centre.
  const n = Math.max(1, cards.length)
  const row = node('finale-row', `left:${mid.x}px;top:${mid.y}px;--n:${n};--glow:${color}`)
  const faces = cards.map((data) => {
    const slot = document.createElement('div')
    slot.className = 'finale-card'
    slot.appendChild(cardDom(data, { size: 'md' }))
    row.appendChild(slot)
    return slot
  })
  const title = fin.kind === 'special' ? tr('fx.finaleSpecial') : fin.kind === 'battle' ? tr('fx.finaleBattle') : tr('fx.finaleEffect')
  const names = cards.flatMap((c) => (c ? [c.name.fr ?? c.name.en] : [])).slice(0, 1).join('')
  banner(title, fin.kind === 'special' ? names : '', won ? 'gold' : 'foe', 1500)
  for (const [i, slot] of faces.entries()) {
    const rect = slot.getBoundingClientRect()
    sfx(i === faces.length - 1 ? 'specialsummon' : 'summon', { volume: 0.7 })
    ring({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, color, rect.height * 1.4, 520)
    void play(slot, [{ opacity: 0, translate: '0 70px', scale: '0.45', filter: 'brightness(3)' }, { opacity: 1, translate: '0 0', scale: '1', filter: 'brightness(1)' }], { duration: 520, easing: EASE_OUT, fill: 'forwards' })
    await sleep(260)
    if (ctx.isCurrent?.() === false) break
  }
  await sleep(420)
  flash(mid, color, Math.min(innerWidth, innerHeight) * 0.8, 600)
  sparks(mid, '#fff3c4', 30, 1.4)
  shakeArena(5)
  await sleep(1500)

  // 3. La scène s'efface ; le terrain reste vide derrière l'écran de résultat.
  await Promise.all([play(row, [{ opacity: 1 }, { opacity: 0 }], { duration: 480, fill: 'forwards' }), play(dim, [{ opacity: 1 }, { opacity: 0.55 }], { duration: 480, fill: 'forwards' })])
  row.remove()
  dim.remove()
}

// ───────────────────────────── Après le redessin ─────────────────────────────

export async function playPost(events: GameEvent[], old: Map<number, Snap>, handled: Set<number>, ctx: SeqCtx): Promise<void> {
  if (ctx.isCurrent?.() === false) return
  const fusions = events.filter((event): event is Extract<GameEvent, { type: 'summon' }> => event.type === 'summon' && event.kind === 'fusion' && !!event.fusionMaterials?.length)
  for (const event of fusions) { const card = cardEl(event.uid); if (card) { card.style.visibility = 'hidden'; card.closest('.zone')?.classList.add('fusion-pending') } }
  const pileCenter = (kind: string, side: string): DOMRect | null => one(`.pile.${kind}[data-side="${side}"]`)?.getBoundingClientRect() ?? null
  // Début de partie : les mains restent cachées le temps que les Decks soient mélangés, puis sont distribuées carte par carte.
  const starting = events.some((e) => e.type === 'start')
  if (starting) for (const c of app.querySelectorAll<HTMLElement>('.hand .card')) c.style.visibility = 'hidden'
  const newTurn = events.some((e) => e.type === 'turn' && e.turn > 1)

  // Bandeaux (ne bloquent pas le jeu).
  for (const e of events) {
    if (e.type === 'start') {
      sfx('playerenter')
      banner(tr('fx.duel'), ctx.watching ? tr('fx.playerStarts', { name: duelistName(duel.names, e.firstPlayer) }) : e.firstPlayer === ctx.you ? tr('fx.youStart') : tr('fx.foeStarts'), 'gold')
    } else if (e.type === 'turn' && e.turn > 1) {
      sfx('nextturn')
      banner(ctx.watching ? tr('duel.turnOf', { name: duelistName(duel.names, e.player) }) : e.player !== ctx.you ? tr('fx.foeTurn') : ctx.spectating ? tr('fx.mateTurn') : tr('fx.yourTurn'), tr('fx.turn', { n: e.turn }), e.player === ctx.you ? 'me' : 'foe')
    } else if (e.type === 'phase' && e.phase === 'battle') {
      sfx('phase')
      banner(PHASE_NAME.battle, '', 'battle')
    } else if (e.type === 'phase' && !starting) {
      // Chaque phase s'annonce d'un bandeau fin et bref ; le changement de tour a déjà annoncé la Draw Phase.
      if (e.phase === 'draw' && newTurn) continue
      sfx('phase', { volume: 0.35, gap: 300 })
      banner(PHASE_NAME[e.phase], '', 'phase', 620)
    } else if (e.type === 'win' && e.winner !== 'draw') {
      endJingle(e.winner === ctx.you ? 'win' : 'lose')
      // Le verdict frappe avant que l'écran de fin ne s'installe : une lumière qui explose, les éclats et le plateau qui tremble — or aux vainqueurs, rouge aux vaincus.
      const mid = centerOf((one('.arena') ?? app).getBoundingClientRect())
      const won = e.winner === ctx.you
      flash(mid, won ? '#ffd76a' : '#ff5a4a', Math.min(innerWidth, innerHeight) * 0.9, 760)
      ring(mid, won ? '#ffe9a8' : '#ff8576', Math.min(innerWidth, innerHeight) * 0.8, 900)
      sparks(mid, won ? '#fff3c4' : '#ffc9bf', 26, 1.2)
      shakeArena(won ? 9 : 7)
    }
  }
  const finaleEvent = events.find((ev): ev is Extract<GameEvent, { type: 'win' }> => ev.type === 'win')

  if (starting) {
    await sleep(500)
    if (ctx.isCurrent?.() === false) return
    sfx('shuffle')
    setTimeout(() => sfx('shuffle'), 380)
    await Promise.all([riffle('me'), riffle('foe')])
    await sleep(120)
    if (ctx.isCurrent?.() === false) return
  }

  for (const event of fusions) {
    const target = cardEl(event.uid)
    if (!target || ctx.isCurrent?.() === false) continue
    await fusionSummon(event, target, ctx.cards, ctx.isCurrent)
    target.style.visibility = ''
    target.closest('.zone')?.classList.remove('fusion-pending')
    handled.add(event.uid)
  }
  // Attaque toujours en suspens : l'attaquant reste soulevé sur le nouveau plateau.
  if (pendingAttacker !== null) {
    const slot = cardEl(pendingAttacker)?.parentElement
    if (slot) slot.classList.add('attacking', 'held')
    else clearPendingAttack()
  }

  // Cartes créées par un effet : elles surgissent sur place, sans voler depuis une pile.
  const created = new Set(events.flatMap((e) => (e.type === 'move' && e.how === 'create' && e.uid !== null ? [e.uid] : [])))
  // D'où viennent les cartes qui arrivent en main ou sur le terrain sans avoir été vues avant (Cimetière, Deck, Extra Deck...).
  // holder : le monstre Xyz d'où un matériel se détache ; card : la carte, quand son identité est publique (pour la montrer en vol).
  const origin = new Map<number, { zone: Zone; sourceSide: 'me' | 'foe'; faceUp?: boolean; holder?: number; card: ClientCard | null }>()
  for (const e of events) if (e.type === 'move' && e.uid !== null && (e.how === 'toField' || e.how === 'toHand')) origin.set(e.uid, { zone: e.from, sourceSide: sideOf(ctx, e.player), faceUp: e.fromFaceUp, ...((e.fromHolder ?? e.into) !== undefined ? { holder: e.fromHolder ?? e.into } : {}), card: e.cardId === null ? null : (ctx.cards.get(e.cardId) ?? null) })

  // Vols de cartes : tout ce qui a changé de place ou vient d'apparaître.
  const jobs: Promise<void>[] = []
  const seen = new Set<number>()
  const drawn: Record<string, number> = { me: 0, foe: 0 }
  // Une main mélangée reçoit de nouvelles identités : ce ne sont pas des cartes piochées.
  const shuffled = new Set(events.flatMap((e) => (e.type === 'shuffle' ? [sideOf(ctx, e.player)] : [])))
  for (const el of app.querySelectorAll<HTMLElement>('.card[data-uid]')) {
    const uid = Number(el.dataset.uid)
    const area = el.dataset.area ?? ''
    const side = el.dataset.side ?? 'me'
    seen.add(uid)
    if (handled.has(uid)) continue
    const before = old.get(uid)
    if (!before) {
      if (created.has(uid)) continue
      const o = origin.get(uid)
      const from = o?.zone
      if (area === 'hand') {
        // Nouvelle carte en main : elle vient du Deck, ou de la pile où l'effet est allé la chercher.
        if (shuffled.has(side as 'me' | 'foe')) {
          // Nouvelle main après un mélange : les cartes partent du paquet, au centre de la main, et se retournent pour se montrer.
          const hand = one(`.hand.${side}`)?.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          if (hand) jobs.push(flyTo(el, new DOMRect(hand.left + hand.width / 2 - r.width / 2, hand.top + hand.height / 2 - r.height / 2, r.width, r.height), { motion: 'deal', fromAngle: side === 'foe' ? 180 : 0, delay: 45 * (drawn[side] = (drawn[side] ?? 0) + 1), fromBack: true, trail: false }))
          continue
        }
        // D'où elle vient : sa pile, le monstre Xyz qui la portait, ou le Deck par défaut (pioche, recherche).
        const holderSnap = o?.holder !== undefined ? old.get(o.holder) : undefined
        const holder = holderSnap?.rect ?? (o?.holder !== undefined ? cardEl(o.holder)?.getBoundingClientRect() ?? null : null)
        const pile = holder ?? (from && from !== 'hand' ? pileOfZone(from, o?.sourceSide ?? side) : pileCenter('deck', side))
        // À la distribution de départ, les cartes arrivent une à une, chacune avec son bruit.
        const delay = (starting ? 150 : 80) * (drawn[side] = (drawn[side] ?? 0) + 1)
        if (starting && side === 'me') setTimeout(() => sfx('draw', { gap: 60 }), delay)
        // Une carte tirée du Deck (ou de l'Extra Deck) part de dos et se retourne en l'air pour se montrer ; une carte
        // qui vient d'une pile visible part de face (et se retourne si elle rentre dans la main de l'adversaire).
        if (pile) jobs.push(flyTo(el, holder ?? cardRectAt(pile), { motion: starting ? 'deal' : from && from !== 'deck' ? 'toHand' : 'draw', delay, fromAngle: holderSnap?.angle ?? ((o?.sourceSide ?? side) === 'foe' ? 180 : 0), fromBack: !o?.faceUp && (!from || from === 'deck' || from === 'extra'), ...(o?.card ? { fromFace: cardDom(o.card, { size: 'md' }) } : {}) }))
      } else if (from) {
        // Invoquée ou posée depuis une pile : elle en part et atterrit avec de l'impact.
        const holder = o?.holder !== undefined ? old.get(o.holder) : null
        const pile = holder?.rect ?? pileOfZone(from, o?.sourceSide ?? side)
        if (pile) jobs.push(flyTo(el, holder ? pile : cardRectAt(pile), { motion: el.classList.contains('back') ? 'set' : 'toField', fromBack: !o?.faceUp && (from === 'deck' || from === 'extra'), fromAngle: holder?.angle ?? ((o?.sourceSide ?? side) === 'foe' ? 180 : 0), ...(o?.card ? { fromFace: cardDom(o.card, { size: 'md' }) } : {}), impact: true }))
      } else if (area === 'monster') {
        // Jetons et monstres créés sur place n'ont pas de pile d'origine.
        const angle = cardAngle(el)
        jobs.push(play(el, [{ opacity: 0, transform: `rotate(${angle}deg) scale(.35)`, filter: 'brightness(3)' }, { opacity: 1, transform: `rotate(${angle}deg) scale(1.08)`, offset: 0.7 }, { transform: `rotate(${angle}deg) scale(1)`, filter: 'none' }], { duration: 480, easing: EASE_OUT }))
      }
      continue
    }
    if (handled.has(uid)) continue
    // Les retournements immobiles montrent les deux faces ; un vol inclut déjà son retournement.
    const a0 = centerOf(before.rect)
    const b0 = centerOf(el.getBoundingClientRect())
    const changedFace = before.el.classList.contains('back') !== el.classList.contains('back')
    if (dist(a0, b0) < 6 && changedFace && !events.some((e) => e.type === 'flip' && e.uid === uid)) {
      sfx('flip')
      jobs.push(turnCard(el, before.el, before.angle))
      continue
    }
    if (dist(a0, b0) < 6 && before.angle !== cardAngle(el)) {
      sfx('flip', { volume: 0.6 })
      const angle = cardAngle(el)
      ring(b0, angle % 180 === 90 ? '#8fd0ff' : '#ffb347', 150, 420)
      jobs.push(play(el, [
        { transform: `rotate(${before.angle}deg) scale(1)` },
        { transform: `translateY(-10px) rotate(${(before.angle + angle) / 2}deg) scale(1.12)`, offset: 0.45 },
        { transform: `rotate(${angle}deg) scale(.98)`, offset: 0.88 },
        { transform: `rotate(${angle}deg) scale(1)` },
      ], { duration: 440, easing: 'ease-in-out' }))
      continue
    }
    const a = centerOf(before.rect)
    const b = centerOf(el.getBoundingClientRect())
    if (dist(a, b) < 6) continue
    const holder = el.closest<HTMLElement>('.hcard')
    if (before.area === 'hand' && area === 'hand' && holder) {
      // Les cartes de la main se resserrent : simple glissement.
      jobs.push(play(holder, { translate: [`${a.x - b.x}px ${a.y - b.y}px`, '0px 0px'] }, { duration: 320, easing: EASE_OUT }))
    } else {
      const control = before.side !== side
      const action = events.find((e) => (e.type === 'summon' || e.type === 'set') && e.uid === uid)
      const motion: MotionKind = control ? 'control' : area === 'hand' ? 'toHand' : action?.type === 'set' ? 'set' : action?.type === 'summon' ? 'summon' : 'transfer'
      jobs.push(flyTo(el, before.rect, { motion, fromEl: before.el, fromAngle: before.angle, impact: area === 'monster' || area === 'st' || area === 'field' }))
    }
  }

  // Cartes parties sans animation dédiée (défausse couverte par une autre, etc.) : vers le Cimetière.
  for (const [uid, snap] of old) {
    if (seen.has(uid) || handled.has(uid) || snap.area === 'gy' || (snap.area === 'hand' && shuffled.has(snap.side as 'me' | 'foe'))) continue
    // Un jeton n'a pas de Cimetière : il se dissipe sur place en une petite explosion.
    if (ctx.cards.get(Number(snap.el.dataset.card))?.frameType === 'token') {
      const g = ghostOf(snap.el, snap.rect)
      const c = centerOf(snap.rect)
      sfx('destroyed', { volume: 0.6, gap: 80 })
      blast(c, Math.max(snap.rect.width, snap.rect.height) * 0.9, '#9fe8ff', 0.7)
      jobs.push(play(g, [{ opacity: 1, filter: 'brightness(2.4)' }, { opacity: 0, transform: 'scale(1.25)', filter: 'brightness(3) blur(3px)' }], { duration: 420, easing: 'ease-out' }).finally(() => g.remove()))
      continue
    }
    const gy = pileCenter('gy', snap.side)
    if (gy) jobs.push(vanishTo(snap.el, snap.rect, centerOf(gy)))
  }

  if (!starting && events.some((e) => e.type === 'draw')) sfx('draw')
  await Promise.all(jobs)
  if (ctx.isCurrent?.() === false) return

  // Atterrissage des monstres.
  for (const e of events) {
    if (e.type !== 'summon' && e.type !== 'set') continue
    if (fusions.some((fusion) => fusion.uid === e.uid)) continue
    const card = cardEl(e.uid)
    if (!card) continue
    const r = card.getBoundingClientRect()
    const c = centerOf(r)
    if (e.type === 'summon') landing(e.mode, e.kind, c, r)
    else {
      sfx('set')
      ring(c, '#8ea2ff', 150, 420)
      flash(c, '#9baaff', Math.max(r.width, r.height) * 1.3, 320)
    }
  }

  // Les originaux sont montrés après les mouvements et la procédure Fusion, une fois par identité dans cette action.
  const shown = new Set<number>()
  for (const event of events) {
    if (event.type !== 'summon' || shown.has(event.cardId) || ctx.isCurrent?.() === false) continue
    const monster = ctx.nextView?.players[event.player].monsters.find((entry) => entry?.card.uid === event.uid)
    const data = ctx.cards.get(event.cardId)
    if (!data || !monster?.faceUp || monster.card.cardId !== event.cardId) continue
    shown.add(event.cardId)
    await summonPresentation(event, data, monster, ctx.isCurrent)
  }
  if (ctx.isCurrent?.() === false) return

  const effects: Promise<void>[] = []
  // Effets qui se voient sur le plateau redessiné : cartes créées, compteurs, équipement, contrôle, mélange du Deck.
  for (const e of events) {
    if (e.type === 'move' && e.how === 'create') {
      const card = e.uid === null ? null : cardEl(e.uid)
      const target = card?.getBoundingClientRect() ?? pileRect('deck', sideOf(ctx, e.player))
      if (!target) continue
      const c = centerOf(target)
      sfx('token')
      // La carte apparaît d'un éclat de lumière.
      if (card) {
        const angle = cardAngle(card)
        effects.push(play(card, [{ opacity: 0, transform: `rotate(${angle}deg) scale(.3)`, clipPath: 'inset(50% 0)', filter: 'brightness(3)' }, { opacity: 1, transform: `rotate(${angle}deg) scale(1.1)`, clipPath: 'inset(0)', filter: 'brightness(1.6)', offset: 0.6 }, { opacity: 1, transform: `rotate(${angle}deg) scale(1)`, filter: 'none' }], { duration: 560, easing: EASE_OUT }))
      }
      summonSeal(c, Math.max(target.width, target.height) * 1.7, '#9fe8ff')
      flash(c, '#bff3ff', Math.max(target.width, target.height) * 2.2, 520)
      ring(c, '#9fe8ff', Math.max(target.width, target.height) * 1.6, 620)
      sparks(c, '#d8f8ff', 14, 0.8)
    } else if (e.type === 'counter') {
      const card = e.uid === null ? null : cardEl(e.uid)
      if (!card) continue
      const r = card.getBoundingClientRect()
      const c = centerOf(r)
      sfx(e.delta > 0 ? 'addcounter' : 'removecounter', { gap: 120 })
      ring(c, e.delta > 0 ? '#ffe08a' : '#b9c2ee', 150, 480)
      void floatText({ x: c.x, y: r.top - 6 }, `${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)} ${e.name}`, `cnt ${e.delta > 0 ? '' : 'out'}`, { rise: 34, duration: 1300 })
      for (const chip of card.closest('.zone')?.querySelectorAll('.ctr') ?? []) void play(chip, [{ transform: 'scale(1.6)' }, { transform: 'none' }], { duration: 480, easing: EASE_OUT })
    } else if (e.type === 'equip') {
      const a = cardEl(e.uid)
      const b = cardEl(e.targetUid)
      if (!a || !b) continue
      sfx('equip')
      const start = centerOf(a.getBoundingClientRect())
      const end = centerOf(b.getBoundingClientRect())
      ring(start, '#ffe9a8', 130, 360)
      effects.push(beam(start, end, '#ffd76a', 520))
      summonSeal(end, b.getBoundingClientRect().height * 1.35, '#ffd76a', undefined, 620)
      ring(centerOf(b.getBoundingClientRect()), '#ffd76a', 190, 520)
    } else if (e.type === 'control') {
      const card = cardEl(e.uid)
      if (!card) continue
      const r = card.getBoundingClientRect()
      sfx('info')
      ring(centerOf(r), '#c9a6ff', 220, 620)
      summonSeal(centerOf(r), r.height * 1.7, '#d3a4ff', undefined, 620)
      void floatText({ x: centerOf(r).x, y: r.top - 6 }, tr('fx.control'), 'cnt', { rise: 30, duration: 1100 })
    } else if (e.type === 'shuffleDeck') {
      sfx('shuffle')
      effects.push(riffle(sideOf(ctx, e.player)))
    }
  }

  await Promise.all(effects)
  if (ctx.isCurrent?.() === false) return

  // Valeurs qui ont changé : ATK / DEF d'un monstre (avec l'écart), nombre de cartes d'une pile.
  for (const el of app.querySelectorAll<HTMLElement>('.mz .card[data-uid]')) {
    const before = statsBefore.get(Number(el.dataset.uid))
    const line = el.closest('.zone')?.querySelector<HTMLElement>('.statline')
    if (!before || !line || line.textContent === before) continue
    const [a0, d0] = before.split('/').map(Number)
    const [a1, d1] = (line.textContent ?? '').split('/').map(Number)
    void play(line, [{ transform: 'scale(1.7)', filter: 'brightness(2.2)' }, { transform: 'none', filter: 'none' }], { duration: 520, easing: EASE_OUT })
    const r = el.getBoundingClientRect()
    const delta = (label: string, from: number | undefined, to: number | undefined, dy: number): void => {
      if (from === undefined || to === undefined || Number.isNaN(from) || Number.isNaN(to) || from === to) return
      void floatText({ x: centerOf(r).x, y: r.top - dy }, `${to > from ? '+' : '−'}${Math.abs(to - from)} ${label}`, `cnt stat ${to > from ? 'up' : 'down'}`, { rise: 26, duration: 1200 })
    }
    delta(tr('card.atk'), a0, a1, 4)
    delta(tr('card.def'), d0, d1, 26)
  }
  if (finaleEvent?.finale?.kind === 'special') await winFinale(finaleEvent, ctx)
  else if (finaleEvent && finaleEvent.winner !== 'draw') {
    const loser = finaleEvent.winner === 0 ? 1 : 0
    if (duel.view?.players[loser].lp === 0) await knockout(sideOf(ctx, loser), ctx)
  }
}

const KIND_STYLE: Record<SummonKind, { color: string; label: string }> = {
  fusion: { color: '#b98cff', label: 'fx.kind.fusion' },
  synchro: { color: '#f4f2ea', label: 'fx.kind.synchro' },
  xyz: { color: '#9aa0b8', label: 'fx.kind.xyz' },
  link: { color: '#4fb3ff', label: 'fx.kind.link' },
  ritual: { color: '#6aa6ff', label: 'fx.kind.ritual' },
}

/** Arrivée d'un monstre sur le terrain : colonne de lumière, et une mise en scène propre à chaque type d'Invocation Spéciale. */
function landing(mode: 'normal' | 'flip' | 'special', kind: SummonKind | undefined, c: Pt, r: DOMRect): void {
  const style = kind ? KIND_STYLE[kind] : null
  const color = style?.color ?? '#ffd76a'
  sfx(mode === 'special' ? 'specialsummon' : mode === 'flip' ? 'flip' : 'summon')
  shakeArena(mode === 'special' ? 7 : 3)
  summonSeal(c, Math.min(380, Math.max(r.width, r.height) * 2.1), color, kind)
  ring(c, color, 260)
  pillar({ x: c.x, y: r.bottom }, color)
  sparks(c, style ? '#ffffff' : '#ffe9a8', style ? 22 : 14, style ? 1.1 : 0.9)
  if (!style) return
  ring(c, color, 400, 800)
  void floatText({ x: c.x, y: r.top - 8 }, tr(style.label), 'kind', { rise: 34, duration: 1400 })
  if (kind === 'fusion' || kind === 'ritual') vortex(c, color, r.height * 2.4, 800)
  if (kind === 'synchro') ring(c, '#ffe08a', 190, 560)
  if (kind === 'xyz') for (let i = 0; i < 3; i++) setTimeout(() => ring(c, '#ffd76a', 150 + i * 70, 520), i * 110)
  if (kind === 'link') for (const angle of [0, 90, 45, -45]) slash(c, angle, r.height * 1.9, color)
}
