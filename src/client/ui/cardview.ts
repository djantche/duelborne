// Données d'une carte et textes qui en découlent (nom, ligne de type, texte d'effet mis en forme).
// L'affichage lui-même est dans Card.tsx et CardDetail.tsx.
import { KIND, RACE } from './i18n.ts'
import { parseMsg } from '../../shared/msg.ts'
import { lang, t } from '../i18n.ts'

/** Champs de data/cards.json utilisés par l'interface. */
export interface ClientCard {
  id: number
  name: { en: string; fr: string | null }
  desc: { en: string; fr: string | null }
  type: string
  frameType: string
  race: string
  attribute: string | null
  atk: number | null
  def: number | null
  level: number | null
  linkval?: number | null
  linkmarkers?: string[] | null
  scale?: number | null
}

/** Texte du serveur : une référence « @= » donne les deux langues ; un texte ordinaire sert de nom anglais. */
function bilingual(text: string): { en: string; fr: string | null } {
  const m = parseMsg(text)
  return m?.key === '=' ? { en: String(m.params.en ?? m.params.fr ?? ''), fr: String(m.params.fr ?? '') } : { en: text, fr: text }
}

/** Carte absente de data/cards.json (certains Jetons) : fiche minimale fournie par le serveur. */
export function fromMini(id: number, m: { name: string; atk: number; def: number; level: number; token: boolean; spell?: boolean; desc?: string }): ClientCard {
  const name = bilingual(m.name)
  const desc = m.desc === undefined ? { en: '', fr: null } : bilingual(m.desc)
  if (m.spell) return { id, name, desc, type: 'Spell Card', frameType: 'spell', race: 'Continuous', attribute: null, atk: null, def: null, level: null }
  return { id, name, desc, type: m.token ? 'Token' : 'Monster', frameType: m.token ? 'token' : 'effect', race: '', attribute: null, atk: m.atk, def: m.def, level: m.level }
}

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Nom et texte d'une carte dans la langue choisie (le catalogue a le français et l'anglais ; les autres langues lisent l'anglais). */
export const nameOf = (c: ClientCard): string => (lang() === 'fr' ? (c.name.fr ?? c.name.en) : c.name.en)
export const descOf = (c: ClientCard): string => (lang() === 'fr' ? (c.desc.fr ?? c.desc.en) : c.desc.en)
export const stat = (v: number | null): string => (v === null || v < 0 ? '?' : String(v))
/** Illustration de la Console du bac à sable (carte sans image dans le catalogue) : un terminal et ses étincelles. */
const CONSOLE_ART = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="g" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#1f7a68"/><stop offset="1" stop-color="#06201c"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/><rect x="14" y="22" width="72" height="50" rx="7" fill="#04110f" stroke="#7cf0d0" stroke-width="2.5"/><path d="M26 38l12 9-12 9" fill="none" stroke="#7cf0d0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M46 58h22" stroke="#ffe08a" stroke-width="4" stroke-linecap="round"/><path d="M40 82h20M50 72v10" stroke="#7cf0d0" stroke-width="3" stroke-linecap="round"/><path d="M80 14l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#ffe08a"/><path d="M16 12l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#fff"/></svg>',
)}`
export const imgUrl = (id: number): string => (id === 3900000001 ? CONSOLE_ART : `/data/images/cropped/${id}.jpg`)
export const isLink = (c: ClientCard): boolean => c.frameType === 'link'
export const LINK_ARROWS = ['Top-Left', 'Top', 'Top-Right', 'Left', 'Right', 'Bottom-Left', 'Bottom', 'Bottom-Right']
export const isMonsterFrame = (c: ClientCard): boolean => c.frameType !== 'spell' && c.frameType !== 'trap'

/** « Magicien / Effet », « Magie Jeu Rapide »... */
export function typeLine(c: ClientCard): string {
  if (c.frameType === 'spell') return t('card.spell', { race: RACE[c.race] ?? c.race })
  if (c.frameType === 'trap') return t('card.trap', { race: RACE[c.race] ?? c.race })
  const kinds = c.type
    .replace(/ Monster$/, '')
    .split(' ')
    .map((w) => KIND[w] ?? w)
  return [RACE[c.race] ?? c.race, ...kinds].join(' / ')
}

// ───────────────────────────── Texte d'effet mis en forme ─────────────────────────────

const SECTION: [RegExp, string][] = [
  [/^\[ ?(?:Pendulum Effect|Effet Pendule|Effet de Pendule) ?\]/i, 'section.pendulum'],
  [/^\[ ?(?:Monster Effect|Effet de Monstre|Effet du Monstre) ?\]/i, 'section.monster'],
  [/^\[ ?(?:Flavor Text|Texte d'ambiance) ?\]/i, 'section.flavor'],
]

/** Met en valeur les repères d'un paragraphe de texte (déjà échappé) : numéros d'effets, sacrifices, limites par tour, noms de cartes. */
function highlight(line: string): string {
  return line
    .replace(/([①②③④⑤⑥⑦⑧⑨⑩])/g, '<b class="enum">$1</b>')
    .replace(/(\((?:Effet Rapide|Quick Effect|Effet Continu|Effet de Pendule)\))/gi, '<b class="tag-fx">$1</b>')
    .replace(/((?:\d+|un|une|deux|trois|one|two|three)\s+(?:Sacrifices?|Tributes?)\b|Sacrifi\w+|Invocation Sacrifice|Tribute Summon)/gi, '<b class="trib">$1</b>')
    .replace(/(\b(?:une|1) fois par (?:tour|duel)\b|\bqu(?:&#39;|’|')une fois par (?:tour|duel)\b|\bonce per (?:turn|duel)\b)/gi, '<b class="once">$1</b>')
    .replace(/(&#34;(?:(?!&#34;).){1,70}?&#34;)/g, '<span class="cn">$1</span>')
}

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩'

type EffectPart = { text: string; bullet: boolean }
type EffectBlock = { parts: EffectPart[]; number?: number; choice?: boolean; section?: string }

/** Coupe aux fins de phrases, sans couper les noms entre guillemets, les parenthèses ni « Sp. ». */
function sentences(text: string): string[] {
  const result: string[] = []
  let start = 0
  let depth = 0
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"' || ch === '“' || ch === '”' || ch === '«' || ch === '»') {
      if (!quote) quote = ch === '“' ? '”' : ch === '«' ? '»' : ch
      else if (ch === quote) quote = ''
    }
    if (quote) continue
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth || !/[.!?]/.test(ch) || !/\s/.test(text[i + 1] ?? '') || /\b(?:Sp|min|max|env|incl|ex|etc)\.$/i.test(text.slice(start, i + 1))) continue
    result.push(text.slice(start, i + 1).trim())
    start = i + 1
  }
  if (text.slice(start).trim()) result.push(text.slice(start).trim())
  return result
}

const activationText = (text: string): boolean => /[:;：；]/.test(text.replace(/"[^"]*"|«[^»]*»|“[^”]*”/g, ''))
const choiceText = (text: string): boolean => /(?:activate|apply|activer|appliquer|appliquez|activez).*?(?:following|these|suivants?|ces) (?:effects?|effets?)/i.test(text)
const followingLimit = (text: string): boolean => /(?:following effect|effet suivant)/i.test(text) && !activationText(text)
const continuation = (text: string): boolean => /^(?:You (?:can only|cannot)|Vous ne pouvez|This (?:card|effect) (?:cannot|can only)|Cet(?:te)? (?:carte|effet) ne peut|\()/i.test(text) && !activationText(text)

/** Découpe le texte PSCT en effets : les phrases de résolution et leurs limites restent ensemble. */
function effectBlocks(text: string): EffectBlock[] {
  const blocks: EffectBlock[] = []
  let current: EffectBlock | undefined
  let numbered = false
  let choices = false
  let pending: EffectPart[] = []
  const begin = (part: EffectPart, number?: number, choice = false): void => {
    current = { parts: [...pending, part], number, choice }
    pending = []
    blocks.push(current)
  }
  // Les numéros et les puces peuvent se trouver au milieu d'une même ligne dans le catalogue.
  const lines = text.replace(/\r/g, '').replace(/([.!?。])\s*([①②③④⑤⑥⑦⑧⑨⑩])/g, '$1\n$2').replace(/([^\n])([●•])/g, '$1\n$2').split('\n')
  for (const raw of lines) {
    let line = raw.trim()
    if (!line || /^-{6,}$/.test(line)) continue
    const section = SECTION.find(([re]) => re.test(line))
    if (section) {
      if (pending.length) blocks.push({ parts: pending })
      pending = []
      blocks.push({ parts: [], section: section[1] })
      current = undefined
      numbered = choices = false
      line = line.replace(section[0], '').trim()
      if (!line) continue
    }
    const marker = /^[●•]?\s*([①②③④⑤⑥⑦⑧⑨⑩])/.exec(line)
    if (marker) {
      begin({ text: line.replace(/^[●•]\s*/, ''), bullet: false }, CIRCLED.indexOf(marker[1]!) + 1)
      numbered = true
      choices = false
      continue
    }
    const bullet = /^[●•]\s*(.*)$/.exec(line)
    if (bullet) {
      const part = { text: bullet[1]!, bullet: true }
      if (choices) begin(part, undefined, true)
      else if (current) current.parts.push(part)
      else begin(part)
      continue
    }
    if (numbered && current) {
      current.parts.push({ text: line, bullet: false })
      continue
    }
    for (const sentence of sentences(line)) {
      const part = { text: sentence, bullet: false }
      if (followingLimit(sentence)) pending.push(part)
      else if (current && !pending.length && (continuation(sentence) || /^(?:Then|Also|If you do|Ensuite|Puis|De plus|Si vous le faites)\b/i.test(sentence) || (/^(?:Activate|Activez)\b/i.test(current.parts[0]!.text) && !activationText(sentence)))) current.parts.push(part)
      else begin(part)
      if (choiceText(sentence)) choices = true
      else if (!continuation(sentence)) choices = false
    }
  }
  if (pending.length) blocks.push({ parts: pending })
  return blocks
}

/** Les libellés du moteur départagent notamment les effets sans numéro et les options d'une liste. */
function labelMatch(blocks: EffectBlock[], label: string): EffectBlock | undefined {
  const words = (s: string): string[] => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z]{4,}/g) ?? []
  const ignored = new Set(['effect', 'effet', 'card', 'carte', 'cette', 'this', 'from', 'your', 'votre', 'with', 'avec', 'dans', 'depuis', 'monstre', 'monster'])
  const tokens = words(label).filter((w) => !ignored.has(w))
  if (!tokens.length) return undefined
  const ranked = blocks.filter((b) => !b.section).map((block) => {
    const body = words(block.parts.map((p) => p.text).join(' '))
    return { block, score: tokens.filter((w) => body.some((v) => v.startsWith(w.slice(0, 5)))).length / tokens.length }
  }).sort((a, b) => b.score - a.score)
  return ranked[0] && ranked[0].score >= 0.6 && ranked[0].score > (ranked[1]?.score ?? 0) ? ranked[0].block : undefined
}

/** Même sélection de paragraphe pour la fiche complète et l’aperçu d’un effet. */
function activeBlock(blocks: EffectBlock[], active?: number | null, label = '', spellTrap = false): EffectBlock | undefined {
  const numbered = blocks.filter((b) => b.number !== undefined)
  const choices = blocks.filter((b) => b.choice)
  const activations = blocks.filter((b) => !b.section && b.parts.some((p) => !p.bullet && activationText(p.text)))
  const candidates = choices.length ? choices : activations
  let lit: EffectBlock | undefined
  if (active !== null && active !== undefined) {
    lit = labelMatch(blocks, label) ?? numbered.find((b) => b.number === active)
    if (!lit && !numbered.length) {
      if (active > 0) lit = candidates[active - 1]
      else if (spellTrap) {
        const first = blocks.find((b) => !b.section)
        if (first && (activationText(first.parts[0]!.text) || /^(?:Activate|Activez|Draw|Piochez|Destroy|Détruisez|Target|Ciblez|Negate|Annulez|Special Summon|Invoquez|Add|Ajoutez|Send|Envoyez|Banish|Bannissez|You can|Vous pouvez)\b/i.test(first.parts[0]!.text))) lit = first
      } else if (candidates.length === 1) lit = activations[0]
      // Cartes anciennes sans ponctuation PSCT : un seul bloc de texte d'effet.
      if (!lit && !numbered.length && blocks.length === 1) lit = blocks[0]
    }
  }
  return lit
}

/** Texte sans balises de l’effet identifié ; le texte complet reste le repli si le moteur ne le départage pas. */
export function effectText(text: string, active?: number | null, label = '', spellTrap = false): string {
  const blocks = effectBlocks(text)
  const block = activeBlock(blocks, active, label, spellTrap)
  return block ? block.parts.map((part) => part.text).join(' ') : text.trim()
}

/** Texte lisible par effet ; la couleur active couvre tout le bloc, y compris ses listes et ses limites. */
/** Coche ronde posée devant un effet déjà utilisé ce tour (même tracé que l'icône « check »). */
const usedMark = (): string => {
  const label = esc(t('card.usedThisTurn'))
  return `<span class="eff-used" role="img" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.3 3.3L17 9"/></svg></span>`
}

/** Effet repéré par le moteur : rang dans la carte et libellé, comme pour l'effet actif. */
export interface EffectRef {
  n: number
  label?: string
}

export function formatDesc(text: string, active?: number | null, label = '', spellTrap = false, used: EffectRef[] = []): string {
  const blocks = effectBlocks(text)
  const lit = activeBlock(blocks, active, label, spellTrap)
  const done = new Set(used.map((u) => activeBlock(blocks, u.n, u.label ?? '', spellTrap)).filter((b) => b !== undefined))
  return blocks.map((block) => {
    if (block.section) return `<h4 class="eff-section">${esc(t(block.section))}</h4>`
    const out: string[] = []
    let list: string[] = []
    // La coche précède le premier texte du bloc, sur la même ligne.
    let mark = done.has(block) ? usedMark() : ''
    const lead = (): string => {
      const m = mark
      mark = ''
      return m
    }
    const flush = (): void => {
      if (list.length) out.push(`<ul class="eff-list">${list.join('')}</ul>`)
      list = []
    }
    for (const part of block.parts) {
      if (part.bullet) {
        const n = /^(\d+)\s*[:：]\s*(.*)$/.exec(part.text)
        // Une option numérotée porte déjà son chiffre : pas de puce devant.
        list.push(n ? `<li class="num">${lead()}<b class="opt">${n[1]}</b>${highlight(esc(n[2]!))}</li>` : `<li>${lead()}${highlight(esc(part.text))}</li>`)
      } else {
        flush()
        out.push(`<p>${lead()}${highlight(esc(part.text))}</p>`)
      }
    }
    flush()
    return `<div class="eff-block${block === lit ? ' eff-on' : ''}${done.has(block) ? ' eff-done' : ''}">${out.join('')}</div>`
  }).join('')
}

/** « Vous ne pouvez utiliser … de "Nom" … » : la limite vaut pour tous les exemplaires de la carte, pas seulement celui-ci. */
export const limitedByName = (text: string): boolean => /(?:You can only (?:use|activate)|Vous ne pouvez (?:utiliser|activer))[^.]*"/i.test(text)

/**
 * Sacrifices nécessaires pour Invoquer Normalement le monstre : le texte de la carte prime (« Nécessite 3 Sacrifices »,
 * « Ni Invocable Normalement »), sinon c'est la règle du Niveau (5-6 : 1 Sacrifice, 7 et plus : 2).
 * null si la carte n'est pas concernée (Magie, Piège, monstre du Extra Deck, Niveau 4 ou moins).
 */
export function tributesNeeded(c: ClientCard): number | null {
  if (!isMonsterFrame(c) || !/^(normal|effect|ritual_pendulum|normal_pendulum|effect_pendulum)$/.test(c.frameType)) return null
  const text = descOf(c)
  const said = /N[ée]cessite\s+(\d+)\s+Sacrifices?/i.exec(text) ?? /Requires?\s+(\d+)\s+Tributes?/i.exec(text)
  if (said) return Number(said[1])
  if (/Ni Invocable Normalement|Cannot be Normal Summoned/i.test(text)) return 0
  const level = c.level ?? 0
  return level >= 7 ? 2 : level >= 5 ? 1 : null
}
