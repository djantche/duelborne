// Lecture compacte au clic : image, caractéristiques et texte défilant, sur ordinateur et téléphone.
import type { JSX } from 'preact'
import { createPortal } from 'preact/compat'
import { useLayoutEffect, useRef } from 'preact/hooks'
import type { CounterView } from '../../../shared/protocol.ts'
import { store } from '../../app/store.ts'
import { CardDetail } from '../../ui/CardDetail.tsx'
import { descOf, limitedByName, nameOf } from '../../ui/cardview.ts'
import type { ClientCard } from '../../ui/cardview.ts'
import { IconButton } from '../../ui/Button.tsx'
import { useDialog } from '../../ui/useDialog.ts'
import { t } from '../../i18n.ts'
import { closeSheet } from './controller.ts'
import { Counters } from './Board.tsx'
import { duel, effectOfCard, usedEffectsOf } from './state.ts'
import type { ActiveEffect, UsedEffect } from './state.ts'

/** Effet à surligner dans la fiche de l'exemplaire consulté. */
const activeOf = (card: ClientCard | null): ActiveEffect | null => card
  ? (duel.inspectedEffect?.cardId === card.id ? duel.inspectedEffect : effectOfCard(card.id, duel.focusUid)) : null

/** Effets de l'exemplaire consulté déjà utilisés ce tour. */
const usedOf = (card: ClientCard | null): UsedEffect[] => card ? usedEffectsOf(card.id, duel.focusUid, limitedByName(descOf(card))) : []

/** Seul un clic explicite demande ce défilement ; les mises à jour suivantes gardent la position de lecture. */
function useEffectInspection() {
  const ref = useRef<HTMLDivElement>(null)
  const effect = duel.inspectedEffect
  useLayoutEffect(() => {
    if (!effect || effect.cardId !== duel.focusId || !ref.current?.getClientRects().length) return
    const scroller = ref.current.querySelector<HTMLElement>('.card-description')
    const paragraph = scroller?.querySelector<HTMLElement>('.eff-on')
    if (!scroller) return
    scroller.scrollTop = paragraph ? Math.max(0, scroller.scrollTop + paragraph.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8) : 0
    scroller.focus({ preventScroll: true })
  }, [effect, duel.focusId, duel.sheet, duel.pinned])
  return ref
}

const focused = (): ClientCard | null => (duel.focusId === null ? null : (store.cards.get(duel.focusId) ?? null))

/** Compteurs de l'exemplaire dont on lit la fiche, tel que le plateau le montre. */
function focusCounters(): CounterView[] {
  const v = duel.view
  if (!v || duel.focusUid === null) return []
  for (const p of v.players) for (const z of [...p.monsters, ...p.spellTraps, p.fieldZone]) if (z?.card.uid === duel.focusUid) return z.counters ?? []
  return []
}

/** Ordinateur : fiche de la carte explicitement sélectionnée. */
export function DetailColumn(): JSX.Element {
  const ref = useEffectInspection()
  return (
    <div class="detail" id="detail" ref={ref}>
      <CardDetail split card={focused()} active={activeOf(focused())} used={usedOf(focused())} note={<Counters list={focusCounters()} big />} />
    </div>
  )
}

/** Consultation courte au clic ; lecture plein écran à l’appui long. */
export function DetailSheet(): JSX.Element | null {
  const ref = useEffectInspection()
  const dialog = useDialog(closeSheet, !duel.sheet, false)
  const card = focused()
  if (!card || (!duel.pinned && !duel.sheet)) return null
  const content = (
    <div ref={dialog} class={`card-inspector glass${duel.sheet ? ' card-inspector-full' : ''}`} role={duel.sheet ? 'dialog' : 'region'} aria-modal={duel.sheet || undefined} aria-label={nameOf(card)} tabIndex={-1}>
      {duel.sheet && <IconButton class="inspector-close" icon="close" label={t('detail.close')} onClick={closeSheet} />}
      <div class="detail" key={`${card.id}:${duel.focusUid ?? ''}`} ref={ref}>
        <CardDetail split card={card} active={activeOf(card)} used={usedOf(card)} note={<Counters list={focusCounters()} big />} />
      </div>
    </div>
  )
  return duel.sheet ? createPortal(content, document.body) : content
}
