// Fiche d'une carte : grande carte + texte complet lisible. Sert à la colonne de gauche (ordinateur)
// et à la fiche ouverte par un appui long (téléphone).
import type { ComponentChildren, JSX } from 'preact'
import { Card, CardBack } from './Card.tsx'
import { ATTRIBUTE } from './i18n.ts'
import { descOf, formatDesc, isLink, isMonsterFrame, nameOf, stat, typeLine } from './cardview.ts'
import type { ClientCard, EffectRef } from './cardview.ts'
import { t, tx } from '../i18n.ts'

/** Valeurs d'un monstre sur une ligne : Niveau, ATK, DEF ou Classification Lien, Échelle. */
export function CardNums({ card }: { card: ClientCard }): JSX.Element | null {
  if (!isMonsterFrame(card)) return null
  return (
    <p class="nums">
      {!!card.level && <span>★ {card.level}</span>}
      <span class="atk">{t('card.atk')} {stat(card.atk)}</span>
      {isLink(card) ? <span class="def">{t('card.link')} {card.linkval ?? 0}</span> : <span class="def">{t('card.def')} {stat(card.def)}</span>}
      {card.scale != null && <span>{t('card.scale', { n: card.scale })}</span>}
    </p>
  )
}

export interface CardDetailProps {
  card: ClientCard | null
  /** Résumé fixe (image et caractéristiques), puis description défilante. */
  split?: boolean
  /** Ajouté sous les valeurs : compteurs posés sur cet exemplaire, par exemple. */
  note?: ComponentChildren
  /** Effet en cours d'activation ou en attente dans la chaîne. */
  active?: { n: number; label?: string } | null
  /** Effets déjà utilisés ce tour : une coche les précède. */
  used?: EffectRef[]
  /** Texte affiché quand aucune carte n'est choisie. */
  empty?: string
}

export function CardDetail({ card, note, active, used, empty, split }: CardDetailProps): JSX.Element {
  if (!card) {
    return (
      <div class="detail-empty">
        <CardBack size="lg" />
        <p>{empty ?? t('card.hover')}</p>
      </div>
    )
  }
  const summary = (
    <>
        <h3>{nameOf(card)}</h3>
        {card.name.fr && nameOf(card) !== card.name.en && <p class="en">{card.name.en}</p>}
        <p class="meta">
          {typeLine(card)}
          {card.attribute ? ` · ${ATTRIBUTE[card.attribute] ?? card.attribute}` : ''}
        </p>
        <CardNums card={card} />
        {note}
    </>
  )
  // formatDesc échappe le texte avant d'y poser ses balises.
  const description = <div class="desc" dangerouslySetInnerHTML={{ __html: formatDesc(descOf(card), active?.n, active?.label ? tx(active.label) : '', !isMonsterFrame(card), used?.map((u) => ({ n: u.n, label: u.label ? tx(u.label) : '' }))) }} />
  if (split) return (
    <>
      <div class="card-summary">
        <header class="card-heading"><h3>{nameOf(card)}</h3></header>
        <div class="card-facts"><Card card={card} size="lg" /><div class="detail-text">
          <p class="meta">{typeLine(card)}{card.attribute ? ` · ${ATTRIBUTE[card.attribute] ?? card.attribute}` : ''}</p><CardNums card={card} />{note}
        </div></div>
      </div>
      <div class="card-description detail-text" tabIndex={0}>{description}</div>
    </>
  )
  return <><Card card={card} size="lg" /><div class="detail-text">{summary}{description}</div></>
}
