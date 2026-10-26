// La déclaration reste distincte de la lecture d'une carte : désigner une cible, puis confirmer.
import type { JSX } from 'preact'
import { store } from '../../app/store.ts'
import { Button } from '../../ui/Button.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { imgUrl, nameOf } from '../../ui/cardview.ts'
import { t } from '../../i18n.ts'
import { answer, confirmAttack, setDirect } from './controller.ts'
import { duel } from './state.ts'
import { activePrompt, attackTargetOf, isTargeting } from './prompt.ts'

export function AttackDeclaration(): JSX.Element | null {
  const p = activePrompt()
  const v = duel.view
  if (!p || !v) return null
  const targeted = p.kind === 'cards' && isTargeting(p) ? p : null
  if (!duel.direct && !targeted) return null
  const uid = duel.direct?.uid ?? targeted?.attackerUid
  const attacker = v.players[v.you].monsters.find((m) => m?.card.uid === uid)
  const targetUid = targeted ? attackTargetOf(targeted) : null
  const target = v.players[v.you === 0 ? 1 : 0].monsters.find((m) => m?.card.uid === targetUid)
  const known = (id: number | null | undefined): string => { const c = id == null ? null : store.cards.get(id); return c ? nameOf(c) : t('ui.hiddenTarget') }
  const cancelable = duel.direct !== null || targeted?.cancelable
  return (
    <div class="attack-declaration glass" role="region" aria-label={t('ui.declareAttack')}>
      <div class="attack-caption"><Icon name="sword" /><b>{t('ui.declareAttack')}</b><small>{t(duel.direct ? 'ui.directAim' : target ? 'ui.attackAimHint' : 'ui.chooseTarget')}</small></div>
      <div class="attack-matchup">
        <div class="attack-combatant">{attacker?.card.cardId != null && <img src={imgUrl(attacker.card.cardId)} alt="" />}<span><b>{known(attacker?.card.cardId)}</b><small>ATK <strong>{attacker?.atk ?? '?'}</strong></small></span></div>
        <Icon name="next" />
        <div class="attack-combatant foe">{target?.faceUp && target.card.cardId != null ? <img src={imgUrl(target.card.cardId)} alt="" /> : <Icon name={duel.direct ? 'target' : 'shield'} />}<span><b>{duel.direct ? t('duel.direct') : target ? known(target.faceUp ? target.card.cardId : null) : t('ui.chooseTarget')}</b><small>{duel.direct ? `${v.players[v.you === 0 ? 1 : 0].lp} LP` : target ? `${target.position === 'atk' ? 'ATK' : 'DEF'} ${target.faceUp ? (target.position === 'atk' ? target.atk : target.def) ?? '?' : '?'}` : t('ui.confirmHint')}</small></span></div>
      </div>
      <div class="attack-buttons">{cancelable && <Button small icon="close" onClick={() => duel.direct ? setDirect(null) : answer(null)}>{t('p.cancelAttack')}</Button>}<Button small icon="sword" variant="primary" act="confirm-attack" disabled={!duel.direct && !target} onClick={confirmAttack}>{t('ui.confirmAttack')}</Button></div>
    </div>
  )
}
