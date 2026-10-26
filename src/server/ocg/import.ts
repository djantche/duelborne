// Import de decks depuis YGOProDeck : trois façons de donner un deck.
//
//   1. Le texte d'un fichier .ydk (copier-coller ou fichier téléchargé)
//   2. Une YDKE : « ygoprodeck://main|extra|side » (l'URL d'export de YGOProDeck)
//   3. Le lien d'une page de deck (https://ygoprodeck.com/deck/...) : on lit la page et on
//      récupère les codes des cartes, section par section (main / extra).
//
// Une carte que la base du moteur ne connaît pas (jeton, carte très récente…) est signalée dans
// `unknown` : elle est écartée du deck importé, et l'écran Mon Deck affiche ce qui a été laissé de côté.
import { msg } from '../../shared/msg.ts'
import { Buffer } from 'node:buffer'
import { cardData } from './data.ts'

export interface ImportResult {
  /** Nom lu dans le fichier / la page, si on en a trouvé un. */
  name: string | null
  main: number[]
  extra: number[]
  /** Codes de cartes absentes de la base du moteur (jetons, cartes ultra-récentes...). */
  unknown: number[]
}

/** fetch avec délai maximum : l'import ne doit jamais louer la connexion indéfiniment. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  // YGOProDeck refuse (403) les requêtes qui se présentent comme « node » : on s'annonce comme un navigateur ordinaire.
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  }
  return fetch(url, { signal: AbortSignal.timeout(ms), headers })
}

/** La carte existe dans la base du moteur (celle qui dira au duel si l'effet est jouable). */
const isKnown = (code: number): boolean => cardData(code) !== null

/** Sépare les lignes d'un .ydk en sections. */
function ydkSections(text: string): { name: string | null; main: number[]; extra: number[]; side: number[] } {
  const name = /^#name:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null
  const main: number[] = []
  const extra: number[] = []
  const side: number[] = []
  let section: number[] | null = main
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '#main') section = main
    else if (line === '#extra') section = extra
    else if (line.startsWith('!side')) section = side
    else if (/^\d+$/.test(line)) section?.push(Number(line))
  }
  return { name, main, extra, side }
}

/** Texte d'un fichier .ydk : le Side Deck rejoint le Deck Principal (à retrier ensuite). */
export function parseYdkText(text: string): ImportResult {
  const { name, main, extra, side } = ydkSections(text)
  if (side.length) main.push(...side)
  const all = [...main, ...extra]
  return { name, main: main.filter(isKnown), extra: extra.filter(isKnown), unknown: [...new Set(all.filter((c) => !isKnown(c)))] }
}

/**
 * YDKE : trois sections encodées en base64 de codes 32 bits little-endian
 * (convention d'EDOPro, celle du bouton « YDKE » des pages de deck YGOProDeck).
 */
export function parseYdke(text: string): ImportResult | null {
  const m = /ygoprodeck:\/\/([A-Za-z0-9+/=]*)[-|]([A-Za-z0-9+/=]*)[-|]([A-Za-z0-9+/=]*)/.exec(text)
  if (!m) return null
  const read = (b64: string): number[] => {
    if (!b64.trim()) return []
    const bytes = Buffer.from(b64, 'base64')
    const out: number[] = []
    for (let i = 0; i + 4 <= bytes.length; i += 4) out.push(bytes.readUInt32LE(i))
    return out
  }
  const main = read(m[1] as string)
  const extra = read(m[2] as string)
  const side = read(m[3] as string)
  if (side.length) main.push(...side)
  const all = [...main, ...extra]
  return { name: null, main: main.filter(isKnown), extra: extra.filter(isKnown), unknown: [...new Set(all.filter((c) => !isKnown(c)))] }
}

/** Texte collé sans en-tête : une liste de codes séparés par espaces ou retours à la ligne. */
export function parseCodeList(text: string): ImportResult | null {
  const codes = [...text.matchAll(/\b(\d{6,9})\b/g)].map((m) => Number(m[1]))
  if (codes.length < 10) return null
  return { name: null, main: codes.filter(isKnown), extra: [], unknown: [...new Set(codes.filter((c) => !isKnown(c)))] }
}

/** Identifiant numérique du deck dans un lien YGOProDeck : /deck/<slug>-419856 ou ?id=419856. */
const deckId = (url: string): string | null => /(?:[?&]id=|^.*\/deck\/(?:[^/?#]*-)?)(\d+)(?:[/?#]|$)/.exec(url)?.[1] ?? null

/** Un nom de deck YGOProDeck peut finir par « - YGOPRODeck » : on garde l'essentiel. */
function normName(name: string | null): string | null {
  if (!name) return null
  return name.replace(/\s*[-–|]\s*ygo\s*pro\s*deck\s*$/i, '').trim().slice(0, 40) || null
}

/** Les sections d'une page YGOProDeck : #main_deck, puis #extra_deck, puis le side s'il y en a un. */
export function deckFromHtml(html: string): ImportResult | null {
  const at = (anchor: RegExp): number => {
    const m = anchor.exec(html)?.index
    return m === undefined ? html.length : m
  }
  const mainStart = at(/id="main_deck"/)
  const extraStart = at(/id="extra_deck"/)
  const sideStart = at(/id="side_deck"/)
  const codes = (from: number, to: number): number[] => [...html.slice(from, to).matchAll(/data-card="(\d+)"/g)].map((m) => Number(m[1]))
  const name = /<title>([^<]+) - YGOPRODeck<\/title>/.exec(html)?.[1]?.trim() ?? null
  if (extraStart >= html.length) {
    // Page sans sections reconnues : on prend tout ce qui ressemble à des cartes.
    const all = [...html.matchAll(/data-card="(\d+)"/g)].map((m) => Number(m[1]))
    if (!all.length) return null
    return { name, main: all, extra: [], unknown: [] }
  }
  const sideAt = sideStart < html.length ? sideStart : html.length
  const main = codes(mainStart, extraStart)
  const extra = codes(extraStart, sideAt)
  const all = [...main, ...extra]
  return { name: normName(name), main: main.filter(isKnown), extra: extra.filter(isKnown), unknown: [...new Set(all.filter((c) => !isKnown(c)))] }
}

/** Lecture d'une page de deck YGOProDeck (elle liste ses cartes avec data-card="code"). */
export async function fetchYgoprodeckDeck(url: string): Promise<ImportResult> {
  const id = deckId(url)
  if (!id) throw new Error(msg('imp.noId'))
  const res = await fetchWithTimeout(`https://ygoprodeck.com/deck/${id}/`, 15_000)
  if (!res.ok) throw new Error(msg('imp.http', { n: res.status }))
  const result = deckFromHtml(await res.text())
  if (!result || result.main.length + result.extra.length < 20) throw new Error(msg('imp.empty'))
  return result
}

/** Un point d'entrée unique : lien YGOProDeck, YDKE, texte .ydk, ou liste de codes. */
export async function importDeck(text: string): Promise<{ kind: 'ygoprodeck' | 'ydk' | 'ydke'; result: ImportResult }> {
  const input = text.trim()
  if (/^(https?:\/\/)?(www\.)?ygoprodeck\.com\/deck\//i.test(input)) return { kind: 'ygoprodeck', result: await fetchYgoprodeckDeck(input) }
  const fromYdke = parseYdke(input)
  // Un texte qui porte la marque de son format est lu même s'il est court (un deck en cours de construction).
  if (fromYdke) {
    if (!fromYdke.main.length && !fromYdke.extra.length) throw new Error(msg('imp.noYdke'))
    return { kind: 'ydke', result: fromYdke }
  }
  const fromYdk = parseYdkText(input)
  if (/^#(main|extra)\s*$/im.test(input)) {
    if (!fromYdk.main.length && !fromYdk.extra.length) throw new Error(msg('imp.noYdk'))
    return { kind: 'ydk', result: fromYdk }
  }
  if (fromYdk.main.length + fromYdk.extra.length >= 20) return { kind: 'ydk', result: fromYdk }
  const fromList = parseCodeList(input)
  if (fromList) return { kind: 'ydk', result: fromList }
  throw new Error(msg('imp.format'))
}
