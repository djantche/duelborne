// Questions du moteur : panneau au-dessus de la main (oui / non, options, sélection sur le plateau...)
// et fenêtres de vignettes (choix de cartes hors plateau, réponse en chaîne).
import { RpsChoices } from '../../ui/rps.tsx'
import { optionOfHand } from '../../../shared/rps.ts'
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import type { Prompt, Zone } from '../../../shared/protocol.ts'
import { redraw } from '../../app/render.ts'
import { store } from '../../app/store.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { imgUrl, nameOf } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import type { IconName } from '../../ui/Icon.tsx'
import { ZONE_LABEL } from '../../ui/i18n.ts'
import { Modal } from '../../ui/Modal.tsx'
import { answer, chooseAnnounced, chooseTile, inspectCard, pickEffect, sendPick, setPromptHidden, stepCounter, toggleOption, undo } from './controller.ts'
import { activePrompt, amountOf, boardUids, canSendPick, effectNumbers, isBlocked, isFixed, isTargeting, offBoardIndexes, pickedTotal, pickedWeight, replyGroups } from './prompt.ts'
import type { CardsPrompt, ChainPrompt, PromptMode } from './prompt.ts'
import { duel } from './state.ts'
import { has, lang, t, tx } from '../../i18n.ts'

const cardName = (id: number | null | undefined): string => {
  const card = id === null || id === undefined ? undefined : store.cards.get(id)
  return card ? nameOf(card) : t('p.aCard')
}

/** Revenir sur sa décision : proposé tant qu'aucune carte n'a été posée ni aucun effet activé. */
const Undo = (): JSX.Element => <IconButton icon="undo" label={t('p.undo')} act="undo" onClick={undo} />

const ViewBoard = (): JSX.Element => <Button small act="view-board" onClick={() => setPromptHidden(true)}>{t('p.viewBoard')}</Button>

/** La fenêtre est démontée pour libérer le terrain et son piège de focus ; une commande permet de reprendre le choix. */
function ResumePrompt(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) }, [])
  return (
    <div class="prompt-resume glass" ref={ref}>
      <span>{t('p.boardInspection')}</span>
      <Button small variant="primary" icon="back" act="resume-prompt" aria-haspopup="dialog" onClick={() => setPromptHidden(false)}>{t('p.resumeChoice')}</Button>
    </div>
  )
}

/** Icône d'une question de sélection, d'après l'indication du moteur (500 : Sacrifice, 504 : Cimetière, 511 : Fusion...). */
const HINT_ICON: Record<number, IconName> = { 500: 'shield', 501: 'hand', 502: 'close', 503: 'banish', 504: 'grave', 505: 'hand', 506: 'hand', 507: 'deck', 508: 'cardUp', 509: 'spark', 510: 'cardBack', 511: 'star', 512: 'star', 513: 'star', 518: 'field', 519: 'star', 526: 'search', 527: 'field', 531: 'shield' }
/** Indications de matériaux : la sélection se fait en plusieurs temps, avec un message propre à chaque temps. */
const MATERIAL_HINTS = new Set([511, 512, 513, 519])

/**
 * Titre court d'une sélection, et précision de l'étape quand les matériaux se choisissent en plusieurs temps :
 * « D'abord : « Yubel » », puis « Maintenant : les autres matériaux ».
 */
function selectionTitle(p: CardsPrompt): { title: string; step?: string; icon: IconName | undefined } {
  const icon = HINT_ICON[p.hint]
  const title = has(`p.h.${p.hint}`) ? t(`p.h.${p.hint}`) : tx(p.text)
  if (p.mode !== 'step' || !MATERIAL_HINTS.has(p.hint)) return { title, icon }
  const chosen = p.cards.filter((c) => c.selected).length
  const left = p.cards.filter((c) => !c.selected)
  const first = left[0]
  const named = first && first.cardId !== null && left.every((c) => c.cardId === first.cardId) ? cardName(first.cardId) : null
  if (named && chosen === 0 && (p.max > 1 || p.min > 1)) return { title, step: t('p.stepFirst', { name: named }), icon }
  if (named) return { title, step: t('p.stepNamed', { name: named }), icon }
  return { title, ...(chosen > 0 ? { step: t('p.stepNow') } : {}), icon }
}

/**
 * Niveaux requis, un rond par Niveau : ils se remplissent au fil des cartes cochées. Au-delà du total demandé,
 * les ronds en trop s'affichent en orange (certaines invocations exigent un total exact, d'autres au moins ce total).
 */
export function LevelCircles({ total, target, atLeast }: { total: number; target: number; atLeast?: boolean }): JSX.Element | null {
  if (target < 1 || target > 16) return null
  const filled = Math.min(total, target)
  const over = Math.min(Math.max(0, total - target), 6)
  // « Au moins » : dépasser est permis, les ronds en plus sont verts comme le reste.
  return (
    <span class={cx('lv', (total === target || (atLeast && total >= target)) && 'exact', total > target && !atLeast && 'more', atLeast && 'least')} role="img" aria-label={t('p.levels', { total, target })}>
      {Array.from({ length: target }, (_, i) => (
        <i key={i} class={i < filled ? 'on' : ''} />
      ))}
      {Array.from({ length: over }, (_, i) => (
        <i key={`o${i}`} class="over" />
      ))}
    </span>
  )
}

const ZONE_ICON: Record<Zone, IconName> = { hand: 'hand', monster: 'sword', spellTrap: 'field', graveyard: 'grave', banished: 'banish', deck: 'deck', extra: 'star', overlay: 'shield' }

/** Où se trouve une carte proposée : zone, rang sur le terrain, et s'il s'agit d'une carte de l'adversaire. */
export function Where({ zone, foe, index }: { zone: Zone; foe: boolean; index?: number }): JSX.Element {
  let text = ZONE_LABEL[zone] ?? ''
  if (zone === 'monster') text = index === undefined ? t('p.zoneMonster') : index >= 5 ? t('p.zoneEmz', { n: index - 4 }) : t('p.zoneMonsterN', { n: index + 1 })
  else if (zone === 'spellTrap') text = index === undefined ? t('p.zoneST') : index === 5 ? t('p.zoneField') : t('p.zoneSTN', { n: index + 1 })
  else if (zone === 'overlay') text = t('p.xyzMat')
  return (
    <span class={`where ${foe ? 'foe' : 'me'} z-${zone}`}>
      <Icon name={ZONE_ICON[zone]} />
      <span>{text}</span>
      {foe && <b>{t('p.foe')}</b>}
    </span>
  )
}

/** Compteur et boutons d'une sélection de cartes (panneau du plateau ou en-tête de la fenêtre de choix). */
function SelectionCount({ p }: { p: CardsPrompt }): JSX.Element | null {
  if (p.sum) {
    const total = pickedTotal(p)
    return (
      <>
        <LevelCircles total={total} target={p.sum.target} atLeast={p.sum.atLeast} />
        <span class="lv-total">
          {t('p.levelsCount', { total, target: `${p.sum.atLeast ? '≥ ' : ''}${p.sum.target}` })}
        </span>
      </>
    )
  }
  // Sacrifices : certaines cartes en valent 2.
  if (p.weights) {
    const total = pickedWeight(p)
    return (
      <>
        <LevelCircles total={total} target={p.min} />
        <span class="lv-total">
          {t('p.tributes', { total, min: p.min })}
        </span>
      </>
    )
  }
  // Une carte à la fois (matériaux d'une Fusion...) : le moteur redonne la liste à chaque pas, les cartes déjà prises sont marquées.
  if (p.mode === 'step') {
    const n = p.cards.filter((c) => c.selected).length
    return (
      <>
        {n} / {p.min === p.max ? p.min : t('p.range', { min: p.min, max: p.max })}
      </>
    )
  }
  if (p.ordered) return <>{duel.picked.length} / {p.min}</>
  if (p.mode !== 'multi') return null
  return (
    <>
      {duel.picked.length} / {p.min === p.max ? p.min : t('p.range', { min: p.min, max: p.max })}
    </>
  )
}

function SelectionButtons({ p }: { p: CardsPrompt }): JSX.Element {
  return (
    <>
      <Button class="go" variant="primary" icon="check" act="send-pick" disabled={!canSendPick(p)} onClick={sendPick}>{t('p.validate')}</Button>
      {p.mode === 'step' && p.finishable && <Button icon="check" act="answer" data-value="null" onClick={() => answer(null)}>{t('p.finish')}</Button>}
      {p.cancelable ? <IconButton icon="close" label={t('p.cancel')} act="answer" data-value="null" onClick={() => answer(null)} /> : p.undoable && <Undo />}
    </>
  )
}

interface PanelProps {
  title: ComponentChildren
  sub?: ComponentChildren
  cardId?: number | null
  /** Icône devant le titre. */
  icon?: IconName | undefined
  wrap?: boolean
  /**
   * La question se règle en touchant le plateau ou la main : le panneau se range hors du tapis (en haut de l'écran sur ordinateur,
   * dans la marge à gauche sur téléphone) pour ne jamais recouvrir une carte à toucher.
   */
  aside?: boolean
  /** Carte à l'origine de la question (celle dont l'effet se résout), en vignette. */
  source?: number | null
  /** Cartes déjà choisies, entre le titre et les boutons. */
  tray?: ComponentChildren
  children?: ComponentChildren
}

function Panel({ title, sub, cardId, icon, wrap, aside, source, tray, children }: PanelProps): JSX.Element {
  const origin = source === null || source === undefined ? null : (store.cards.get(source) ?? null)
  return (
    <div class={cx('panel glass', aside && 'aside')}>
      {origin && (
        <span class="panel-source" data-card={origin.id} title={nameOf(origin)}>
          <Card card={origin} size="sm" />
        </span>
      )}
      {/* Le titre renvoie à la carte concernée : la toucher affiche sa fiche. */}
      <div class="panel-title" data-card={cardId ?? undefined}>
        {icon && <Icon name={icon} />}
        <span class="panel-text">
          <b>{title}</b>
          {sub && <small>{sub}</small>}
        </span>
      </div>
      {tray}
      {children && <div class={cx('panel-row', wrap && 'wrap')}>{children}</div>}
    </div>
  )
}

/** La carte dont l'effet est en train de se résoudre : le dernier maillon de la chaîne. */


/** Panneau de la question en cours, posé au-dessus de la main. Rien pour les questions qui ouvrent une fenêtre. */
export function PromptPanel({ mode }: { mode: PromptMode }): JSX.Element | null {
  const prompt = activePrompt()
  if (!prompt) return null
  if (duel.promptHidden) return <ResumePrompt />
  if (mode === 'direct' || mode === 'target') return null
  if (prompt.kind === 'yesno') {
    return (
      <Panel title={tx(prompt.text)} cardId={prompt.cardId} source={prompt.cardId}>
        <IconButton class="primary go" icon="check" label={t('p.yes')} act="answer" data-value="1" onClick={() => answer(1)} />
        <IconButton icon="close" label={t('p.no')} act="answer" data-value="0" onClick={() => answer(0)} />
        {prompt.undoable && <Undo />}
      </Panel>
    )
  }
  // Pierre-feuille-ciseaux demandé par une carte : trois cartes à jouer (le moteur numérote ses options ciseaux, pierre, feuille).
  if (prompt.kind === 'option' && prompt.rps) {
    return (
      <Panel title={tx(prompt.text)} wrap>
        <RpsChoices onPick={(h) => answer(optionOfHand(h))} />
      </Panel>
    )
  }
  if (prompt.kind === 'option' || prompt.kind === 'number') {
    const source = prompt.kind === 'option' ? prompt.cardId : undefined
    // Plusieurs valeurs à déclarer : on les coche, puis « Valider ».
    const pick = prompt.kind === 'option' ? (prompt.pick ?? 0) : 0
    return (
      <Panel title={pick ? `${tx(prompt.text)} (${duel.picked.length} / ${pick})` : tx(prompt.text)} sub={source ? cardName(source) : undefined} cardId={source} wrap>
        {prompt.options.map((o, i) => (
          <Button key={i} class={cx('choice-btn', pick > 0 && duel.picked.includes(i) && 'on')} act="answer" data-value={i} onClick={() => (pick ? toggleOption(i) : answer(i))}>
            {tx(String(o))}
          </Button>
        ))}
        {pick > 0 && (
          <IconButton class="primary go" icon="check" label={t('p.validate')} act="send-pick" disabled={duel.picked.length !== pick} onClick={sendPick} />
        )}
        {prompt.undoable && <Undo />}
      </Panel>
    )
  }
  if (prompt.kind === 'position') {
    const label = (o: { position: string; faceUp: boolean }): string => (o.position === 'atk' ? (o.faceUp ? t('p.posAtk') : t('p.posAtkDown')) : o.faceUp ? t('p.posDef') : t('p.posDefDown'))
    return (
      <Panel title={cardName(prompt.cardId)} cardId={prompt.cardId} source={prompt.cardId}>
        {prompt.options.map((o, i) => (
          <button key={i} type="button" class={cx('btn icon pos', o.position)} title={label(o)} aria-label={label(o)} data-act="answer" data-value={i} onClick={() => answer(i)}>
            <Icon name={o.position === 'atk' ? 'sword' : 'shield'} />
            {!o.faceUp && <Icon name="cardBack" />}
          </button>
        ))}
        {prompt.undoable && <Undo />}
      </Panel>
    )
  }
  // Tant que la zone n'est pas choisie, la carte n'est pas posée : on peut encore renoncer.
  if (prompt.kind === 'place') {
    // Plusieurs zones à choisir : on les touche sur le terrain, puis « Valider ».
    if (prompt.count > 1) {
      return (
        <Panel aside title={`${tx(prompt.text)} (${duel.picked.length} / ${prompt.count})`}>
          <IconButton class="primary go" icon="check" label={t('p.validate')} act="send-pick" disabled={duel.picked.length !== prompt.count} onClick={sendPick} />
          {prompt.undoable && <Undo />}
        </Panel>
      )
    }
    return prompt.undoable ? (
      <Panel aside title={tx(prompt.text)}>
        <Undo />
      </Panel>
    ) : null
  }
  if (prompt.kind !== 'cards') return null
  if (mode === 'pick') {
    // La fenêtre des cartes hors terrain porte déjà ses propres boutons : le panneau lui cède la place.
    if (duel.offboardOpen && duel.view && offBoardIndexes(prompt, boardUids(duel.view)).length) return null
    const head = selectionTitle(prompt)
    const off = duel.view ? offBoardIndexes(prompt, boardUids(duel.view)).filter((i) => !isBlocked(prompt, i)) : []
    const first = off[0] === undefined ? undefined : prompt.cards[off[0]]
    return (
      <Panel aside icon={head.icon} title={head.title} sub={head.step ? <>{head.step} · <SelectionCount p={prompt} /></> : <SelectionCount p={prompt} />}>
        {first && (
          <button type="button" class={cx('btn icon piles', duel.offboardOpen && 'on')} title={t('p.openPiles', { n: off.length })} aria-label={t('p.openPiles', { n: off.length })} aria-pressed={duel.offboardOpen} data-act="offboard-open" onClick={() => { duel.offboardOpen = !duel.offboardOpen; redraw() }}>
            <Icon name={ZONE_ICON[first.zone]} />
            <b class="badge">{off.length}</b>
          </button>
        )}
        <SelectionButtons p={prompt} />
      </Panel>
    )
  }
  return null
}

interface TileProps {
  index: number
  cardId: number | null
  on: boolean
  chosen?: boolean
  /** Rang de la carte dans l'ordre choisi (cartes à ordonner). */
  rank?: number
  where?: ComponentChildren
  caption?: string
  /** Sélection interdite : la vignette est grisée et ne se coche pas. */
  blocked?: boolean
}

/** Vignette à cocher : toucher la coche et montre la carte ; rien n'est envoyé avant « Valider ». */
function Tile({ index, cardId, on, chosen, rank, where, caption, blocked }: TileProps): JSX.Element {
  const card = cardId === null ? null : (store.cards.get(cardId) ?? null)
  return (
    <button type="button" class={cx('choice', on && 'on', chosen && 'chosen', blocked && 'blocked')} data-act="choose" data-i={index} data-card={card?.id} aria-disabled={blocked || undefined} aria-pressed={on || chosen || false} onClick={(ev) => chooseTile(index, ev)}>

      {(on || chosen) && <span class="choice-check" aria-hidden="true"><Icon name="check" /></span>}
      <Card card={card} size="md" />
      {where}
      <small class="choice-status">{rank !== undefined ? rank : on || chosen ? t('p.selected') : caption || ' '}</small>
    </button>
  )
}

/** Fenêtre de choix pour des cartes qui ne sont pas toutes sur le plateau (Deck, Cimetière, Extra Deck...). */
function Chooser({ p, only }: { p: CardsPrompt; /** Seulement ces cartes : celles qui ne sont pas sur le plateau (la sélection se poursuit sur le terrain). */ only?: number[] }): JSX.Element {
  const you = duel.view?.you
  const head = selectionTitle(p)
  const close = (): void => { duel.offboardOpen = false; redraw() }
  return (
    <Modal kind={cx('chooser selection-dock', only && 'partial')} nonmodal title={head.step ? `${head.title} · ${head.step}` : head.title} count={<SelectionCount p={p} />} onBackdrop={only ? close : undefined} actions={<><ViewBoard />{only && <IconButton icon="back" label={t('p.backToBoard')} act="offboard-close" onClick={close} />}<SelectionButtons p={p} /></>}>
      <div class="grid">
        {p.cards.map((c, i) => only && !only.includes(i) ? null : (
          <Tile
            key={i}
            index={i}
            cardId={c.cardId}
            on={duel.picked.includes(i) || isFixed(p, i)}
            chosen={c.selected}
            rank={p.ordered && duel.picked.includes(i) ? duel.picked.indexOf(i) + 1 : undefined}
            where={<Where zone={c.zone} foe={c.seat !== you} index={c.index} />}
            caption={[p.sum && !isFixed(p, i) ? t('p.level', { n: amountOf(p, i) }) : '', p.weights && (p.weights[i] ?? 1) > 1 ? t('p.countsFor', { n: p.weights[i] as number }) : '', isFixed(p, i) ? t('p.fixed') : c.selected ? t('p.already') : ''].filter(Boolean).join(' · ')}
            blocked={isBlocked(p, i)}
          />
        ))}
      </div>
    </Modal>
  )
}

/**
 * Réponse en chaîne : une vignette par carte activable. Le plateau reste visible et utilisable derrière la
 * fenêtre. Une carte à plusieurs effets demande ensuite lequel, et rien ne part avant « Valider ».
 */
function ReplyWindow({ p }: { p: ChainPrompt }): JSX.Element {
  const v = duel.view
  const last = v?.chain[v.chain.length - 1]
  const groups = replyGroups(p)
  const current = duel.replyGroup === null ? [] : (groups[duel.replyGroup] ?? [])
  const picked = duel.picked[0]
  const numbers = effectNumbers(p.options)
  return (
    <Modal
      kind="chooser reply"
      title={p.forced ? t('p.chooseEffect') : t('p.activateCard')}
      actions={
        <>
          <ViewBoard />
          <IconButton class="primary go" icon="check" label={t('p.validate')} act="send-pick" disabled={picked === undefined} onClick={sendPick} />
          {!p.forced && <IconButton icon="next" label={t('p.pass')} act="answer" data-value="null" onClick={() => answer(null)} />}
          {p.undoable && <Undo />}
        </>
      }
    >
      {last && (
        <button type="button" class={`reply-to ${last.seat === v?.you ? 'me' : 'foe'}`} data-card={last.cardId} data-act="inspect-response" aria-label={t('p.readResponse', { name: cardName(last.cardId) })} onClick={() => inspectCard(last.cardId, true)}>
          <i style={{ backgroundImage: `url(${imgUrl(last.cardId)})` }} />
          {t('p.inResponse')} <b>{cardName(last.cardId)}</b>
        </button>
      )}
      <div class="grid">
        {groups.map((g, i) => {
          const o = p.options[g[0] as number] as ChainPrompt['options'][number]
          // Une carte à un seul effet annonce d'emblée ce qu'il fait.
          return <Tile key={i} index={i} cardId={o.cardId} on={duel.replyGroup === i} where={<Where zone={o.zone} foe={false} />} caption={g.length > 1 ? t('p.effects', { n: g.length }) : (o.label ? tx(o.label) : '')} />
        })}
      </div>
      {current.length > 1 && (
        <div class="chooser-extra">
          <p class="effects-title">{t('p.manyActivations', { n: current.length })}</p>
          <div class="effects">
            {current.map((i) => {
              const o = p.options[i] as ChainPrompt['options'][number]
              const n = numbers.get(o)
              return (
                <Button key={i} class={cx('effect', picked === i && 'on')} act="effect" data-i={i} onClick={() => pickEffect(i)}>
                  <b>{n ? t('p.effectN', { n }) : t('p.activateCard2')}</b>
                  {n && o.label && <small>{tx(o.label)}</small>}
                </Button>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Texte sans majuscules ni accents, pour chercher un nom de carte. */
const plain = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const cardTitle = (c: ClientCard): string => nameOf(c)

/** Déclarer une carte : on cherche par le nom (français ou anglais) parmi les cartes que l'effet permet. */
function AnnounceWindow({ p }: { p: Extract<Prompt, { kind: 'announce' }> }): JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  // Le clavier s'ouvre tout de suite, comme dans une barre de recherche.
  useEffect(() => input.current?.focus(), [])
  const q = plain(duel.search.trim())
  // Les noms qui commencent par ce qu'on a tapé passent avant ceux qui le contiennent seulement.
  const matches: { card: ClientCard; rank: number }[] = []
  if (q.length >= 2) {
    for (const id of p.cards) {
      const card = store.cards.get(id)
      if (!card) continue
      const names = [plain(card.name.fr ?? ''), plain(card.name.en)]
      if (names.some((n) => n.startsWith(q))) matches.push({ card, rank: 0 })
      else if (names.some((n) => n.includes(q))) matches.push({ card, rank: 1 })
    }
  }
  const found = matches.sort((a, b) => a.rank - b.rank || nameOf(a.card).length - nameOf(b.card).length).slice(0, 48).map((m) => m.card)
  const chosen = duel.announced === null ? null : (store.cards.get(duel.announced) ?? null)
  return (
    <Modal
      kind="chooser announce"
      title={tx(p.text)}
      count={t('p.possible', { n: p.cards.length.toLocaleString(lang()) })}
      actions={
        <>
          <ViewBoard />
          <Button variant="primary" icon="check" act="send-pick" disabled={duel.announced === null} onClick={sendPick}>
            {chosen ? t('p.declare', { name: cardTitle(chosen) }) : t('p.validate')}
          </Button>
        </>
      }
    >
      <input
        ref={input}
        class="search"
        type="search"
        value={duel.search}
        placeholder={t('p.typeName')}
        autocomplete="off"
        autocapitalize="off"
        onInput={(ev) => {
          duel.search = ev.currentTarget.value
          redraw()
        }}
      />
      <div class="grid">
        {q.length < 2 && <p class="muted">{t('p.searchBoth')}</p>}
        {q.length >= 2 && !found.length && <p class="muted">{t('p.noAllowed')}</p>}
        {found.map((c) => (
          <button type="button" key={c.id} class={cx('choice', duel.announced === c.id && 'on')} data-card={c.id} onClick={() => chooseAnnounced(c.id)}>
            <Card card={c} size="md" />
            <small>{cardTitle(c)}</small>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/** Retirer des compteurs : combien sur chaque carte, avec des − et des +. */
function CountersWindow({ p }: { p: Extract<Prompt, { kind: 'counters' }> }): JSX.Element {
  const you = duel.view?.you
  const counts = p.cards.map((_, i) => duel.counts[i] ?? 0)
  const total = counts.reduce((t, n) => t + n, 0)
  return (
    <Modal
      kind="chooser counters"
      title={tx(p.text)}
      count={`${total} / ${p.total}`}
      actions={
        <>
          <ViewBoard />
          <Button variant="primary" icon="check" act="send-pick" disabled={total !== p.total} onClick={sendPick}>
            {t('p.validate')}
          </Button>
        </>
      }
    >
      <div class="grid">
        {p.cards.map((c, i) => {
          const card = c.cardId === null ? null : (store.cards.get(c.cardId) ?? null)
          return (
            <div key={i} class={cx('counter-pick', counts[i] ? 'on' : '')} data-card={card?.id}>
              <Card card={card} size="md" />
              <Where zone={c.zone} foe={c.seat !== you} index={c.index} />
              <div class="stepper">
                <Button icon="back" aria-label={t('p.counterLess')} disabled={!counts[i]} onClick={() => stepCounter(i, -1)} />
                <b>{counts[i]}</b>
                <Button icon="next" aria-label={t('p.counterMore')} disabled={counts[i] === c.max || total >= p.total} onClick={() => stepCounter(i, 1)} />
              </div>
              <small>sur {c.max}</small>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}

/** Fenêtre de la question en cours, s'il lui en faut une. */
export function PromptWindow({ mode }: { mode: PromptMode }): JSX.Element | null {
  const prompt: Prompt | null = activePrompt()
  if (prompt && duel.promptHidden) return duel.viewer ? null : <ResumePrompt />
  if (prompt?.kind === 'chain' && mode === 'reply') return <ReplyWindow p={prompt} />
  if (prompt?.kind === 'cards' && mode === 'chooser') return <Chooser p={prompt} />
  // Sélection sur le plateau : les cartes des piles s'ouvrent à la demande, sans rien cacher d'autre que le tapis.
  if (prompt?.kind === 'cards' && mode === 'pick' && duel.offboardOpen && duel.view) {
    const off = offBoardIndexes(prompt, boardUids(duel.view))
    if (off.length) return <Chooser p={prompt} only={off} />
  }
  if (prompt?.kind === 'announce') return <AnnounceWindow p={prompt} />
  if (prompt?.kind === 'counters') return <CountersWindow p={prompt} />
  return null
}
