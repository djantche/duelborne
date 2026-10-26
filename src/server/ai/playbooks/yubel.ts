// Le script du deck Yubel (lignée Yubel, Bêtes Sacrées, Portes des Esprits).
//
// Le plan du deck : Yubel est un monstre 0/0 que rien ne détruit au combat, et dont chaque destruction (par un effet) fait avancer
// la lignée : Yubel → (détruit) Yubel - Terror Incarnate → (quitte le terrain) Yubel - The Ultimate Nightmare. Samsara D Lotus
// (Tribut : Yubel depuis le Deck), Spirit of Yubel (invoqué quand l'adversaire attaque, cherche une Magie/Piège de Yubel) et
// Nightmare Pain (détruit un monstre DARK pour chercher du Yubel ; l'adversaire doit attaquer Yubel, et subit nos dommages de
// combat) amènent Yubel ; Nightmare Throne ramène le Yubel de niveau voisin dès qu'un Yubel quitte le terrain par un effet.
//
// Leur force n'est pas dans l'ATK (0) mais dans leurs effets de combat. Yubel, Terror Incarnate et Spirit of Yubel ne sont jamais
// détruits au combat et ne coûtent aucun dégât ; Yubel et Terror, FACE VISIBLE EN ATTAQUE, infligent à l'adversaire l'ATK du
// monstre qui les attaque (en défense, rien : une position de défense ruinerait le deck) ; The Ultimate Nightmare et The Loving
// Defender Forever, en attaquant, détruisent (ou bannissent) le monstre attaqué ET infligent son ATK. Avec Nightmare Pain face
// recto, l'adversaire DOIT attaquer ces monstres : chaque attaque se retourne contre lui.
//
// Trois pièges que l'ATK ne montre pas : (1) Yubel doit TRIBUTER un autre monstre à chaque End Phase, sinon il se détruit
// lui-même, sans passer à la suite ; (2) Terror Incarnate détruit TOUS les autres monstres à notre End Phase : excellent contre
// un terrain adverse plein, ruineux pour nos propres monstres ; (3) Nightmare Pain détruit ce qu'on lui donne : on lui offre un
// monstre 0/0 de rechange, ou Yubel lui-même quand Terror Incarnate attend derrière.
import type { MonsterView, Prompt } from '../../../shared/protocol.ts'
import { type Ctx, type Playbook, type Step } from '../playbook.ts'
import { effectText } from '../tactics.ts'

const C = {
  yubel: 78371393, terror: 4779091, nightmare: 31764700, spirit: 90829280, lotus: 62318994, beckoning: 81034083,
  chaosBeast: 27439792, squirmer: 24215921, engraver: 60764609, lacrima: 28803166, tract: 98567237, gates: 80312545,
  pain: 65261141, throne: 93729896, chronicle: 92650749, favorite: 87532344, terraforming: 73628505, ash: 14558127,
  called: 24224830, imperm: 10045474, tactics: 25311006, phantom: 80453041, defender: 47172959, muckraker: 71607202,
  uria: 6007213, hamon: 32491822, raviel: 69890967, paradise: 13301895,
}
const YUBEL_LINE = [C.yubel, C.terror, C.nightmare, C.spirit, C.phantom, C.defender]
/** Monstres 0/0 démons : ceux que Dark Beckoning Beast invoque en plus, que les Portes des Esprits ramènent, et que Yubel tribute. */
const FODDER = [C.lotus, C.beckoning, C.chaosBeast, C.squirmer]
const HAND_TRAPS = [C.ash, C.imperm, C.called]
/** Les trois Bêtes Sacrées : invoquées de la main par Chaos Summoning Beast, hors conditions (Raviel tribute 3 Démons, Hamon 3 Magies Continues, Uria 3 Pièges). */
const BEASTS = [C.uria, C.hamon, C.raviel]

const yubelOnField = (c: Ctx): number => c.count('monsters', C.yubel, C.terror, C.nightmare, C.spirit)
const noOther = (c: Ctx): boolean => c.me.monsters.filter(Boolean).length <= 1

const STEPS: Step[] = [
  { id: 'repair-attack-position', action: 'position', card: YUBEL_LINE, when: (c, o) => c.me.monsters.some((m) => m?.card.uid === o.uid && m.faceUp && m.position === 'def'), weight: 1800 },
  { id: 'throne', action: 'activate', card: C.throne, zone: 'hand', when: (c) => c.count('field', C.throne) === 0, weight: 1500 },
  { id: 'gates', action: 'activate', card: C.gates, zone: 'hand', when: (c) => c.count('field', C.gates) === 0, weight: 1300 },
  { id: 'beckoning', action: 'summon', card: C.beckoning, weight: 1200 },
  { id: 'pain', action: 'activate', card: C.pain, zone: 'hand', when: (c) => c.count('field', C.pain) === 0, weight: 1100 },
  // Yubel sur le terrain ET Terror Incarnate quelque part : Nightmare Pain détruit Yubel (voir answer) et la lignée avance.
  { id: 'pain-yubel', action: 'activate', card: C.pain, zone: 'spellTrap', when: (c) => c.count('monsters', C.yubel, C.terror) > 0, weight: 1400 },
  { id: 'pain-fodder', action: 'activate', card: C.pain, zone: 'spellTrap', when: (c) => c.count('monsters', ...FODDER) + c.count('hand', ...FODDER) > 0, weight: 900 },
  // Un Samsara D Lotus invoqué sert d'abord à poser Yubel — s'il reste de quoi le tributer à l'End Phase ou que la lignée est prête.
  { id: 'lotus-summon', action: 'summon', card: C.lotus, when: (c) => yubelOnField(c) === 0, weight: 1200 },
  { id: 'lotus-spirit', action: 'activate', card: C.lotus, zone: 'monster', effect: /Yubel/, when: (c) => c.inDeck(C.spirit) > 0 && c.count('monsters', C.spirit) === 0, weight: 1350 },
  { id: 'lotus-yubel', action: 'activate', card: C.lotus, zone: 'monster', effect: /Yubel/, when: (c) => yubelOnField(c) === 0 && !noOther(c), weight: 1300 },
  { id: 'lotus-yubel-alone', action: 'activate', card: C.lotus, zone: 'monster', effect: /Yubel/, when: (c) => yubelOnField(c) === 0 && (c.up('field', C.throne) > 0 || c.count('hand', C.beckoning, C.squirmer) > 0), weight: 1100 },
  // Gruesome Grave Squirmer (Quick) s'invoque et détruit Yubel : la lignée avance sans coût de Pain, et c'est un monstre de plus à tributer.
  { id: 'squirmer-yubel', action: ['activate', 'spsummon'], card: C.squirmer, zone: 'hand', when: (c) => c.count('monsters', C.yubel, C.terror) > 0, weight: 1250 },
  { id: 'phantom', action: 'spsummon', card: C.phantom, when: (c) => c.count('monsters', C.phantom) === 0, weight: 1500 },
  { id: 'squirmer-revive', action: 'activate', card: C.squirmer, zone: 'graveyard', when: (c) => c.count('grave', C.lotus, C.beckoning, C.spirit) + c.count('hand', C.lotus, C.spirit) > 0, weight: 1000 },
  // Fallen Paradise protège les Bêtes Sacrées et pioche 2 cartes dès qu'une est là.
  { id: 'paradise', action: 'activate', card: C.paradise, zone: 'hand', when: (c) => c.count('field', C.paradise) === 0, weight: 1200 },
  // Chaos Summoning Beast (Tribut) pose une Bête Sacrée de la main, sans ses conditions : 4000 ATK qui ne peuvent être ciblés avec Paradise.
  { id: 'chaos-beast', action: 'activate', card: C.chaosBeast, zone: 'monster', effect: /Special Summon|Invoquer/i, when: (c) => c.count('hand', ...BEASTS) > 0 && c.count('monsters', ...BEASTS) === 0, weight: 1350 },
  { id: 'gates-revive', action: 'activate', card: C.gates, zone: 'spellTrap', weight: 900 },
  { id: 'favorite', action: 'activate', card: C.favorite, zone: 'spellTrap', weight: 800 },
  { id: 'chronicle', action: 'activate', card: C.chronicle, zone: 'spellTrap', weight: 700 },
  { id: 'terraforming', action: 'activate', card: C.terraforming, when: (c) => c.count('field', C.throne) + c.count('hand', C.throne) === 0, weight: 800 },
]

const AVOID: Step[] = [
  // Yubel et sa lignée restent en position d'attaque : c'est là que leurs effets de combat jouent ; ne jamais les mettre en défense.
  { id: 'jamais-en-defense', action: 'position', card: YUBEL_LINE, when: (c, o) => c.me.monsters.find((m) => m?.card.uid === o.uid)?.position !== 'def' },
  // Terror Incarnate puis Ultimate Nightmare n'arrivent que par la destruction de Yubel : ne jamais les poser à la main sinon.
  { id: 'garder-ash', action: ['summon', 'set'], card: C.ash },
  { id: 'pas-de-called-a-vide', action: 'activate', card: C.called, zone: 'hand' },
]

/** Ce que vaut une carte : garder (coût, défausse, tribut, destruction) ou vouloir (recherche, retour). */
function value(c: Ctx, id: number, intent: 'cost' | 'gain' | 'harm'): number {
  const gain = intent === 'gain'
  const haveYubel = yubelOnField(c) > 0
  if (id === C.yubel) return gain ? (haveYubel ? 520 : 820) : haveYubel ? 1000 : 900
  // Terror Incarnate et Ultimate Nightmare ne s'invoquent que par la lignée : au Cimetière ou au Deck, ils attendent.
  if (id === C.terror) return gain ? 480 : 220
  if (id === C.nightmare) return gain ? 450 : 200
  if (id === C.spirit) return gain ? (c.count('hand', C.spirit) > 0 ? 380 : 650) : 520
  if (id === C.lotus) return gain ? (haveYubel ? 400 : 900) : haveYubel ? 160 : 420
  if (id === C.beckoning) return gain ? 560 : 300
  if (id === C.chaosBeast) return gain ? (c.count('hand', ...BEASTS) > 0 ? 780 : 540) : 380
  // Les Bêtes Sacrées ne se jettent pas : une fois sur le terrain elles sont le plus gros corps du deck (4000 ATK).
  if (id === C.raviel || id === C.hamon) return gain ? (c.count('hand', C.chaosBeast) + c.count('monsters', C.chaosBeast) > 0 ? 700 : 420) : 640
  if (id === C.uria) return gain ? 400 : 520
  if (id === C.paradise) return c.count('field', C.paradise) > 0 ? 170 : gain ? 720 : 680
  if (id === C.squirmer) return gain ? 430 : 260
  if (id === C.engraver) return gain ? 420 : 180
  if (id === C.lacrima) return gain ? 380 : 300
  if (id === C.throne) return c.count('field', C.throne) > 0 ? 160 : gain ? 940 : 880
  if (id === C.pain) return c.count('field', C.pain) > 0 ? 200 : gain ? 880 : 840
  if (id === C.gates) return c.count('field', C.gates) > 0 ? 160 : gain ? 800 : 700
  if (id === C.chronicle) return gain ? 520 : 460
  if (id === C.favorite) return gain ? 600 : 520
  if (id === C.terraforming) return c.count('field', C.throne) + c.count('hand', C.throne) > 0 ? 160 : 500
  if (id === C.tactics) return 330
  if (HAND_TRAPS.includes(id)) return gain ? 560 : 760
  return 400
}

/** Poids propres de la lignée sur le terrain (l'ATK, toujours 0, ne dit rien de leur force). */
const LINE_VALUE: Record<number, number> = {
  [C.yubel]: 1700, [C.terror]: 2400, [C.nightmare]: 3000, [C.spirit]: 1100, [C.phantom]: 1800, [C.defender]: 3000,
  [C.uria]: 2000, [C.hamon]: 3200, [C.raviel]: 3300, [C.lotus]: 450, [C.beckoning]: 380, [C.chaosBeast]: 380, [C.squirmer]: 380,
}

/** Coût d'une destruction par effet : une suite réellement accessible compense la perte du corps actuel. */
function destructionCost(c: Ctx, id: number): number {
  if (id === C.yubel) return c.available(C.terror) ? -300 : LINE_VALUE[id]!
  if (id === C.terror) return c.available(C.nightmare) ? -250 : LINE_VALUE[id]!
  // Spirit peut aussi ramener le Yubel banni, contrairement à l'effet du Yubel classique.
  if (id === C.spirit) return c.available(C.yubel) || c.count('banished', C.yubel) > 0 ? -200 : LINE_VALUE[id]!
  return LINE_VALUE[id] ?? value(c, id, 'harm')
}

function answerDestroy(c: Ctx, p: Extract<Prompt, { kind: 'cards' }>): number[] | undefined {
  // Squirmer détruit un « Yubel » du terrain : avancer une lignée disponible avant de perdre une interruption.
  if (p.hint === 502 && c.chainTop === C.squirmer) {
    const best = p.cards.map((card, i) => ({ card, i }))
      .filter(({ card }) => card.seat === c.seat && YUBEL_LINE.includes(card.cardId ?? -1))
      .sort((a, b) => destructionCost(c, a.card.cardId!) - destructionCost(c, b.card.cardId!))[0]
    return best ? [best.i] : undefined
  }
  // Nightmare Pain détruit un monstre DARK : Yubel (ou Terror Incarnate) quand la suite de la lignée est derrière, sinon du rebut.
  if (p.hint !== 502 || c.chainTop !== C.pain) return undefined
  const mine = p.cards.map((card, i) => ({ card, i })).filter(({ card }) => card.seat === c.seat)
  if (mine.length !== p.cards.length) return undefined
  const pick = (id: number): number | undefined => mine.find(({ card }) => card.cardId === id && card.zone === 'monster')?.i
  const fodder = mine.filter(({ card }) => card.cardId !== null && FODDER.includes(card.cardId)).sort((a, b) => (a.card.zone === 'hand' ? 0 : 1) - (b.card.zone === 'hand' ? 0 : 1))
  // La lignée d'abord : Yubel est détruit par un effet → Terror Incarnate arrive ; Terror détruit → Ultimate Nightmare arrive.
  const line = pick(C.yubel) ?? pick(C.terror)
  if (line !== undefined) {
    const id = p.cards[line]?.cardId
    if (id === C.yubel && c.available(C.terror) || id === C.terror && c.available(C.nightmare)) return [line]
  }
  const f = fodder[0]
  if (f) return [f.i]
  return undefined
}

export const yubel: Playbook = {
  name: 'Yubel',
  matches: (deck) => deck.includes(C.yubel) && [C.terror, C.spirit, C.lotus, C.pain, C.throne].filter((id) => deck.includes(id)).length >= 2,
  steps: STEPS,
  avoid: AVOID,

  bias(c, o) {
    // Réponses en chaîne (pas d'action) : Spirit of Yubel saute au secours de l'attaque, Lotus retourne l'effet adverse contre Yubel.
    if (o.action === undefined && c.foeChain) {
      if (o.cardId === C.spirit && o.zone === 'hand') return 1500
      if (o.cardId === C.lotus && /destroy|d[ée]truire/i.test(effectText(o.label ?? '')) && c.count('monsters', C.yubel, C.terror) > 0) return 1500
      if (o.cardId === C.phantom) return 600
    }
    // Ne pas activer Nightmare Pain sans rien de bon à lui donner : il détruirait une carte utile.
    if (o.action === 'activate' && o.cardId === C.pain && o.zone === 'spellTrap' && c.count('monsters', ...FODDER, C.yubel, C.terror) + c.count('hand', ...FODDER) === 0) return -1800
    return 0
  },

  rate(c, card, intent, prompt) {
    const id = card.cardId
    if (id === null) return undefined
    if (intent === 'gain' && id === C.spirit && c.chainTop === C.lotus && card.zone === 'deck') return 1200
    if (intent === 'gain' && id === C.lotus && c.count('monsters', C.lotus) + c.count('hand', C.lotus) > 0) return 300
    if (intent === 'gain' && id === C.pain && c.up('spells', C.pain) === 0 && yubelOnField(c) > 0) return 1100
    if (intent === 'harm' && prompt.hint === 502 && (c.chainTop === C.pain || c.chainTop === C.squirmer)) {
      if (card.zone === 'monster' && YUBEL_LINE.includes(id)) return destructionCost(c, id)
    }
    if (intent !== 'gain' && card.zone === 'monster' && (id === C.phantom || id === C.defender || id === C.nightmare)) return LINE_VALUE[id] ?? 2000
    return value(c, id, intent)
  },

  answer(c, p) {
    if (p.kind === 'cards') return answerDestroy(c, p)
    // Muckraker offre de tributer un Démon à la place du monstre détruit : refusé quand c'est NOUS qui détruisons Yubel (Pain, Squirmer) pour avancer la lignée.
    if (p.kind === 'yesno' && (p.cardId === C.muckraker || /Muckraker/i.test(p.text)) && (c.chainTop === C.pain || c.chainTop === C.squirmer)) return 0
    // Un monstre de la lignée arrive toujours face recto en position d'attaque.
    if (p.kind === 'position' && YUBEL_LINE.includes(p.cardId)) {
      const i = p.options.findIndex((o) => o.faceUp && o.position === 'atk')
      return i >= 0 ? i : undefined
    }
    return undefined
  },

  immune: (m) => m.faceUp && m.card.cardId !== null && YUBEL_LINE.includes(m.card.cardId),

  // Yubel tribute un autre monstre à chaque End Phase : le dernier qui reste n'attaque pas, il risquerait d'y rester et Yubel se détruirait seul.
  hold(c, m) {
    // Les Bêtes Sacrées (4000 ATK) attaquent : elles ne sont pas du rebut.
    if (m.card.cardId === null || YUBEL_LINE.includes(m.card.cardId) || BEASTS.includes(m.card.cardId)) return false
    if (c.count('monsters', C.yubel) === 0 || c.up('spells', C.throne) > 0) return false
    return c.me.monsters.filter((x) => x && !YUBEL_LINE.includes(x.card.cardId ?? -1)).length <= 1
  },

  redirects: (c) => c.up('spells', C.pain) > 0 && c.up('monsters', ...YUBEL_LINE) > 0,

  target(c, attacker, foes) {
    // The Ultimate Nightmare et The Loving Defender : le monstre attaqué est détruit (ou banni) et son ATK nous sert de dégâts. On vise le plus fort, de face.
    const burn = attacker.card.cardId === C.nightmare || attacker.card.cardId === C.defender
    const reflect = c.up('spells', C.pain) > 0 && YUBEL_LINE.includes(attacker.card.cardId ?? 0)
    if (!burn && !reflect) return undefined
    if (!attacker.faceUp || attacker.position !== 'atk') return undefined
    const gain = (m: MonsterView): number => (burn ? m.atk ?? 0 : 0) + (reflect ? m.position === 'atk' ? m.atk ?? 0 : m.def ?? 0 : 0)
    const best = foes.filter((m) => m.faceUp && gain(m) > 0).sort((a, b) => gain(b) - gain(a))[0]
    return best?.card.uid ?? undefined
  },

  combat(c, attacker, target) {
    if (!attacker.faceUp || !YUBEL_LINE.includes(attacker.card.cardId ?? 0)) return undefined
    const burn = attacker.card.cardId === C.defender || attacker.card.cardId === C.nightmare && attacker.position === 'atk'
    const reflect = c.up('spells', C.pain) > 0
    const wall = target.position === 'atk' ? target.atk ?? 0 : target.def ?? 0
    return { damage: (burn ? target.atk ?? 0 : 0) + (reflect ? Math.max(0, wall - (attacker.atk ?? 0)) : 0), selfDamage: 0, kills: burn, dies: false }
  },

  monster(m: MonsterView) {
    const id = m.card.cardId
    if (id === null) return undefined
    const v = LINE_VALUE[id]
    return v === undefined ? undefined : v
  },

  position(c) {
    let s = 0
    const yubels = c.count('monsters', C.yubel, C.spirit, C.phantom, C.defender)
    const terror = c.count('monsters', C.terror)
    const nightmare = c.count('monsters', C.nightmare)
    const others = c.me.monsters.filter((m) => m !== null && !YUBEL_LINE.includes(m.card.cardId ?? -1)).length
    const throne = c.up('spells', C.throne) > 0
    // Yubel seul sans Throne : il se détruira à l'End Phase, sans Terror Incarnate à la clé.
    if (c.count('monsters', C.yubel) > 0 && others === 0 && c.count('monsters', C.spirit, C.phantom, C.defender, C.terror, C.nightmare) === 0 && !throne) s -= 900
    // Terror Incarnate ravage le terrain à notre End Phase : un bonheur contre l'adversaire, un coût pour nos autres monstres.
    if (terror > 0) {
      const foes = c.foe.monsters.filter(Boolean).length
      s += 350 * foes - 140 * others
    }
    if (nightmare > 0 && c.foe.monsters.some((m) => m && m.position === 'atk' && m.faceUp)) s += 300
    if (c.up('spells', C.pain)) s += 450 + (yubels + terror + nightmare > 0 ? 350 : 0)
    if (throne) s += 420
    if (c.up('spells', C.gates)) s += 280
    // Bête Sacrée sur le terrain : un énorme monstre ; Fallen Paradise le rend intouchable par les effets adverses.
    const beasts = c.count('monsters', ...BEASTS)
    s += 500 * beasts + (c.up('spells', C.paradise) > 0 ? 350 + 250 * beasts : 0)
    if (c.up('spells', C.chronicle)) s += 200
    // Lotus au Cimetière revient à l'End Phase tant qu'un Yubel est en jeu ; les 0/0 y sont aussi des cibles des Portes des Esprits.
    if (c.up('monsters', C.yubel) > 0) s += 260 * Math.min(1, c.count('grave', C.lotus))
    s -= 400 * Math.max(0, c.count('monsters', C.phantom) - 1)
    if (c.count('grave', ...FODDER) > 0 && c.up('spells', C.gates) > 0) s += 180
    // Les trois Yubel de la lignée sont des cartes précieuses : leur présence en main ou au Cimetière est un atout, pas un déchet.
    if (c.count('grave', C.terror, C.nightmare) > 0 && (yubels > 0 || c.count('hand', C.yubel) > 0)) s += 200
    s += 170 * c.count('hand', ...HAND_TRAPS)
    // Position d'attaque : sans elle, Yubel et Terror ne renvoient plus rien à l'attaquant.
    for (const m of c.me.monsters) {
      if (!m || !m.faceUp || m.card.cardId === null || !YUBEL_LINE.includes(m.card.cardId)) continue
      s += m.position === 'atk' ? 200 : -500
    }
    // Nightmare Pain + un Yubel en attaque : l'adversaire est obligé de se jeter dessus, et subit les dégâts.
    const guard = c.me.monsters.some((m) => m && m.faceUp && m.position === 'atk' && m.card.cardId !== null && [C.yubel, C.terror, C.nightmare].includes(m.card.cardId))
    if (c.up('spells', C.pain) > 0 && guard && c.foe.monsters.some(Boolean)) s += 900
    if (c.up('spells', C.pain) > 0 && c.count('hand', C.spirit) > 0) s += 200
    return s
  },
}
