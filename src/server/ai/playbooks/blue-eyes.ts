// Le script du deck Dragon Blanc aux Yeux Bleus (Blue-Eyes White Dragon).
//
// Le plan du deck : poser le Dragon Blanc aux Yeux Bleus (DBYB) le plus vite possible SANS l'invoquer en Normal — Maiden of White
// place « True Light » (qui invoque le DBYB depuis la main ou le Cimetière), Blue-Eyes Alternative White Dragon s'invoque
// gratuitement en montrant un DBYB, Neo Kaiser Sea Horse et Jet Dragon arrivent d'eux-mêmes dès qu'il est là ; puis
// les Tuners de niveau 1 (Sage, Maiden, White Stone) et le DBYB font les Synchros d'Extra Deck, dont l'Ultimate Spirit Dragon,
// qui peut annuler une activation sur le terrain par tour. Les interruptions (Ash Blossom, Effect Veiler, Infinite Impermanence, Called by the Grave)
// restent en main ou posées pour le tour adverse : jamais invoquées ni utilisées en coût quand on a mieux à défausser.
import type { MonsterView } from '../../../shared/protocol.ts'
import { effectText } from '../tactics.ts'
import { type Ctx, type Playbook, type Step } from '../playbook.ts'

const C = {
  bewd: 89631139, sage: 8240199, maiden: 17947697, neoKaiser: 54332792, dictator: 66961194, jet: 30576089,
  abyss: 64202399, whiteStone: 71039903, dragonSpirit: 45467446, alt: 38517737, wishes: 80326401, roar: 17725109,
  trueLight: 62089826, majesty: 43219114, mausoleum: 24382602, ultimateFusion: 71143015, bingo: 93437091,
  melody: 48800175, tradeIn: 38120068, ash: 14558127, veiler: 97268402, imperm: 10045474, called: 24224830,
  ultimateSpirit: 89604813, spiritDragon: 59822133, azure: 40908371, indigo: 16699558, spiritEyes: 42097666,
  tyrant: 11443677, neoUltimate: 56532353, twinBurst: 2129638, altUltimate: 43228023, hieratic: 24361622,
  baronne: 84815190, draglubion: 28400508,
}
const HAND_TRAPS = [C.ash, C.veiler, C.imperm, C.called]
const TUNERS = [C.sage, C.maiden, C.whiteStone]

/** Exemplaires du Dragon Blanc (ou de l'Alternative, qui en prend le nom) en jeu ou en main. */
const dragons = (c: Ctx): number => c.count('monsters', C.bewd, C.alt) + c.count('hand', C.bewd)

const STEPS: Step[] = [
  // Gratuit : 3000 ATK sans rien dépenser, dès qu'on a un Dragon Blanc à montrer.
  { id: 'alternative', action: 'spsummon', card: C.alt, weight: 1600 },
  { id: 'mausoleum', action: 'activate', card: C.mausoleum, zone: 'hand', weight: 900 },
  // Maiden : au Cimetière, elle revient d'elle-même dès qu'un Dragon Blanc est invoqué ; elle pose True Light.
  { id: 'maiden-true-light', action: 'activate', card: C.maiden, zone: 'hand', when: (c) => c.up('field', C.trueLight) === 0, weight: 1500 },
  { id: 'maiden-on-field', action: 'activate', card: C.maiden, zone: 'monster', effect: /place|placer|Placez|Poser/i, when: (c) => c.up('field', C.trueLight) === 0, weight: 1400 },
  { id: 'true-light-open', action: 'activate', card: C.trueLight, zone: 'spellTrap', when: (c) => c.up('spells', C.trueLight) === 0, weight: 1400 },
  { id: 'true-light', action: 'activate', card: C.trueLight, effect: /Special Summon|Invoquer Sp/i, when: (c) => c.count('hand', C.bewd) + c.count('grave', C.bewd, C.alt) > 0, weight: 1500 },
  { id: 'roar', action: 'activate', card: C.roar, zone: 'hand', when: (c) => c.count('monsters', C.bewd, C.alt) === 0, weight: 1100 },
  { id: 'wishes', action: 'activate', card: C.wishes, zone: 'hand', when: (c) => c.me.hand.length >= 2, weight: 1100 },
  { id: 'sage', action: 'summon', card: C.sage, weight: 1000 },
  { id: 'spirit-with-eyes', action: 'spsummon', card: C.spiritEyes, when: (c) => c.count('monsters', C.bewd, C.alt) === 0 && (c.count('hand', C.bewd) + c.count('grave', C.bewd) > 0 || c.count('hand', C.sage) > 0 && c.up('field', C.mausoleum) === 0), weight: 1050 },
  { id: 'spirit-revive', action: 'activate', card: C.spiritEyes, zone: 'monster', effect: /Special Summon|Invoquer/i, when: (c) => c.count('hand', C.bewd) + c.count('grave', C.bewd, C.jet) > 0, weight: 1200 },
  { id: 'neo-kaiser', action: 'spsummon', card: C.neoKaiser, zone: 'hand', when: (c) => c.count('monsters', C.bewd, C.alt) > 0, weight: 900 },
  { id: 'jet', action: 'spsummon', card: C.jet, weight: 800 },
  { id: 'dictator', action: 'spsummon', card: C.dictator, zone: 'hand', when: (c) => c.count('hand', C.bewd) > 0 || c.count('grave', C.bewd) === 0, weight: 700 },
  { id: 'ultimate-spirit', action: 'spsummon', card: C.ultimateSpirit, weight: 1700 },
  { id: 'spirit-dragon', action: 'spsummon', card: C.spiritDragon, weight: 900 },
  { id: 'neo-ultimate', action: 'spsummon', card: [C.neoUltimate, C.altUltimate, C.twinBurst, C.tyrant], weight: 1000 },
  { id: 'sage-search', action: 'activate', card: C.sage, zone: 'monster', weight: 800 },
  { id: 'trade-in', action: 'activate', card: C.tradeIn, when: (c) => c.count('hand', C.bewd, C.alt, C.jet, C.abyss, C.dragonSpirit) > 1 || c.up('spells', C.trueLight) > 0, weight: 700 },
]

/** Ce qu'on ne fait pas : les interruptions ne sont ni invoquées ni posées comme monstres, et les cartes de réponse ne s'activent pas à vide. */
const AVOID: Step[] = [
  { id: 'garder-ash', action: ['summon', 'set'], card: [C.ash, C.veiler] },
  { id: 'pas-de-called-a-vide', action: 'activate', card: C.called, zone: 'hand' },
]

/** Ce que vaut une carte à CE moment, pour décider laquelle on garde (coût, défausse) ou veut (recherche, retour). */
function value(c: Ctx, id: number, intent: 'cost' | 'gain' | 'harm'): number {
  const have = dragons(c)
  const onField = c.count('monsters', C.bewd, C.alt) > 0
  if (id === C.bewd) return have === 0 ? 1000 : have >= 2 ? (intent === 'gain' ? 520 : 300) : 900
  if (id === C.alt) return c.count('hand', C.bewd) > 0 && c.count('hand', C.alt) <= 1 ? 800 : intent === 'gain' ? 420 : 260
  if (HAND_TRAPS.includes(id)) return intent === 'gain' ? 560 : 750
  if (id === C.trueLight) return c.count('field', C.trueLight) > 0 ? 200 : 820
  // Un Tuner de niveau 1 chargé en main sert le Synchro ; au Cimetière, Maiden et White Stone travaillent déjà.
  if (id === C.maiden) return intent === 'gain' ? (c.count('hand', C.maiden) + c.count('grave', C.maiden) > 0 ? 350 : 760) : 150
  if (id === C.whiteStone) return intent === 'gain' ? 480 : 110
  if (id === C.sage) return intent === 'gain' ? (c.count('hand', C.sage) > 0 ? 380 : 700) : 520
  if (id === C.neoKaiser) return onField ? 600 : 330
  if (id === C.dictator) return 250
  if (id === C.jet) return onField ? 520 : 380
  if (id === C.abyss) return 380
  if (id === C.dragonSpirit) return 470
  if (id === C.wishes) return c.count('hand', C.wishes) > 1 ? 300 : 500
  if (id === C.roar) return onField ? 380 : 700
  if (id === C.majesty) return 480
  if (id === C.mausoleum) return c.count('field', C.mausoleum) > 0 ? 150 : 460
  if (id === C.ultimateFusion) return 470
  if (id === C.bingo) return 340
  if (id === C.melody) return 330
  if (id === C.tradeIn) return 300
  return 400
}

/** Extra Deck : ce que chaque monstre pèse une fois sur le terrain (plus que son ATK, ses effets de négation et de reprise). */
const BOSS: Record<number, number> = {
  [C.ultimateSpirit]: 2600, [C.spiritDragon]: 2000, [C.neoUltimate]: 1200, [C.altUltimate]: 1500, [C.twinBurst]: 900,
  [C.tyrant]: 900, [C.indigo]: 1000, [C.azure]: 700, [C.baronne]: 1800, [C.draglubion]: 900,
}

export const blueEyes: Playbook = {
  name: 'Blue-Eyes White Dragon',
  // Le deck est reconnu à ses cartes de lignée, que les variantes importées gardent presque toujours.
  matches: (deck) => deck.includes(C.bewd) && [C.maiden, C.sage, C.trueLight, C.alt, C.jet, C.whiteStone, C.melody, C.roar].filter((id) => deck.includes(id)).length >= 2,
  steps: STEPS,
  avoid: AVOID,

  bias(c, o) {
    // Défausser ou coûter un Dragon Blanc seul en main : jamais l'unique.
    if (o.action === 'activate' && o.cardId === C.wishes && c.me.hand.length === 1) return -1500
    if (o.action === 'activate' && o.cardId === C.spiritDragon && /Special Summon|Invoquer/i.test(effectText(o.label ?? '')) && c.view.turnPlayer === c.seat && !c.foeChain) return -600
    // Placer la dernière carte en main ne doit pas priver le tour adverse d'une vraie interruption.
    if (o.action === 'activate' && o.cardId === C.trueLight && /Set|Poser/i.test(effectText(o.label ?? '')) && c.count('monsters', C.bewd, C.alt) === 0 && c.count('hand', C.bewd) + c.count('grave', C.bewd, C.alt) > 0) return -650
    return 0
  },

  rate(c, card, intent, prompt) {
    const id = card.cardId
    if (id === null) return undefined
    if (intent !== 'gain' && card.zone === 'monster') {
      if (BOSS[id] !== undefined) return 1800 + BOSS[id]! + 0.3 * (c.me.monsters.find((m) => m?.card.uid === card.uid)?.atk ?? 0)
      if (id === C.ash || id === C.veiler) return 280 // un Tuner déjà utilisé n'est plus une interruption en main
    }
    if (intent === 'gain') {
      if (id === C.maiden && c.up('spells', C.trueLight) === 0 && c.count('hand', C.maiden) + c.count('grave', C.maiden) === 0) return 1000
      if (id === C.roar && c.count('monsters', C.bewd, C.alt) === 0 && c.count('hand', C.roar) === 0) return 950
      if (id === C.neoKaiser && c.count('monsters', C.bewd, C.alt) > 0 && c.count('hand', C.neoKaiser) === 0) return 850
      if (id === C.trueLight && c.up('spells', C.trueLight) > 0) return 100
    }
    // Envoyer un Dragon Blanc au Cimetière est utile à Roar / Dictator / Mausoleum : ce n'est pas une recherche en main.
    if (prompt.hint === 504 && card.zone === 'deck' && (id === C.bewd || id === C.whiteStone || id === C.maiden)) return 100
    return value(c, id, intent)
  },

  monster(m: MonsterView) {
    const id = m.card.cardId
    if (id === null) return undefined
    // Ash et Veiler posés sur le terrain ont servi : de simples corps de Tuner de plus.
    if (id === C.ash || id === C.veiler) return 320
    const boss = BOSS[id]
    return boss === undefined ? undefined : 380 + 0.55 * (m.atk ?? 0) + boss
  },

  position(c) {
    let s = 0
    const bewd = c.count('monsters', C.bewd, C.alt)
    // L'ATK du Dragon Blanc est déjà comptée. Le soutien de l'archétype ne doit pas rendre sa
    // conversion en Synchro moins bonne que garder des Tuners sans interruption sur le terrain.
    s += 250 * Math.min(2, bewd)
    if (c.up('spells', C.trueLight)) s += 500
    // La combinaison prête : montrer le Dragon Blanc suffit à invoquer l'Alternative.
    if (c.count('hand', C.bewd) > 0 && c.count('hand', C.alt) > 0) s += 450
    // Maiden au Cimetière revient dès qu'un Dragon Blanc est invoqué ; White Stone y appelle un Yeux Bleus à la fin du tour.
    if (c.count('grave', C.maiden) > 0 && (bewd > 0 || c.count('hand', C.bewd) > 0)) s += 250
    if (c.count('grave', C.whiteStone) > 0) s += 220
    if (c.count('grave', C.bewd, C.alt) > 0) s += 140
    if (c.count('hand', C.jet) > 0 && c.count('grave', C.bewd, C.alt) + bewd > 0) s += 250
    // Les cartes d'interruption gardées en main pèsent plus qu'une carte ordinaire.
    s += 170 * c.count('hand', C.ash, C.veiler, C.called)
    if (!c.me.monsters.some(Boolean) && !c.me.spellTraps.some(Boolean) && !c.me.fieldZone) s += 170 * c.count('hand', C.imperm)
    if (c.up('monsters', C.jet) > 0) s += 250 + 120 * c.me.spellTraps.filter(Boolean).length
    // Les Tuners sur le terrain avec un Dragon Blanc : un Synchro est à portée.
    if (bewd > 0 && c.count('monsters', ...TUNERS, C.neoKaiser) > 0) s += 100
    return s
  },
}
