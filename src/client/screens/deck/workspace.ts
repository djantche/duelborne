// Atelier local : le brouillon et ses révisions survivent aux pages et au rechargement de l'onglet.
import { saved } from '../../app/store.ts'
import { emptyDraft, fingerprint, noFilters } from './model.ts'
import type { Draft, Filters, Part } from './model.ts'

export const WORKSPACE_KEY = 'deck-workspace-v1'
export interface Revision { draft: Draft; time: number }
export interface DraftHistory { entries: Revision[]; index: number }
export interface Workspace {
  history: DraftHistory
  printSaved: string
  filters: Filters
  advanced: boolean
  part: Part
  view: 'cards' | 'deck'
  importText: string
  deckTab: 'mine' | 'game'
  deckQuery: string
}

export const newHistory = (draft: Draft): DraftHistory => ({ entries: [{ draft, time: Date.now() }], index: 0 })

export function editHistory(history: DraftHistory, next: Draft): DraftHistory {
  const current = history.entries[history.index]!
  // L'identifiant attribué par le serveur n'est pas une modification à annuler : toute la lignée garde le même propriétaire.
  if (fingerprint(current.draft) === fingerprint(next)) return { ...history, entries: history.entries.map((entry, i) => ({ ...entry, draft: i === history.index ? next : { ...entry.draft, editing: next.editing } })) }
  const entries = history.entries.slice(0, history.index + 1)
  // Regrouper la frappe du nom plutôt que de créer une révision par lettre.
  const renaming = JSON.stringify({ ...current.draft, name: '' }) === JSON.stringify({ ...next, name: '' })
  const before = entries.at(-2)?.draft
  const alreadyRenaming = before && before.name !== current.draft.name && JSON.stringify({ ...before, name: '' }) === JSON.stringify({ ...current.draft, name: '' })
  if (renaming && alreadyRenaming && Date.now() - current.time < 1000) entries.pop()
  entries.push({ draft: next, time: Date.now() })
  const kept = entries.slice(-40)
  return { entries: kept, index: kept.length - 1 }
}

function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const d = value as Draft
  return typeof d.name === 'string' && d.name.length <= 100 && typeof d.series === 'string' &&
    (d.editing === null || typeof d.editing === 'string') && (d.cover === null || Number.isSafeInteger(d.cover)) &&
    [d.main, d.extra].every((ids, i) => Array.isArray(ids) && ids.length <= (i ? 15 : 60) && ids.every((id) => Number.isSafeInteger(id) && id > 0))
}

export function readWorkspace(): Workspace {
  const defaults: Workspace = { history: newHistory(emptyDraft()), printSaved: fingerprint(emptyDraft()), filters: noFilters(), advanced: false, part: 'main', view: 'cards', importText: '', deckTab: 'mine', deckQuery: '' }
  try {
    const value = saved.get(WORKSPACE_KEY)
    if (!value || value.length > 250_000) return defaults
    const data = JSON.parse(value) as Partial<Workspace>
    const entries = data.history?.entries
    const index = data.history?.index
    if (Array.isArray(entries) && entries.length && entries.length <= 40 && entries.every((e) => e && validDraft(e.draft) && Number.isFinite(e.time)) && Number.isInteger(index) && index! >= 0 && index! < entries.length) defaults.history = { entries, index: index! }
    if (typeof data.printSaved === 'string') defaults.printSaved = data.printSaved
    const f = data.filters
    if (f && ['all', 'monster', 'spell', 'trap', 'extra'].includes(f.kind) && typeof f.text === 'string' && typeof f.race === 'string' && typeof f.attribute === 'string' && (f.level === null || Number.isInteger(f.level))) defaults.filters = f
    defaults.advanced = data.advanced === true
    if (data.part === 'extra') defaults.part = 'extra'
    if (data.view === 'deck') defaults.view = 'deck'
    if (data.deckTab === 'game') defaults.deckTab = 'game'
    if (typeof data.deckQuery === 'string') defaults.deckQuery = data.deckQuery.slice(0, 200)
    if (typeof data.importText === 'string') defaults.importText = data.importText.slice(0, 80_000)
  } catch { /* Un stockage indisponible ou ancien ne doit jamais empêcher d'ouvrir l'atelier. */ }
  return defaults
}
