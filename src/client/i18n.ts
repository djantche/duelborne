// Langues de l'interface. Les textes ne sont PAS dans le code : chaque langue est un fichier de src/client/locales/
// (fr.json, en.json…), une table « clé → texte ». Ajouter une langue = déposer un fichier ; il apparaît seul dans les Options.
//
//   t('rooms.free', { n: 2 })             → « 2 places libres » (« {n} » est remplacé ; voir les clés au pluriel ci-dessous)
//
// Pluriel : si la table contient « clé_one » et « clé_other », t() choisit selon le paramètre `n` (1 → _one, sinon _other).
// Une clé absente d'une langue retombe sur le français, puis sur la clé elle-même (visible : on la voit tout de suite).
import { parseMsg } from '../shared/msg.ts'
import { saved } from './app/store.ts'

export interface LocaleFile {
  /** Nom de la langue, dans cette langue (affiché dans les Options). */
  _name: string
  /** Code BCP 47 pour le navigateur (lang de la page, tri, nombres). */
  _code: string
  [key: string]: string
}

// Vite lit les fichiers de langue ; hors navigateur (tests Node), il n'y en a pas et les clés restent telles quelles.
let files: Record<string, LocaleFile> = {}
try {
  files = import.meta.glob<LocaleFile>('./locales/*.json', { eager: true, import: 'default' })
} catch {
  /* pas de Vite */
}

/** Les langues disponibles : code de fichier (« fr ») → table. */
export const LOCALES: Record<string, LocaleFile> = Object.fromEntries(Object.entries(files).map(([path, table]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), table]))

export const DEFAULT_LANG = 'fr'

/** La liste pour un menu : le français d'abord, puis les autres par ordre alphabétique. */
export const languages = (): { id: string; name: string }[] =>
  Object.entries(LOCALES)
    .map(([id, table]) => ({ id, name: table._name }))
    .sort((a, b) => (a.id === DEFAULT_LANG ? -1 : b.id === DEFAULT_LANG ? 1 : a.name.localeCompare(b.name)))

function initial(): string {
  const stored = saved.get('lang')
  if (stored && LOCALES[stored]) return stored
  return DEFAULT_LANG
}

let current = initial()
if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[current]?._code ?? current

export const lang = (): string => current

export function setLang(id: string): void {
  if (!LOCALES[id]) return
  current = id
  saved.set('lang', id)
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[id]?._code ?? id
}

/** Texte d'une clé dans la langue courante. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const base = typeof params.n === 'number' && (LOCALES[current]?.[`${key}_${params.n === 1 ? 'one' : 'other'}`] !== undefined || LOCALES[DEFAULT_LANG]?.[`${key}_${params.n === 1 ? 'one' : 'other'}`] !== undefined) ? `${key}_${params.n === 1 ? 'one' : 'other'}` : key
  const text = LOCALES[current]?.[base] ?? LOCALES[DEFAULT_LANG]?.[base] ?? key
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** Vrai si la clé existe dans la langue courante (ou le français). */
export const has = (key: string): boolean => (LOCALES[current]?.[key] ?? LOCALES[DEFAULT_LANG]?.[key]) !== undefined

/** Vrai pour le nom par défaut du joueur, quelle que soit la langue dans laquelle il a été enregistré. */
export const isDefaultName = (name: string): boolean => name === '' || Object.values(LOCALES).some((table) => table['home.defaultName'] === name)

/**
 * Valeur d'un paramètre de référence : une référence, ou une liste de références séparées par des virgules. On ne coupe qu'avant
 * une nouvelle référence (« , @ ») : le texte d'une carte contient lui-même des virgules, y compris à l'intérieur d'une référence imbriquée.
 */
function resolveParam(value: string): string {
  if (!value.includes('@')) return value
  return value.split(/, (?=@)/).map((part) => (part.startsWith('@') ? tx(part) : part)).join(', ')
}

/**
 * Texte d'une chaîne venue du serveur : une référence (« @clé », voir shared/msg.ts) est traduite dans la langue courante,
 * un texte du moteur (« @= ») est lu dans la langue voulue ; tout autre texte (un nom de joueur) reste tel quel.
 * Un paramètre dont le nom finit par « @en » remplace le paramètre de base hors du français.
 */
export function tx(text: string): string {
  // Le nom d'une équipe assemble ceux de ses joueurs (« David & Ordinateur ») : chacun se traduit à part.
  // Une référence entière n'est jamais découpée : un texte de carte peut contenir « Magie & Piège ».
  const m = parseMsg(text)
  const whole = !!m && (m.key === '=' || has(m.key) || has(`${m.key}_other`))
  if (!whole && text.includes(' & ')) return text.split(' & ').map(tx).join(' & ')
  if (!m) return text
  if (m.key === '=') return String((current === 'fr' ? m.params.fr : (m.params.en ?? m.params.fr)) ?? '')
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(m.params)) {
    if (k.endsWith('@en')) continue
    const chosen = current !== 'fr' && `${k}@en` in m.params ? (m.params[`${k}@en`] as string | number) : v
    // Un paramètre peut être lui-même une référence (« Maillon 2 : »…).
    // (Une liste de références séparées par des virgules se traduit élément par élément.)
    params[k] = typeof chosen === 'string' ? resolveParam(chosen) : chosen
  }
  return t(m.key, params)
}
