// Vérification d'un deck face à un format : le serveur applique la liste, l'éditeur montre ce qui ne va pas (et pourquoi).
import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { FormatCheck as Check, FormatId } from '../../../shared/formats.ts'
import { api } from '../../app/api.ts'
import { saved, store } from '../../app/store.ts'
import { cx } from '../../ui/cx.ts'
import { Icon } from '../../ui/Icon.tsx'
import { FormatBadge, FormatNotes, FormatSelect } from '../../ui/rules.tsx'
import { nameOf } from '../../ui/cardview.ts'
import { t, tx } from '../../i18n.ts'

const KEY = 'deck-format'
/** Au plus ce nombre de défauts est détaillé ; les autres sont comptés. */
const SHOWN = 5

function remembered(): FormatId {
  const id = saved.get(KEY) as FormatId | null
  return store.formats.some((f) => f.id === id && f.status !== 'missing') ? (id as FormatId) : 'casual'
}

export function FormatCheck({ main, extra, onOpen }: { main: number[]; extra: number[]; onOpen: (card: number) => void }): JSX.Element {
  const [format, setFormat] = useState<FormatId>(remembered)
  const [result, setResult] = useState<Check | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    // Un peu d'attente pendant la frappe : une seule vérification quand l'édition se calme.
    const timer = setTimeout(() => {
      void api<Check>('/api/formats/check', { method: 'POST', json: { format, main, extra } })
        .then((r) => (r.ok && r.body ? setResult(r.body) : setFailed(true)))
        .catch(() => setFailed(true))
    }, 300)
    return () => clearTimeout(timer)
  }, [format, main, extra])

  const pick = (id: FormatId): void => {
    setFormat(id)
    saved.set(KEY, id)
  }
  const blocking = result?.issues.filter((i) => i.level === 'blocking') ?? []
  const info = result?.issues.filter((i) => i.level === 'info') ?? []
  const casual = format === 'casual'
  return (
    <section class="dk-format" aria-label={t('deck.formatCheck')}>
      <div class="dk-format-bar">
        <small>{t('deck.format')}</small>
        <FormatSelect value={format} onChange={pick} />
        <FormatBadge id={format} plain />
        {result?.points && (
          <span class={cx('dk-chip', result.points.used > result.points.cap ? 'warn' : 'ok')} title={t('deck.pointsTip')}>
            {t('deck.points')} <b>{result.points.used}</b>/{result.points.cap}
          </span>
        )}
      </div>
      {failed && <p class="dk-hint">{t('deck.formatOffline')}</p>}
      {result && !casual && (
        <p class={cx('dk-status', result.legal ? 'ok' : 'warn')} role="status">
          <Icon name={result.legal ? 'check' : 'info'} />
          <span>{result.legal ? t('deck.formatLegal', { format: t(`format.${format}`) }) : t('deck.formatIllegal', { n: blocking.length })}</span>
        </p>
      )}
      {!casual && blocking.length > 0 && (
        <ul class="dk-issues">
          {blocking.slice(0, SHOWN).map((i, k) => (
            <li key={k}>
              {i.card && store.cards.get(i.card) ? (
                <button type="button" class="link" aria-label={t('deck.view', { name: nameOf(store.cards.get(i.card)!) })} onClick={() => onOpen(i.card as number)}>
                  {tx(i.text)}
                </button>
              ) : (
                tx(i.text)
              )}
            </li>
          ))}
          {blocking.length > SHOWN && <li class="muted">{t('deck.formatMore', { n: blocking.length - SHOWN })}</li>}
        </ul>
      )}
      {!casual && info.map((i, k) => (
        <p class="dk-hint" key={k}>
          {tx(i.text)}
        </p>
      ))}
      {!casual && <FormatNotes id={format} />}
    </section>
  )
}
