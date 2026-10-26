// Données dont le moteur a besoin : base de cartes (SQLite d'EDOPro), scripts Lua des effets,
// textes. Tout vient de data/ocg/ (voir `npm run fetch-ocg`).
import { msg, raw } from '../../shared/msg.ts'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { OcgCardData } from '../../../vendor/ocgcore/dist/index.js'
import type { MiniCard } from '../../shared/protocol.ts'
import { DATA_DIR, OCG_DIR } from '../paths.ts'
import { CONSOLE_CODE, CONSOLE_MESSAGE_KEYS, CONSOLE_NAME, CONSOLE_NAME_EN, CONSOLE_NAME_REF, CONSOLE_STRINGS_EN, CONSOLE_STRINGS_FR, CONSOLE_TEXT, consoleScript } from './sandbox.ts'

const SCRIPTS = path.join(OCG_DIR, 'CardScripts')
const CDB_DIR = path.join(OCG_DIR, 'BabelCDB')

export const TYPE = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, TOKEN: 0x4000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000, CONTINUOUS: 0x20000 }

const cards = new Map<number, OcgCardData>()
const englishNames = new Map<number, string>()
/** Texte public des cartes : connaissances de l'IA, jamais l'identité d'une carte cachée. */
const englishTexts = new Map<number, string>()
/** Textes d'effets d'une carte (str1..str16 de la base), utilisés pour nommer les effets activables. */
const cardStrings = new Map<number, string[]>()
/** Noms français et identifiants connus de l'interface (data/cards.json). */
const localNames = new Map<number, string>()
const systemStrings = new Map<number, string>()
/** Noms des compteurs (!counter du fichier de textes), indexés par le type de compteur du moteur. */
const counterNames = new Map<number, string>()
/** Raisons de victoire particulières (Exodia, compte à rebours...), d'après le fichier de textes. */
const victoryTexts = new Map<number, string>()
/** Libellés d'effets en français, par carte, quand ils sont fiables (voir alignFrench). */
const frenchLabels = new Map<number, string[]>()
/** Libellé anglais → français, établi sur les cartes dont l'alignement est sûr ; sert aux libellés génériques des autres. */
const labelDictionary = new Map<string, string>()
/**
 * Libellés d'effets traduits à la main (labels.fr.json) : gabarit anglais → gabarit français, les noms entre
 * guillemets étant remplacés par {0}, {1}... Ils priment sur tout le reste : ils partent du libellé anglais
 * d'EDOPro, le seul qui corresponde à coup sûr aux scripts.
 */
const labelTemplates = new Map<string, string>(Object.entries(JSON.parse(readFileSync(new URL('./labels.fr.json', import.meta.url), 'utf8')) as Record<string, string>))
/** Nom anglais entre guillemets (carte ou archétype) → nom français, relevé dans les textes des cartes. */
const quoteFr = new Map<string, string>()
const scriptCache = new Map<string, string | null>()

/** Vérifie que les données du moteur sont là ; renvoie un message d'erreur lisible sinon. */
export function missingData(): string | null {
  if (!existsSync(path.join(CDB_DIR, 'cards.cdb')) || !existsSync(path.join(SCRIPTS, 'constant.lua'))) {
    return 'Données du moteur introuvables (data/ocg). Lance d’abord : npm run fetch-ocg'
  }
  if (!existsSync(path.join(DATA_DIR, 'cards.json'))) return 'data/cards.json introuvable. Lance d’abord : npm run fetch-cards'
  return null
}

/**
 * Codes de cartes qui n'existent pas dans le jeu mais que les listes de formats citent (versions « Goat » et cartes non officielles d'EDOPro) :
 * code cité → code de la vraie carte. Lus dans les bases de BabelCDB, sans rien ajouter au moteur.
 */
const foreignAliases = new Map<number, number>()

/** Identifiant (de data/cards.json) de chaque carte d'après son nom anglais ; absent si deux cartes portent le même nom. */
const idsByEnglishName = new Map<string, number | null>()
const nameKey = (name: string): string => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** La carte qui porte ce nom anglais (pour rapprocher les listes de formats, qui citent parfois un autre code de la même carte). */
export const idByEnglishName = (name: string): number | null => idsByEnglishName.get(nameKey(name)) ?? null

function loadForeignAliases(): void {
  for (const name of ['goat-entries.cdb', 'cards-unofficial.cdb']) {
    const file = path.join(CDB_DIR, name)
    if (!existsSync(file)) continue
    try {
      const db = new DatabaseSync(file, { readOnly: true })
      for (const r of db.prepare('select id, alias from datas where alias != 0').all() as { id: number; alias: number }[]) foreignAliases.set(Number(r.id), Number(r.alias))
      db.close()
    } catch (e) {
      console.warn(`[données] ${name} illisible : ${e instanceof Error ? e.message : e}`)
    }
  }
}

function loadCdb(file: string): void {
  const db = new DatabaseSync(file, { readOnly: true })
  // Les archétypes (setcode) et les Types dépassent 2^53 : lecture en BigInt.
  const stmt = db.prepare('select d.*, t.* from datas d join texts t on t.id = d.id')
  stmt.setReadBigInts(true)
  for (const r of stmt.all() as Record<string, bigint | string | null>[]) {
    const id = Number(r.id)
    const type = Number(r.type)
    const level = Number(r.level)
    const link = (type & TYPE.LINK) !== 0
    // Jusqu'à 4 archétypes de 16 bits empaquetés dans un entier 64 bits.
    const setcodes: number[] = []
    for (let sc = BigInt.asUintN(64, r.setcode as bigint); sc; sc >>= 16n) if (sc & 0xffffn) setcodes.push(Number(sc & 0xffffn))
    cards.set(id, {
      code: id,
      alias: Number(r.alias),
      setcodes,
      type,
      level: level & 0xff,
      attribute: Number(r.attribute),
      race: BigInt.asUintN(64, r.race as bigint),
      attack: Number(r.atk),
      // Pour un monstre Lien, la colonne « def » contient les flèches.
      defense: link ? 0 : Number(r.def),
      lscale: (level >> 24) & 0xff,
      rscale: (level >> 16) & 0xff,
      link_marker: link ? Number(r.def) : 0,
    })
    englishNames.set(id, String(r.name))
    const strs = Array.from({ length: 16 }, (_, i) => String(r[`str${i + 1}`] ?? ''))
    if (strs.some(Boolean)) cardStrings.set(id, strs)
  }
  db.close()
}

/** Textes d'une base de cartes (sans les données de jeu) : les 16 libellés de chaque carte. */
function readStrings(file: string): Map<number, string[]> {
  const db = new DatabaseSync(file, { readOnly: true })
  const out = new Map<number, string[]>()
  for (const r of db.prepare('select * from texts').all() as Record<string, number | string | null>[]) {
    const strs = Array.from({ length: 16 }, (_, i) => String(r[`str${i + 1}`] ?? ''))
    if (strs.some(Boolean)) out.set(Number(r.id), strs)
  }
  db.close()
  return out
}

const digits = (s: string): string => (s.match(/\d+/g) ?? []).join(',')

/**
 * Familles de libellés d'effets : le verbe d'un libellé anglais et celui de sa traduction française doivent
 * être de la même famille pour qu'on les associe. `label` sert de libellé de repli quand aucune traduction fiable n'existe.
 */
const VERBS: { key: string; en: RegExp; fr: RegExp; label: string }[] = [
  { key: 'sp', en: /^Special Summon|^Summon.*\bSpecial/i, fr: /Invo(?:quer|quez|cation) Sp[ée]cial|Invocation Sp/i, label: 'Invoquer Spécialement' },
  { key: 'fusion', en: /^Fusion Summon/i, fr: /Invocation Fusion|Invoquer par Fusion|Fusion/i, label: 'Invocation Fusion' },
  { key: 'ritual', en: /^Ritual Summon/i, fr: /Invocation Rituelle|Rituel/i, label: 'Invocation Rituelle' },
  { key: 'synchro', en: /^Synchro Summon/i, fr: /Synchro/i, label: 'Invocation Synchro' },
  { key: 'xyz', en: /^Xyz Summon/i, fr: /Xyz/i, label: 'Invocation Xyz' },
  { key: 'normal', en: /^(?:Normal )?(?:Summon|Tribute Summon)\b/i, fr: /Invo(?:quer|quez|cation)(?! Sp)|Sacrifice/i, label: 'Invoquer' },
  { key: 'destroy', en: /^Destroy/i, fr: /D[ée]truire|D[ée]truisez/i, label: 'Détruire' },
  { key: 'banish', en: /^Banish/i, fr: /Bannir|Bannissez/i, label: 'Bannir' },
  { key: 'draw', en: /^Draw\b/i, fr: /Piocher|Piochez/i, label: 'Piocher' },
  { key: 'discard', en: /^Discard/i, fr: /D[ée]fausser|D[ée]faussez/i, label: 'Défausser' },
  { key: 'negate', en: /^Negate/i, fr: /Annuler|Annulez/i, label: 'Annuler' },
  { key: 'grave', en: /^Send\b.*\bGY\b|^Mill\b/i, fr: /Envoyer.*Cimeti[èe]re|Envoyez.*Cimeti[èe]re/i, label: 'Envoyer au Cimetière' },
  { key: 'hand', en: /^Add\b|^Search\b|^Return.*hand/i, fr: /Ajouter|Ajoutez|Rechercher|main/i, label: 'Ajouter à la main' },
  { key: 'deck', en: /^(?:Return|Shuffle).*\bDeck\b|^Place.*Deck/i, fr: /Deck|M[ée]langer/i, label: 'Renvoyer dans le Deck' },
  { key: 'set', en: /^Set\b/i, fr: /Poser|Posez/i, label: 'Poser' },
  { key: 'equip', en: /^Equip/i, fr: /[ÉE]quiper|[ÉE]quipez/i, label: 'Équiper' },
  { key: 'gain', en: /^(?:Gain|Increase|Recover)/i, fr: /Gagner|Gagnez|Augmenter|Augmentez|R[ée]cup[ée]rer/i, label: 'Gagner / augmenter' },
  { key: 'damage', en: /^(?:Inflict|Take|Deal).*damage|^Damage/i, fr: /dommages|Infliger/i, label: 'Infliger des dommages' },
  { key: 'lose', en: /^(?:Decrease|Reduce|Lose)/i, fr: /Diminuer|Diminuez|R[ée]duire|Perdre/i, label: 'Diminuer' },
  { key: 'target', en: /^(?:Target|Select)\b/i, fr: /S[ée]lectionner|S[ée]lectionnez|Cibler|Choisir/i, label: 'Sélectionner' },
  { key: 'flip', en: /^(?:Flip|Change.*Position|Switch)/i, fr: /Retourner|Position|Changer/i, label: 'Changer de position' },
  { key: 'attach', en: /^(?:Attach|Detach)/i, fr: /Attacher|Attachez|D[ée]tacher|Mat[ée]riel/i, label: 'Matériel Xyz' },
  { key: 'control', en: /^(?:Take control|Control)/i, fr: /contr[ôo]le/i, label: 'Prendre le contrôle' },
  { key: 'activate', en: /^Activate/i, fr: /Activer|Activez/i, label: 'Activer' },
]
const verbOf = (text: string, lang: 'en' | 'fr'): string | null => VERBS.find((v) => v[lang].test(text.replace(/^[●\s\d:]+/, '')))?.key ?? null
const verbLabel = (englishText: string): string => VERBS.find((v) => v.key === verbOf(englishText, 'en'))?.label ?? ''

/**
 * Libellés d'effets en français. La seule base française disponible est celle d'YGOPro, dont les numéros de
 * libellé ne correspondent pas toujours aux scripts d'EDOPro : on ne garde une traduction que si elle occupe
 * les mêmes places que l'anglaise et cite les mêmes nombres. Les libellés anglais des autres cartes sont
 * traduits quand le même texte a une traduction sûre sur une autre carte (« Add to hand »...). Le reste n'a
 * pas de libellé : l'interface affiche alors seulement « Effet N ».
 */
function alignFrench(file: string): void {
  const fr = readStrings(file)
  const shape = (a: string[]): string => a.map((x) => (x ? 1 : 0)).join('')
  const sure = (en: string[], f: string[] | undefined): f is string[] => !!f && shape(en) === shape(f) && en.every((x, i) => digits(x) === digits(f[i] as string))
  const votes = new Map<string, Map<string, number>>()
  for (const [code, en] of cardStrings) {
    const f = fr.get(code)
    if (!f) continue
    if (!sure(en, f)) {
      // Pas de correspondance d'ensemble : on associe les libellés un à un, dans l'ordre, quand le verbe et les nombres concordent.
      const out = Array<string>(16).fill('')
      let j = 0
      en.forEach((text, i) => {
        const key = text ? verbOf(text, 'en') : null
        if (!key) return
        for (let k = j; k < 16; k++) {
          const cand = f[k] as string
          if (cand && verbOf(cand, 'fr') === key && digits(cand) === digits(text)) {
            out[i] = cand
            j = k + 1
            return
          }
        }
      })
      if (out.some(Boolean)) frenchLabels.set(code, out)
      continue
    }
    frenchLabels.set(code, f)
    en.forEach((text, i) => {
      if (!text) return
      const v = votes.get(text) ?? new Map<string, number>()
      v.set(f[i] as string, (v.get(f[i] as string) ?? 0) + 1)
      votes.set(text, v)
    })
  }
  for (const [text, v] of votes) labelDictionary.set(text, [...v].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '')
}

const QUOTED = /"([^"]{1,80})"/g

/**
 * Apprend la traduction des noms cités entre guillemets : le nom de chaque carte, et les noms d'archétypes
 * (« Blue-Eyes » → « Yeux Bleus ») que les textes anglais et français d'une même carte citent dans le même ordre.
 */
function learnQuotes(list: { name: { en: string; fr: string | null }; desc: { en: string; fr: string | null } }[]): void {
  const votes = new Map<string, Map<string, number>>()
  const vote = (en: string, fr: string, weight = 1): void => {
    const v = votes.get(en) ?? new Map<string, number>()
    v.set(fr, (v.get(fr) ?? 0) + weight)
    votes.set(en, v)
  }
  for (const c of list) {
    if (c.name.fr) vote(c.name.en, c.name.fr, 3)
    if (!c.desc.fr) continue
    const en = [...c.desc.en.matchAll(QUOTED)].map((m) => m[1] as string)
    const fr = [...c.desc.fr.matchAll(QUOTED)].map((m) => m[1] as string)
    if (en.length && en.length === fr.length) en.forEach((q, i) => vote(q, fr[i] as string))
  }
  for (const [en, v] of votes) quoteFr.set(en, [...v].sort((a, b) => b[1] - a[1])[0]?.[0] ?? en)
}

/** Traduction à la main d'un libellé anglais, noms cités compris ; '' s'il n'y en a pas. */
function translateLabel(english: string): string {
  const names: string[] = []
  const template = english.trim().replace(QUOTED, (_, q: string) => `{${names.push(q) - 1}}`)
  const french = labelTemplates.get(template)
  if (!french) return ''
  return french.replace(/\{(\d)\}/g, (_, n: string) => `"${quoteFr.get(names[Number(n)] ?? '') ?? names[Number(n)] ?? ''}"`).replace(/\{=([^}]+)\}/g, (_, q: string) => quoteFr.get(q) ?? q)
}

function readConf(file: string): void {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const sys = /^!system (\d+) (.*)$/.exec(line.trim())
    if (sys) systemStrings.set(Number(sys[1]), sys[2] as string)
    const counter = /^!counter (0x[0-9a-fA-F]+) (.*)$/.exec(line.trim())
    if (counter) counterNames.set(Number(counter[1]), counter[2] as string)
    const victory = /^!victory (0x[0-9a-fA-F]+) (.*)$/.exec(line.trim())
    if (victory) victoryTexts.set(Number(victory[1]), victory[2] as string)
  }
}

export function loadData(): { cards: number; scripts: string } {
  // cards.cdb puis les extensions officielles récentes (release-*.cdb).
  loadForeignAliases()
  loadCdb(path.join(CDB_DIR, 'cards.cdb'))
  for (const f of readdirSync(CDB_DIR).filter((f) => /^release-.*\.cdb$/.test(f)).sort()) loadCdb(path.join(CDB_DIR, f))

  const local = JSON.parse(readFileSync(path.join(DATA_DIR, 'cards.json'), 'utf8')) as { id: number; name: { en: string; fr: string | null }; desc: { en: string; fr: string | null } }[]
  for (const c of local) {
    localNames.set(c.id, c.name.fr ?? c.name.en)
    const key = nameKey(c.name.en)
    idsByEnglishName.set(key, idsByEnglishName.has(key) ? null : c.id)
    englishTexts.set(c.id, c.desc.en)
  }
  learnQuotes(local)

  // Textes anglais d'abord, puis le français par-dessus (il ne manque que ce que le fichier français ne traduit pas).
  for (const name of ['strings.conf', 'strings.fr.conf']) if (existsSync(path.join(OCG_DIR, name))) readConf(path.join(OCG_DIR, name))
  registerConsole()
  const french = path.join(OCG_DIR, 'cards.fr.cdb')
  if (existsSync(french)) alignFrench(french)
  else console.warn('[données] Libellés d’effets en français absents : lance npm run fetch-fr-cdb')
  return { cards: cards.size, scripts: SCRIPTS }
}

/** La Console du bac à sable : une carte Magie Continue qui n'existe pas dans les bases, déclarée au moteur et à l'interface. */
function registerConsole(): void {
  cards.set(CONSOLE_CODE, { code: CONSOLE_CODE, alias: 0, setcodes: [], type: TYPE.SPELL | TYPE.CONTINUOUS, level: 0, attribute: 0, race: 0n, attack: 0, defense: 0, lscale: 0, rscale: 0, link_marker: 0 })
  englishNames.set(CONSOLE_CODE, CONSOLE_NAME_EN)
  // Les textes de la Console sont écrits dans les deux langues (src/server/ocg/sandbox.ts).
  cardStrings.set(CONSOLE_CODE, CONSOLE_STRINGS_EN)
  frenchLabels.set(CONSOLE_CODE, CONSOLE_STRINGS_FR)
}

export const cardData = (code: number): OcgCardData | null => cards.get(code) ?? null
export const cardText = (code: number): string => englishTexts.get(displayId(code)) ?? ''

/** Raison d'une victoire particulière, en français (« Exodia »...), ou '' pour une victoire ordinaire. */
export const victoryText = (reason: number): string => victoryTexts.get(reason) ?? ''

/** Cartes que le joueur peut déclarer pour une question du moteur (identifiants d'affichage, sans doublon). */
export function announceCandidates(match: (card: OcgCardData) => boolean): number[] {
  const out = new Set<number>()
  for (const card of cards.values()) if (card.code !== CONSOLE_CODE && match(card)) out.add(displayId(card.code))
  return [...out]
}

/** Noms des Types et Attributs de monstre, indexés par le bit du moteur. */
export const RACES = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator-God', 'Wyrm', 'Cyberse', 'Illusion']
export const ATTRIBUTES = ['EARTH', 'WATER', 'FIRE', 'WIND', 'LIGHT', 'DARK', 'DIVINE']

export function readScript(name: string): string | null {
  if (name === `c${CONSOLE_CODE}.lua`) return consoleScript()
  const hit = scriptCache.get(name)
  if (hit !== undefined) return hit
  const file = [SCRIPTS, path.join(SCRIPTS, 'official'), path.join(SCRIPTS, 'pre-release')].map((dir) => path.join(dir, name)).find((f) => existsSync(f))
  const content = file ? readFileSync(file, 'utf8') : null
  scriptCache.set(name, content)
  return content
}

/**
 * Identifiant à afficher côté client : celui de data/cards.json. Une illustration alternative
 * (code différent, même carte) est ramenée à la carte d'origine.
 */
export function displayId(code: number): number {
  if (localNames.has(code)) return code
  const alias = cards.get(code)?.alias ?? foreignAliases.get(code) ?? 0
  return alias && localNames.has(alias) ? alias : code
}

export const isKnownToClient = (id: number): boolean => localNames.has(id)

export const cardName = (code: number): string => code === CONSOLE_CODE ? CONSOLE_NAME : (localNames.get(displayId(code)) ?? englishNames.get(code) ?? `Carte ${code}`)

/** Carte absente de data/cards.json (beaucoup de Jetons) : de quoi l'afficher quand même. */
export function miniCard(code: number): MiniCard {
  if (code === CONSOLE_CODE) return { name: CONSOLE_NAME_REF, atk: 0, def: 0, level: 0, token: false, spell: true, desc: CONSOLE_TEXT }
  const c = cards.get(code)
  return { name: englishNames.get(code) ?? `Carte ${code}`, atk: c?.attack ?? 0, def: c?.defense ?? 0, level: c?.level ?? 0, token: ((c?.type ?? 0) & TYPE.TOKEN) !== 0 }
}

// ───────────────────────────── Textes ─────────────────────────────

// Indications du moteur les plus courantes, traduites (identifiants de strings.conf).
/** Indications du moteur dont la traduction est dans les fichiers de langue du client (clés « hint.<numéro> »). */
const HINT_IDS = new Set([30, 31, 203, 210, 500, 501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 515, 516, 517, 518, 519, 520, 526, 527, 528, 529, 530, 531, 549, 550, 551, 555, 556, 560, 561, 565, 566, 572, 573, 574, 575])

/** Texte système du moteur, prêt à envoyer aux joueurs (voir shared/msg.ts) : traduit côté client s'il l'est, sinon l'original anglais. null si inconnu. */
export function systemMsg(id: number): string | null {
  if (HINT_IDS.has(id)) return msg(`hint.${id}`)
  const en = systemStrings.get(id)
  return en ? raw(en, en) : null
}

/** Texte d'une description du moteur (un effet de carte ou un texte système), prêt à envoyer ; null si on n'en a aucun. */
export function describeMsg(desc: bigint): string | null {
  const code = Number(desc >> 20n)
  if (code === 0) return systemMsg(Number(desc & 0xfffffn))
  const consoleKey = code === CONSOLE_CODE ? CONSOLE_MESSAGE_KEYS.get(Number(desc & 0xfffffn)) : undefined
  if (consoleKey) return msg(consoleKey)
  const fr = describe(desc)
  const en = englishLabel(desc)
  return fr || en ? raw(fr || en, en || fr) : null
}

/** Nom anglais d'une carte (le nom français vient de cardName). */
export const cardNameEn = (code: number): string => englishNames.get(code) ?? `Card ${code}`

/**
 * Texte d'une description du moteur : soit un texte système, soit le n-ième texte d'effet d'une
 * carte (code << 20 | n, convention d'EDOPro). Toujours en français : sans traduction sûre, c'est le
 * texte de repli qui est rendu (jamais l'anglais).
 */
export function describe(desc: bigint, fallback = ''): string {
  const code = Number(desc >> 20n)
  const index = Number(desc & 0xfffffn)
  if (code === 0) return fallback
  const english = cardStrings.get(code)?.[index]
  if (!english) return fallback
  if (code === CONSOLE_CODE) return frenchLabels.get(code)?.[index] ?? fallback
  // Dernier recours : le verbe de l'effet, en français (« Détruire »), plutôt que le texte de repli.
  return translateLabel(english) || frenchLabels.get(code)?.[index] || labelDictionary.get(english) || verbLabel(english) || fallback
}

/** Libellé anglais d'origine d'une description de carte : tout dernier recours, quand il faut absolument dire de quoi il s'agit. */
export const englishLabel = (desc: bigint): string => cardStrings.get(Number(desc >> 20n))?.[Number(desc & 0xfffffn)] ?? ''

/** Vrai si la description est le texte d'un effet de carte (même sans traduction) : l'effet mérite alors un numéro. */
export const hasEffectText = (desc: bigint): boolean => desc >> 20n !== 0n && !!cardStrings.get(Number(desc >> 20n))?.[Number(desc & 0xfffffn)]

/** Carte à laquelle appartient une description du moteur (0 pour un texte système). */
export const descriptionCard = (desc: bigint): number => Number(desc >> 20n)

/** Nom d'un type de compteur (« Compteur Parchemin »), dans la langue du jeu. */
export const counterName = (type: number): string => counterNames.get(type) ?? counterNames.get(type & 0xfff) ?? `Compteur ${type & 0xfff}`

const effectOrders = new Map<number, number[]>()

/**
 * Numéro d'un effet dans sa carte, d'après sa description : le rang de son texte parmi ceux que le script
 * de la carte attribue à ses effets, dans l'ordre où il les crée (en général celui du texte de la carte).
 * null si la description n'appartient pas à une carte ou si le script ne permet pas de le dire.
 */
export function effectNumber(desc: bigint): number | null {
  const code = Number(desc >> 20n)
  if (code === 0) return null
  let order = effectOrders.get(code)
  if (!order) {
    const script = readScript(`c${code}.lua`) ?? ''
    order = [...new Set([...script.matchAll(/SetDescription\(\s*aux\.Stringid\(\s*(?:id|\d+)\s*,\s*(\d+)\s*\)/g)].map((m) => Number(m[1])))]
    effectOrders.set(code, order)
  }
  const rank = order.indexOf(Number(desc & 0xfffffn))
  return rank < 0 ? null : rank + 1
}
