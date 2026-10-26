// Mon Deck : crée, modifie, importe et exporte des decks, enregistrés côté serveur (decks/user/*.ydk,
// jouables dans les salles dès qu'ils ont 40 cartes). Pensé d'abord pour le téléphone :
//   - large (ordinateur, téléphone en paysage) : la bibliothèque à gauche, le deck à droite ;
//   - étroit (portrait) : un seul panneau à la fois, un sélecteur en bas pour passer de l'un à l'autre.
// La logique (ajout, limites, tri, recherche, vérification) est dans deck/model.ts, testée à part.
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { StateUpdater } from 'preact/hooks'
import type { DeckInfo } from '../../shared/protocol.ts'
import { api } from '../app/api.ts'
import { guestStorageAvailable } from '../app/guest.ts'
import { redraw } from '../app/render.ts'
import { saved, store } from '../app/store.ts'
import { navigate } from '../app/navigation.ts'
import { Button, IconButton } from '../ui/Button.tsx'
import { Card } from '../ui/Card.tsx'
import { CardDetail } from '../ui/CardDetail.tsx'
import { fromMini, imgUrl, nameOf, stat, typeLine } from '../ui/cardview.ts'
import type { ClientCard } from '../ui/cardview.ts'
import { cx } from '../ui/cx.ts'
import { ATTRIBUTE, RACE } from '../ui/i18n.ts'
import { Icon } from '../ui/Icon.tsx'
import { useDialog } from '../ui/useDialog.ts'
import { editHistory, newHistory, readWorkspace, WORKSPACE_KEY } from './deck/workspace.ts'
import type { Workspace } from './deck/workspace.ts'
import { Select } from '../ui/Select.tsx'
import { COPIES_MAX, EXTRA_MAX, MAIN_MAX, MAIN_MIN, addCard, check, copiesOf, emptyDraft, fingerprint, isFiltering, noFilters, partOf, removeCard, search, sections, toYdk, whyNotAdd } from './deck/model.ts'
import type { Draft, Filters, Part } from './deck/model.ts'
import { FormatCheck } from './deck/FormatCheck.tsx'
import { t, tx } from '../i18n.ts'

/** Bandeau d'information refermé pendant la séance. */
const BANNER_KEY = 'deck-banner-hidden'

/** Cartes affichées dans la liste de recherche, par page. */
const PAGE = 40

interface Mine extends DeckInfo {
  /** Faux pour un brouillon : moins de 40 cartes, il n'apparaît pas dans les salles. */
  playable: boolean
}

interface Opened {
  name: string
  series: string
  cover: number
  main: number[]
  extra: number[]
  id: string
  own: boolean
}

// ───────────────────────── Catalogue ─────────────────────────

/** Carte d'un deck qui n'est pas dans data/cards.json : fiche minimale, pour qu'on puisse quand même la retirer. */
const placeholders = new Map<number, ClientCard>()
const lookup = {
  get(id: number): ClientCard | undefined {
    const known = store.cards.get(id)
    if (known) return known
    let c = placeholders.get(id)
    if (!c) {
      c = fromMini(id, { name: t('deck.cardN', { id }), atk: 0, def: 0, level: 0, token: false })
      placeholders.set(id, c)
    }
    return c
  },
}

const KINDS: Filters['kind'][] = ['all', 'monster', 'spell', 'trap', 'extra']

const SPELL_TRAP_KINDS = ['Normal', 'Continuous', 'Quick-Play', 'Equip', 'Field', 'Ritual', 'Counter']
/** Races de monstres (celles qui ne sont pas des sous-types de Magie / Piège). */
const MONSTER_RACES = Object.keys(RACE).filter((r) => !SPELL_TRAP_KINDS.includes(r))

// ───────────────────────── Petits composants ─────────────────────────

/** Fenêtre posée par-dessus l'écran : un titre, une croix, du contenu qui défile. */
function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ComponentChildren }): JSX.Element {
  const ref = useDialog(onClose)
  return (
    <div class="dk-overlay" onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div class={cx('dk-dialog glass', wide && 'wide')} role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} ref={ref}>
        <header>
          <h2>{title}</h2>
          <button type="button" class="btn icon" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div class="dk-dialog-body">{children}</div>
      </div>
    </div>
  )
}

/** Fiche d'une carte : lecture complète, et de quoi en ajouter ou en retirer. */
function Sheet(p: { card: ClientCard; draft: Draft; onAdd: () => void; onRemove: () => void; onCover: () => void; onClose: () => void }): JSX.Element {
  const ref = useDialog(p.onClose)
  const copies = copiesOf(p.draft, p.card.id)
  const why = whyNotAdd(p.draft, p.card)
  const part = partOf(p.card)
  return (
    <div class="dk-overlay" onClick={(ev) => ev.target === ev.currentTarget && p.onClose()}>
      <div class="dk-sheet glass" role="dialog" aria-modal="true" tabIndex={-1} aria-label={nameOf(p.card)} ref={ref}>
        <div class="dk-sheet-body detail">
          <CardDetail split card={p.card} />
        </div>
        <footer>
          <div class="dk-stepper" aria-label={t('deck.copiesOf', { name: nameOf(p.card) })}>
            <button type="button" class="btn icon" aria-label={t('deck.removeOne')} disabled={!copies} onClick={p.onRemove}>
              −
            </button>
            <span>
              <b>{copies}</b>/{COPIES_MAX}
            </span>
            <button type="button" class="btn icon" aria-label={t('deck.addOne')} disabled={!!why} onClick={p.onAdd}>
              +
            </button>
          </div>
          <small class="dk-why">{why ? t(why.key, why.params) : part === 'extra' ? t('deck.goesExtra') : t('deck.goesMain')}</small>
          {copies > 0 && (
            <Button small icon="image" variant={p.draft.cover === p.card.id ? 'primary' : undefined} onClick={p.onCover}>
              {p.draft.cover === p.card.id ? t('deck.coverOn') : t('deck.coverSet')}
            </Button>
          )}
        </footer>
      </div>
    </div>
  )
}

const unitLine = (c: ClientCard): string => {
  const mon = c.frameType !== 'spell' && c.frameType !== 'trap'
  if (!mon) return typeLine(c)
  const lv = c.frameType === 'link' ? t('deck.link', { n: c.linkval ?? 0 }) : /xyz/.test(c.frameType) ? t('deck.rank', { n: c.level ?? 0 }) : `★${c.level ?? 0}`
  return `${lv} · ${stat(c.atk)}${c.frameType === 'link' ? '' : ` / ${stat(c.def)}`} · ${typeLine(c)}`
}

// ───────────────────────── Écran ─────────────────────────

export function DeckScreen(): JSX.Element {
  const [initial] = useState(readWorkspace)
  const [history, setHistory] = useState(initial.history)
  const draft = history.entries[history.index]!.draft
  const setDraft = (value: StateUpdater<Draft>): void => setHistory((h) => editHistory(h, typeof value === 'function' ? value(h.entries[h.index]!.draft) : value))
  const replaceDraft = (next: Draft): void => setHistory(newHistory(next))
  const [printSaved, setPrintSaved] = useState(initial.printSaved)
  const [filters, setFilters] = useState<Filters>(initial.filters)
  const [advanced, setAdvanced] = useState(initial.advanced)
  const [shown, setShown] = useState(PAGE)
  const [view, setView] = useState<'cards' | 'deck'>(initial.view)
  const [part, setPart] = useState<Part>(initial.part)
  const [sheet, setSheet] = useState<number | null>(null)
  const [deckTab, setDeckTab] = useState<'mine' | 'game'>(initial.deckTab)
  const [deckQuery, setDeckQuery] = useState(initial.deckQuery)
  const [dialog, setDialog] = useState<'decks' | 'import' | 'export' | 'leave' | 'history' | { remove: Mine } | null>(null)
  const [mine, setMine] = useState<Mine[]>([])
  /** Anciens decks d'avant les comptes, à récupérer (ordinateur hôte seulement). */
  const [legacy, setLegacy] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null)
  const [localSave, setLocalSave] = useState<'pending' | 'saved' | 'failed'>('pending')
  /** Cartes que le moteur a refusées à l'enregistrement (il ne les connaît pas). */
  const [bad, setBad] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [importText, setImportText] = useState(initial.importText)
  const [importError, setImportError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const workspace = useRef<Workspace>(initial)
  workspace.current = { history, printSaved, filters, advanced, part, view, importText, deckTab, deckQuery }
  useEffect(() => {
    setLocalSave('pending')
    const timer = setTimeout(() => {
      const content = JSON.stringify(workspace.current)
      saved.set(WORKSPACE_KEY, content)
      setLocalSave(saved.get(WORKSPACE_KEY) === content ? 'saved' : 'failed')
    }, 200)
    return () => clearTimeout(timer)
  }, [history, printSaved, filters, advanced, part, view, importText, deckTab, deckQuery])
  useEffect(() => {
    const flush = (): void => saved.set(WORKSPACE_KEY, JSON.stringify(workspace.current))
    const hidden = (): void => { if (document.hidden) flush() }
    addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => { flush(); removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden) }
  }, [])
  // Bandeau refermé pour la séance (l'onglet) : il revient au prochain lancement, l'information n'est pas perdue.
  const [guestHidden, setGuestHidden] = useState(() => { try { return sessionStorage.getItem(BANNER_KEY) ?? '' } catch { return '' } })
  const hideBanner = (which: 'hint' | 'legacy'): void => {
    setGuestHidden(which)
    try { sessionStorage.setItem(BANNER_KEY, which) } catch { /* stockage indisponible : refermé jusqu'au rechargement */ }
  }
  const restore = (index: number): void => { setHistory((h) => ({ ...h, index })); setBad(new Set()); setNote(null) }

  const dirty = fingerprint(draft) !== printSaved
  const report = useMemo(() => check(draft, lookup), [draft])
  const found = useMemo(() => search(store.cards.values(), filters, shown), [filters, shown])
  const groups = useMemo(() => sections(draft[part], part, lookup), [draft, part])
  const originals = store.decks.filter((d) => !d.id.startsWith('user-'))

  const say = (text: string, good = true): void => setNote({ text, good })
  useEffect(() => {
    if (!note?.good) return
    const t = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(t)
  }, [note])

  /** Relit mes decks sur le serveur et met à jour la liste des salles (les brouillons n'y figurent pas). */
  const reload = async (): Promise<void> => {
    try {
      const { ok, body } = await api<Mine[]>('/api/decks')
      if (!ok || !body) return
      setMine(body)
      store.decks = [...store.decks.filter((d) => !d.id.startsWith('user-')), ...body.filter((d) => d.playable)]
      redraw()
    } catch {
      say(t('deck.say.offline'), false)
    }
  }
  useEffect(() => void reload(), [store.user?.id])
  useEffect(() => {
    if (store.user) void api<{ count: number }>('/api/decks/legacy').then((r) => setLegacy(r.ok && r.body ? r.body.count : 0))
    else setLegacy(0)
  }, [store.user?.id])

  const setFilter = (patch: Partial<Filters>): void => {
    setFilters((f) => ({ ...f, ...patch }))
    setShown(PAGE)
  }
  const open = (id: number): void => setSheet(id)

  const add = (c: ClientCard): void => {
    const why = whyNotAdd(draft, c)
    if (why) return say(t(why.key, why.params), false)
    setDraft((d) => addCard(d, c))
    setNote(null)
  }
  const remove = (c: ClientCard, from?: Part): void => setDraft((d) => removeCard(d, c, from))

  /** Lance l'action, après avoir demandé quoi faire des changements non enregistrés. */
  const guard = (run: () => void): void => {
    if (!dirty) return run()
    setPending(() => run)
    setDialog('leave')
  }
  const goHome = (): void => {
    navigate('home')
  }

  const save = async (): Promise<boolean> => {
    if (!draft.name.trim()) {
      say(t('deck.say.needName'), false)
      nameRef.current?.focus()
      return false
    }
    // Un nouveau deck au nom déjà pris écraserait l'autre en silence : on le refuse.
    if (!draft.editing && mine.some((m) => m.name.trim().toLowerCase() === draft.name.trim().toLowerCase())) {
      say(t('deck.say.dupName'), false)
      nameRef.current?.focus()
      return false
    }
    setBusy(true)
    try {
      const sent = draft
      const { ok, status, body } = await api<{ deck?: Mine; error?: string; unplayable?: number[] }>('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        json: { deck: { name: sent.name, series: sent.series, cover: sent.cover ?? undefined, main: sent.main, extra: sent.extra, replaces: sent.editing ?? undefined } },
      })
      if (!ok || !body?.deck) {
        setBad(new Set(body?.unplayable ?? []))
        say(status === 401 ? t('deck.say.needAccount') : body?.error ? tx(body.error) : t('deck.say.saveFail'), false)
        return false
      }
      setBad(new Set())
      setDraft((d) => ({ ...d, editing: body.deck?.id ?? null }))
      setPrintSaved(fingerprint(sent))
      say(body.deck.playable ? t('deck.savedOk', { name: body.deck.name }) : t('deck.savedDraft', { name: body.deck.name, n: Math.max(0, MAIN_MIN - sent.main.length) }))
      await reload()
      return true
    } catch {
      say(t('deck.say.unreachable'), false)
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Ouvre un deck du serveur. Un deck d'origine devient une copie à soi (on ne modifie pas les decks du projet). */
  const openDeck = async (id: string): Promise<void> => {
    try {
      const { ok, body } = await api<Opened>(`/api/decks/${encodeURIComponent(id)}`)
      if (!ok || !body) return say(t('deck.say.notFound'), false)
      const next: Draft = { editing: body.own ? body.id : null, name: body.own ? body.name : t('deck.copyOf', { name: body.name }), series: body.own ? body.series : 'Mes decks', cover: body.cover || null, main: body.main, extra: body.extra }
      replaceDraft(next)
      setPrintSaved(body.own ? fingerprint(next) : '')
      setBad(new Set())
      setPart('main')
      setDialog(null)
      setView('deck')
      say(body.own ? `« ${body.name} » ouvert.` : `Copie de « ${body.name} » : modifie-la puis enregistre-la.`)
    } catch {
      say(t('deck.say.unreachable'), false)
    }
  }

  const fresh = (): void => {
    replaceDraft(emptyDraft())
    setPrintSaved(fingerprint(emptyDraft()))
    setBad(new Set())
    setPart('main')
    setDialog(null)
    setNote(null)
  }

  const removeDeck = async (d: Mine): Promise<void> => {
    try {
      const { ok } = await api('/api/decks/' + encodeURIComponent(d.id), { method: 'DELETE' })
      if (!ok) return say(t('deck.deleteFail'), false)
      if (draft.editing === d.id) {
        setDraft((x) => ({ ...x, editing: null }))
        setPrintSaved('')
      }
      setDialog('decks')
      await reload()
    } catch {
      say(t('deck.say.unreachable'), false)
    }
  }

  const runImport = async (): Promise<void> => {
    const text = importText.trim()
    if (text.length < 10) return setImportError(t('deck.importPaste'))
    setBusy(true)
    setImportError(null)
    try {
      const { ok, body } = await api<{ result?: { name: string | null; main: number[]; extra: number[]; unknown: number[] }; error?: string }>('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        json: { text },
      })
      if (!ok || !body?.result) return setImportError(body?.error ? tx(body.error) : t('deck.importFail'))
      const r = body.result
      // Les copies en trop sont retirées plutôt que de faire échouer l'enregistrement.
      const seen = new Map<number, number>()
      const keep = (codes: number[]): number[] => codes.filter((c) => (seen.set(c, (seen.get(c) ?? 0) + 1).get(c) ?? 0) <= COPIES_MAX)
      const main = keep(r.main).slice(0, MAIN_MAX)
      const extra = keep(r.extra).slice(0, EXTRA_MAX)
      replaceDraft({ editing: null, name: r.name ?? t('deck.importedName'), series: 'Import', cover: null, main, extra })
      setPrintSaved('')
      setBad(new Set())
      setDialog(null)
      setImportText('')
      setView('deck')
      const lost = r.main.length + r.extra.length - main.length - extra.length
      say(t('deck.imported', { m: main.length, e: extra.length, unknown: r.unknown.length ? t('deck.importedUnknown', { n: r.unknown.length }) : '', lost: lost > 0 ? t('deck.importedLost', { n: lost }) : '' }))
    } catch {
      setImportError(t('deck.say.unreachable'))
    } finally {
      setBusy(false)
    }
  }

  const copyYdk = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      say(t('deck.ydkCopied'))
    } catch {
      // Sans HTTPS (le téléphone sur le Wi-Fi), le presse-papiers est refusé : on laisse le texte sélectionné.
      document.querySelector<HTMLTextAreaElement>('.dk-dialog textarea')?.select()
      say(t('deck.copyFail'), false)
    }
  }

  const sheetCard = sheet === null ? null : (lookup.get(sheet) ?? null)
  const mainState = draft.main.length < MAIN_MIN ? 'warn' : 'ok'

  return (
    <div class="dk" data-view={view}>
      {/* ── Barre du haut ── */}
      <header class="dk-top">
        <button type="button" class="btn icon" aria-label={t('deck.backHome')} data-act="deck-back" onClick={goHome}>
          <Icon name="back" />
        </button>
        <label class="dk-name">
          <input ref={nameRef} name="deck-name" value={draft.name} placeholder={t('deck.name')} maxLength={40} autocomplete="off" onInput={(e) => setDraft((d) => ({ ...d, name: (e.currentTarget as HTMLInputElement).value }))} />
        </label>
        <span class={cx('dk-chip', mainState)} title={t('deck.mainTip')}>
          {t('deck.main')} <b>{draft.main.length}</b>/{MAIN_MAX}
        </span>
        <span class="dk-chip" title={t('deck.extraTip')}>
          {t('deck.extra')} <b>{draft.extra.length}</b>/{EXTRA_MAX}
        </span>
        <Button small act="deck-decks" icon="deck" class="dk-decks" aria-label={t('deck.decks')} onClick={() => setDialog('decks')}>
          <span class="dk-lbl">{t('deck.decks')}</span>
        </Button>
        <div class="dk-history-tools">
          <Button small icon="undo" disabled={busy || history.index === 0} onClick={() => restore(history.index - 1)} aria-label={t('ui.undoEdit')} />
          <Button small icon="redo" disabled={busy || history.index === history.entries.length - 1} onClick={() => restore(history.index + 1)} aria-label={t('ui.redoEdit')} />
          <Button small icon="history" aria-label={t('ui.deckHistory')} onClick={() => setDialog('history')}><span class="dk-lbl">{t('ui.deckHistory')}</span></Button>
        </div>
        <Button small variant="primary" act="deck-save" icon="check" class="dk-save" aria-label={!dirty && draft.editing ? t('deck.saved') : t('common.save')} disabled={busy || (!dirty && !!draft.editing)} onClick={() => void save()}>
          <span class="dk-lbl">{!dirty && draft.editing ? t('deck.saved') : t('common.save')}</span>
        </Button>
      </header>
      <div class="dk-workspace-status"><span class={localSave === 'failed' ? 'failed' : dirty ? 'local' : 'synced'} role="status"><i />{t(localSave === 'failed' ? 'ui.draftStorageError' : localSave === 'pending' ? 'ui.draftSaving' : dirty ? 'ui.draftLocal' : 'ui.deckSynced')}</span><small>{t('ui.workspaceKept')}</small></div>
      {note && (
        <p class={cx('dk-note', note.good ? 'good' : 'bad')} role="status" onClick={() => setNote(null)}>
          {note.text}
        </p>
      )}

      {/* Les bandeaux d'information se referment : sur téléphone, chaque ligne compte. Une erreur de stockage reste affichée. */}
      {!store.user && (guestHidden !== 'hint' || !guestStorageAvailable()) && (
        <p class="dk-note guest" role="status">
          <span>{t(guestStorageAvailable() ? 'guest.decksHint' : 'guest.storageUnavailable')}</span>
          {guestStorageAvailable() && <IconButton class="dk-note-x" icon="close" label={t('common.close')} onClick={() => hideBanner('hint')} />}
        </p>
      )}
      {store.user && legacy > 0 && guestHidden !== 'legacy' && (
        <p class="dk-note good" role="status">
          <span>{t('deck.legacyBanner', { n: legacy })}</span> <Button small act="deck-legacy" onClick={() => navigate('account')}>{t('deck.legacyBtn')}</Button>
          <IconButton class="dk-note-x" icon="close" label={t('common.close')} onClick={() => hideBanner('legacy')} />
        </p>
      )}

      <div class="dk-body">
        {/* ── Bibliothèque ── */}
        <section class="dk-lib" aria-label={t('deck.library')}>
          <div class="dk-search">
            <input name="q" type="search" value={filters.text} placeholder={t('deck.search')} autocomplete="off" onInput={(e) => setFilter({ text: (e.currentTarget as HTMLInputElement).value })} />
            <button type="button" class={cx('btn small dk-filters', advanced && 'primary')} aria-expanded={advanced} aria-label={t('deck.filters')} onClick={() => setAdvanced((v) => !v)}>
              <Icon name="filter" />
              <span class="dk-lbl">{t('deck.filters')}</span>
            </button>
          </div>
          <div class="dk-kinds" role="group" aria-label={t('deck.kindGroup')}>
            {KINDS.map((k) => (
              <button type="button" key={k} class={cx('dk-kind', filters.kind === k && 'on')} onClick={() => setFilter({ kind: k, race: '', level: null })}>
                {t(`deck.kind.${k}`)}
              </button>
            ))}
          </div>
          {advanced && (
            <div class="dk-adv">
              {filters.kind !== 'spell' && filters.kind !== 'trap' && (
                <>
                  <label>
                    <small>{t('deck.attribute')}</small>
                    <Select value={filters.attribute} onChange={(v) => setFilter({ attribute: v })} choices={[{ value: '', label: t('deck.all') }, ...Object.entries(ATTRIBUTE).map(([k, v]) => ({ value: k, label: v }))]} />
                  </label>
                  <label>
                    <small>{t('deck.type')}</small>
                    <Select value={filters.race} onChange={(v) => setFilter({ race: v })} choices={[{ value: '', label: t('deck.all') }, ...MONSTER_RACES.map((k) => ({ value: k, label: RACE[k] as string }))]} />
                  </label>
                  <label>
                    <small>{t('deck.level')}</small>
                    <Select value={String(filters.level ?? '')} onChange={(v) => setFilter({ level: v === '' ? null : Number(v) })} choices={[{ value: '', label: t('deck.all') }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))]} />
                  </label>
                </>
              )}
              {(filters.kind === 'spell' || filters.kind === 'trap') && (
                <label>
                  <small>{t('deck.subtype')}</small>
                  <Select value={filters.race} onChange={(v) => setFilter({ race: v })} choices={[{ value: '', label: t('deck.all') }, ...SPELL_TRAP_KINDS.filter((k) => filters.kind === 'spell' || !['Equip', 'Field', 'Ritual'].includes(k)).map((k) => ({ value: k, label: RACE[k] as string }))]} />
                </label>
              )}
              <button type="button" class="btn small" onClick={() => setFilters((f) => ({ ...noFilters(), text: f.text }))}>
                {t('deck.clear')}
              </button>
            </div>
          )}
          <div class="dk-results">
            {!isFiltering(filters) && <p class="dk-hint">{t('deck.typeMore')}</p>}
            {isFiltering(filters) && !found.list.length && <p class="dk-hint">{t('deck.noMatch')}</p>}
            {found.list.map((c) => {
              const n = copiesOf(draft, c.id)
              const full = !!whyNotAdd(draft, c)
              return (
                <div class={cx('dk-row', n > 0 && 'has')} key={c.id} data-frame={c.frameType.replace(/_pendulum$/, '')}>
                  <button type="button" class="dk-row-main" onClick={() => open(c.id)}>
                    <img src={imgUrl(c.id)} alt="" loading="lazy" />
                    <span>
                      <b>{nameOf(c)}</b>
                      <small>{unitLine(c)}</small>
                    </span>
                  </button>
                  <div class="dk-qty">
                    {n > 0 && (
                      <>
                        <button type="button" class="btn icon" aria-label={t('deck.removeCard', { name: nameOf(c) })} onClick={() => remove(c)}>
                          −
                        </button>
                        <b>{n}</b>
                      </>
                    )}
                    <button type="button" class="btn icon" aria-label={t('deck.addCard', { name: nameOf(c) })} disabled={full} onClick={() => add(c)}>
                      +
                    </button>
                  </div>
                </div>
              )
            })}
            {found.more && (
              <Button small onClick={() => setShown((n) => n + PAGE)}>
                {t('deck.more')}
              </Button>
            )}
          </div>
        </section>

        {/* ── Le deck ── */}
        <section class="dk-deck" aria-label={t('deck.building')}>
          <div class="dk-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={part === 'main'} class={cx('dk-tab', part === 'main' && 'on')} onClick={() => setPart('main')}>
              {t('deck.mainDeck')} <b>{draft.main.length}</b>
            </button>
            <button type="button" role="tab" aria-selected={part === 'extra'} class={cx('dk-tab', part === 'extra' && 'on')} onClick={() => setPart('extra')}>
              {t('deck.extraDeck')} <b>{draft.extra.length}</b>
            </button>
          </div>
          <p class={cx('dk-status', report.playable ? 'ok' : 'warn')}>
            {report.playable ? <Icon name="check" /> : <Icon name="info" />}
            <span>
              {report.playable ? t('deck.playable') : report.todo[0] ? t(report.todo[0].key, report.todo[0].params) : ''} <em>{t('deck.counts', { m: report.monsters, s: report.spells, t: report.traps })}</em>
            </span>
          </p>
          <FormatCheck main={draft.main} extra={draft.extra} onOpen={open} />
          <div class="dk-cards">
            {!groups.length && <p class="dk-hint">{part === 'main' ? t('deck.emptyMain') : t('deck.emptyExtra')}</p>}
            {groups.map((s) => (
              <div class="dk-section" key={s.title}>
                <h4>
                  {t(s.title)} <small>{s.total}</small>
                </h4>
                <div class="dk-grid">
                  {s.groups.map(({ card, count }) => (
                    <div class={cx('dk-tile', bad.has(card.id) && 'bad')} key={card.id}>
                      <div class="dk-open" role="button" tabIndex={0} aria-label={t('deck.view', { name: nameOf(card) })} onClick={() => open(card.id)} onKeyDown={(e) => e.key === 'Enter' && open(card.id)}>
                        <Card card={card} size="md" />
                      </div>
                      {count > 1 && <em>×{count}</em>}
                      <button type="button" class="dk-minus" aria-label={t('deck.removeCopy', { name: nameOf(card) })} onClick={() => remove(card, part)}>
                        −
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Étroit : un seul panneau, on bascule d'ici. */}
      <nav class="dk-nav" aria-label={t('deck.panel')}>
        <button type="button" class={cx(view === 'cards' && 'on')} onClick={() => setView('cards')}>
          {t('deck.cards')}
        </button>
        <button type="button" class={cx(view === 'deck' && 'on')} onClick={() => setView('deck')}>
          {t('deck.myDeck')} <b>{draft.main.length + draft.extra.length}</b>
        </button>
      </nav>

      {sheetCard && (
        <Sheet
          card={sheetCard}
          draft={draft}
          onAdd={() => add(sheetCard)}
          onRemove={() => remove(sheetCard)}
          onCover={() => setDraft((d) => ({ ...d, cover: d.cover === sheetCard.id ? null : sheetCard.id }))}
          onClose={() => setSheet(null)}
        />
      )}

      {dialog === 'history' && (
        <Dialog title={t('ui.deckHistory')} onClose={() => setDialog(null)}>
          <p class="muted">{t('ui.historyHint')}</p>
          <ol class="revision-list">{history.entries.map((entry, i) => {
            const before = history.entries[i - 1]?.draft
            const added = before ? entry.draft.main.length + entry.draft.extra.length - before.main.length - before.extra.length : 0
            const label = !before ? t('ui.historyStart') : added > 0 ? t('ui.historyAdded', { n: added }) : added < 0 ? t('ui.historyRemoved', { n: -added }) : before.name !== entry.draft.name ? t('ui.historyRenamed') : t('ui.historyUpdated')
            return <li key={`${entry.time}-${i}`} class={i === history.index ? 'current' : ''}><button type="button" disabled={busy} onClick={() => restore(i)} aria-current={i === history.index ? 'step' : undefined}><Icon name={i === history.index ? 'check' : 'history'} /><span><b>{label}</b><small>{entry.draft.name || t('deck.name')} · {entry.draft.main.length} + {entry.draft.extra.length} Extra</small></span><time>{new Date(entry.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></button></li>
          })}</ol>
        </Dialog>
      )}

      {dialog === 'decks' && (
        <Dialog title={t('deck.decks')} wide onClose={() => setDialog(null)}>
          <div class="dk-browser">
            <div class="dk-browser-bar">
              <div class="dk-seg" role="tablist">
                <button type="button" role="tab" aria-selected={deckTab === 'mine'} class={cx(deckTab === 'mine' && 'on')} onClick={() => setDeckTab('mine')}>
                  {t('deck.mine')} <b>{mine.length}</b>
                </button>
                <button type="button" role="tab" aria-selected={deckTab === 'game'} class={cx(deckTab === 'game' && 'on')} onClick={() => setDeckTab('game')}>
                  {t('deck.game')} <b>{originals.length}</b>
                </button>
              </div>
              <input class="dk-find" type="search" placeholder={t('deck.findDeck')} value={deckQuery} onInput={(e) => setDeckQuery((e.currentTarget as HTMLInputElement).value)} />
            </div>
            <div class="dk-actions">
              <Button small variant="primary" act="deck-new" onClick={() => guard(fresh)}>
                {t('deck.new')}
              </Button>
              <Button small onClick={() => setDialog('import')}>
                {t('deck.import')}
              </Button>
              <Button small disabled={!draft.main.length && !draft.extra.length} onClick={() => setDialog('export')}>
                {t('deck.exportYdk')}
              </Button>
            </div>
            <div class="dk-tiles">
              {deckTab === 'game' && <p class="dk-hint dk-wide">{t('deck.copyHint')}</p>}
              {(deckTab === 'mine' ? mine : originals)
                .filter((d) => d.name.toLowerCase().includes(deckQuery.trim().toLowerCase()))
                .map((d) => (
                  <div class={cx('dk-tilecard', deckTab === 'mine' && draft.editing === d.id && 'on')} key={d.id}>
                    <button type="button" class="dk-pick" onClick={() => guard(() => void openDeck(d.id))}>
                      <span class="dk-art" style={{ backgroundImage: `url(${imgUrl(d.cover)})` }} />
                      <b>{d.name}</b>
                      <small>
                        {d.mainCount} + {d.extraCount} Extra
                        {'playable' in d && !(d as Mine).playable ? <i> · {t('deck.draft')}</i> : ''}
                        {'series' in d && deckTab === 'game' ? ` · ${d.series}` : ''}
                      </small>
                    </button>
                    {deckTab === 'mine' && (
                      <button type="button" class="dk-del" aria-label={t('deck.deleteDeck', { name: d.name })} onClick={() => setDialog({ remove: d as Mine })}>
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                ))}
              {deckTab === 'mine' && !mine.length && <p class="dk-hint dk-wide">{t('deck.noneYet')}</p>}
            </div>
          </div>
        </Dialog>
      )}

      {dialog === 'import' && (
        <Dialog title={t('deck.importTitle')} onClose={() => setDialog('decks')}>
          <label class="dk-field">
            <small>{t('deck.importHint')}</small>
            <textarea name="import" rows={7} value={importText} placeholder={t('deck.importPlaceholder')} onInput={(e) => setImportText((e.currentTarget as HTMLTextAreaElement).value)} />
          </label>
          {dirty && <p class="dk-note bad">{t('deck.importReplaces')}</p>}
          {importError && <p class="dk-note bad">{importError}</p>}
          <div class="dk-actions">
            <Button variant="primary" disabled={busy} onClick={() => void runImport()}>
              {busy ? t('deck.importing') : t('deck.import')}
            </Button>
          </div>
        </Dialog>
      )}

      {dialog === 'export' && (
        <Dialog title={t('deck.exportTitle')} onClose={() => setDialog('decks')}>
          <label class="dk-field">
            <small>{t('deck.exportHint')}</small>
            <textarea name="export" rows={9} readOnly value={toYdk(draft)} onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
          </label>
          <div class="dk-actions">
            <Button variant="primary" onClick={() => void copyYdk(toYdk(draft))}>
              {t('deck.copy')}
            </Button>
          </div>
        </Dialog>
      )}

      {dialog === 'leave' && (
        <Dialog
          title={t('deck.unsavedTitle')}
          onClose={() => {
            setPending(null)
            setDialog(null)
          }}
        >
          <p>{t('deck.unsavedText')}</p>
          <div class="dk-actions">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void save().then((saved) => {
                  if (!saved) return setDialog(null)
                  setDialog(null)
                  pending?.()
                  setPending(null)
                })
              }
            >
              {t('common.save')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialog(null)
                // Les changements sont abandonnés : le brouillon redevient « propre » avant de poursuivre.
                setPrintSaved(fingerprint(draft))
                const next = pending
                setPending(null)
                setTimeout(() => next?.(), 0)
              }}
            >
              {t('deck.discard')}
            </Button>
            <Button
              onClick={() => {
                setPending(null)
                setDialog(null)
              }}
            >
              {t('deck.stay')}
            </Button>
          </div>
        </Dialog>
      )}

      {typeof dialog === 'object' && dialog && (
        <Dialog title={t('deck.deleteTitle')} onClose={() => setDialog('decks')}>
          <p>
            {t('deck.deleteText', { name: dialog.remove.name })}
          </p>
          <div class="dk-actions">
            <Button variant="danger" act="deck-remove" onClick={() => void removeDeck((dialog as { remove: Mine }).remove)}>
              {t('deck.delete')}
            </Button>
            <Button onClick={() => setDialog('decks')}>{t('common.cancel')}</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

