// Une carte reconstruite dans le navigateur : cadre dessiné en CSS + illustration recadrée (data/images/cropped).
// Toutes les dimensions internes sont en unités « cqw » (relatives à la largeur de la carte) : le même gabarit
// s'affiche correctement à n'importe quelle taille.
import { render } from 'preact'
import type { JSX, VNode } from 'preact'
import { cx } from './cx.ts'
import { Icon, isIcon } from './Icon.tsx'
import { RACE } from './i18n.ts'
import { LINK_ARROWS, descOf, imgUrl, isLink, isMonsterFrame, nameOf, stat, typeLine } from './cardview.ts'
import type { ClientCard } from './cardview.ts'
import { t } from '../i18n.ts'

export interface CardProps {
  /** null : carte inconnue, on montre son dos. */
  card: ClientCard | null
  /** sm = terrain, md = main et fenêtres, lg = fiche (affiche type et texte). */
  size?: 'sm' | 'md' | 'lg'
  /** Identité de la carte sur le plateau : les animations la suivent d'un état à l'autre. */
  uid?: number
  area?: string
  side?: string
  class?: string
  /** Carte face verso que CE joueur a le droit de connaître (pour lire sa fiche). */
  peekId?: number | null
  /** Valeur annoncée sur la carte pendant un choix par somme de Niveaux. */
  lv?: string
}

const place = (p: Omit<CardProps, 'card'>): Record<string, string | number | undefined> => (p.uid === undefined ? {} : { 'data-uid': p.uid, 'data-area': p.area ?? '', 'data-side': p.side ?? '' })

/** Dos de carte (motif original, voir card.css). */
export function CardBack(p: Omit<CardProps, 'card'>): JSX.Element {
  return (
    <div class={cx('card', p.size ?? 'sm', 'back', p.class)} {...place(p)} data-card={p.peekId || undefined} data-lv={p.lv}>
      <div class="c-back" />
    </div>
  )
}

export function Card(p: CardProps): JSX.Element {
  const card = p.card
  if (!card) return <CardBack {...p} />
  const size = p.size ?? 'sm'
  const monster = isMonsterFrame(card)
  const link = isLink(card)
  const name = nameOf(card)
  const nameCls = name.length > 32 ? 'n-xs' : name.length > 24 ? 'n-s' : name.length > 16 ? 'n-m' : ''
  const orb = monster ? (card.attribute ?? '') : card.frameType
  const orbIcon = monster ? (card.attribute ?? '') : card.frameType === 'spell' ? 'spark' : 'trap'
  const level = Math.min(card.level ?? 0, 13)
  return (
    <div class={cx('card', size, `frame-${card.frameType}`, p.class)} {...place(p)} data-card={card.id} data-lv={p.lv}>
      <div class="c-in">
        <div class={cx('c-name', nameCls)}>
          <span>{name}</span>
          <i class={`orb orb-${orb.toLowerCase()}`}>{isIcon(orbIcon) && <Icon name={orbIcon} />}</i>
        </div>
        {link ? (
          <div class="c-kind">Lien</div>
        ) : monster ? (
          <div class={cx('c-stars', /XYZ/.test(card.type) && 'c-rank', level > 10 && 'many')}>
            {Array.from({ length: level }, (_, i) => (
              <i key={i}>★</i>
            ))}
          </div>
        ) : (
          <div class="c-kind">{card.frameType === 'spell' ? t('card.spellCard') : t('card.trapCard')}</div>
        )}
        <div class="c-art">
          {/* Illustration absente (pas encore téléchargée) : le fond de .c-art sert de repli. */}
          <img src={imgUrl(card.id)} alt="" draggable={false} decoding="sync" onError={(ev) => ((ev.currentTarget as HTMLElement).style.display = 'none')} />
          {link && LINK_ARROWS.map((a) => <i key={a} class={cx('arrow', a.toLowerCase(), card.linkmarkers?.includes(a) && 'on')} />)}
        </div>
        <div class="c-box">
          {size === 'lg' && <div class="c-type">[ {typeLine(card)} ]</div>}
          {size === 'lg' && <div class="c-desc">{descOf(card)}</div>}
          {/* Un monstre Lien n'a pas de DEF : il a une Classification Lien. */}
          {monster ? (
            <div class="c-stats">
              <span>
                {t('card.atk')} <b>{stat(card.atk)}</b>
              </span>
              <span>{link ? <>{t('card.link')} <b>{card.linkval ?? 0}</b></> : <>{t('card.def')} <b>{stat(card.def)}</b></>}</span>
            </div>
          ) : (
            <div class="c-stats solo">
              <span>{RACE[card.race] ?? card.race}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Élément du DOM indépendant de l'interface, fabriqué à partir d'un composant : pour le calque d'effets (#fx). */
export function toDom(vnode: VNode): HTMLElement {
  const holder = document.createElement('div')
  render(vnode, holder)
  return holder.firstElementChild as HTMLElement
}

/** Carte flottante pour les animations (face visible si on la connaît, dos sinon). */
export const cardDom = (card: ClientCard | null, p: Omit<CardProps, 'card'> = {}): HTMLElement => toDom(<Card card={card} {...p} />)
