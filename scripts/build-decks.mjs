#!/usr/bin/env node
// Génère les decks fournis avec le jeu (decks/*.ydk), sans rien télécharger : tout vient des données
// déjà récupérées par `npm run fetch-cards`.
//
// Trois sources :
//   1. Starter Decks des personnages de l'anime : chaque carte porte la liste des produits où elle
//      est parue, ce qui permet de reconstituer ces decks.
//   2. Structure Decks récents, reconstitués de la même façon (les doubles sont devinés, voir plus bas).
//   3. Decks modernes écrits à la main ci-dessous, par nom de carte.
//
// Un .ydk est le format de deck d'EDOPro : une liste d'identifiants de cartes. On peut donc aussi
// déposer dans decks/ n'importe quel deck exporté depuis EDOPro ou YGOPRODeck.
//
// Usage : npm run build-decks
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { ARCHETYPES } from './decks-archetypes.mjs'
import { CHARACTERS } from './decks-personnages.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW = path.join(ROOT, 'data/raw/cards.en.json')
const CDB = path.join(ROOT, 'data/ocg/BabelCDB/cards.cdb')
const OUT = path.join(ROOT, 'decks')

/** [fichier, nom affiché, série, produit d'origine] */
const STARTERS = [
  ['yugi', 'Yugi', 'Duel Monsters', 'Starter Deck: Yugi'],
  ['kaiba', 'Kaiba', 'Duel Monsters', 'Starter Deck: Kaiba'],
  ['joey', 'Joey', 'Duel Monsters', 'Starter Deck: Joey'],
  ['pegasus', 'Pegasus', 'Duel Monsters', 'Starter Deck: Pegasus'],
  ['yugi-evolution', 'Yugi (Évolution)', 'Duel Monsters', 'Starter Deck: Yugi Evolution'],
  ['kaiba-evolution', 'Kaiba (Évolution)', 'Duel Monsters', 'Starter Deck: Kaiba Evolution'],
  ['yugi-muto', 'Yugi Muto', 'Duel Monsters', 'Structure Deck: Yugi Muto'],
  ['jaden', 'Jaden Yuki', 'GX', 'Starter Deck: Jaden Yuki'],
  ['syrus', 'Syrus Truesdale', 'GX', 'Starter Deck: Syrus Truesdale'],
  ['yuya', 'Yuya', 'ARC-V', 'Starter Deck: Yuya'],
]

const STRUCTURES = [
  ['sd-crimson-king', 'Jack Atlas · Roi Cramoisi', 'Structure Deck', 'Structure Deck: The Crimson King'],
  ['sd-cyber-strike', 'Zane · Cyber Dragon', 'Structure Deck', 'Structure Deck: Cyber Strike'],
  ['sd-crystal-beasts', 'Jesse · Bêtes Cristallines', 'Structure Deck', 'Structure Deck: Legend of the Crystal Beasts'],
  ['sd-soulburner', 'Soulburner · Salamangreat', 'Structure Deck', 'Structure Deck: Soulburner'],
  ['sd-rokket', 'Revolver · Rokket', 'Structure Deck', 'Structure Deck: Rokket Revolt'],
  ['sd-fire-kings', 'Rois du Feu', 'Structure Deck', 'Structure Deck: Fire Kings'],
  ['sd-dark-world', 'Monde Ténébreux', 'Structure Deck', 'Structure Deck: Dark World'],
  ['sd-traptrix', 'Traptrix', 'Structure Deck', 'Structure Deck: Beware of Traptrix'],
  ['sd-albaz', 'Albaz', 'Structure Deck', 'Structure Deck: Albaz Strike'],
  ['sd-sacred-beasts', 'Bêtes Sacrées', 'Structure Deck', 'Structure Deck: Sacred Beasts'],
]

// Cartes génériques pour compléter un deck moderne dont une carte serait introuvable.
const STAPLES = ['Ash Blossom & Joyous Spring', 'Infinite Impermanence', 'Effect Veiler', 'Called by the Grave', 'Monster Reborn', 'Lightning Storm', 'Pot of Prosperity', 'Foolish Burial', 'Mystical Space Typhoon', 'Dark Hole', 'Solemn Judgment', 'Mirror Force', 'Raigeki', 'Cosmic Cyclone', 'Terraforming']

/**
 * Decks modernes : « n Nom de carte » par ligne. Le tri Deck Principal / Extra Deck est automatique.
 * `cover` : la carte emblème de la vignette.
 */
const MODERN = [
  {
    file: 'yubel',
    name: 'Yubel',
    cover: 'Phantom of Yubel',
    list: `
      1 Yubel | 1 Yubel - Terror Incarnate | 1 Yubel - The Ultimate Nightmare | 3 Spirit of Yubel
      3 Samsara D Lotus | 3 Dark Beckoning Beast | 2 Chaos Summoning Beast | 2 Gruesome Grave Squirmer
      1 Uria, Lord of Searing Flames | 1 Hamon, Lord of Striking Thunder | 1 Raviel, Lord of Phantasms
      3 Opening of the Spirit Gates | 3 Nightmare Pain | 3 Nightmare Throne | 2 Fallen Paradise | 1 Mature Chronicle | 1 Eternal Favorite
      3 Ash Blossom & Joyous Spring | 2 Called by the Grave | 3 Infinite Impermanence
      2 Phantom of Yubel | 1 Yubel - The Loving Defender Forever | 1 Aerial Eater | 1 Armityle the Chaos Phantasm | 1 The Chaotic Phantasmal Sacred Beasts
      1 Muckraker From the Underworld | 1 Moon of the Closed Heaven | 1 S:P Little Knight | 1 Knightmare Phoenix | 1 Accesscode Talker
      1 D/D/D Wave High King Caesar | 1 Varudras, the Final Bringer of the End Times`,
  },
  {
    file: 'blue-eyes',
    name: 'Dragon Blanc aux Yeux Bleus',
    cover: 'Blue-Eyes Ultimate Spirit Dragon',
    list: `
      3 Blue-Eyes White Dragon | 3 Sage with Eyes of Blue | 3 Maiden of White | 2 Neo Kaiser Sea Horse | 1 Dictator of D.
      1 Blue-Eyes Jet Dragon | 1 Blue-Eyes Abyss Dragon | 1 The White Stone of Ancients | 1 Dragon Spirit of White | 1 Blue-Eyes Alternative White Dragon
      3 Wishes for Eyes of Blue | 2 Roar of the Blue-Eyed Dragons | 2 True Light | 1 Majesty of the White Dragons | 1 Mausoleum of White
      1 Ultimate Fusion | 1 Bingo Machine, Go!!! | 1 The Melody of Awakening Dragon | 2 Trade-In
      3 Ash Blossom & Joyous Spring | 2 Effect Veiler | 3 Infinite Impermanence | 1 Called by the Grave
      2 Blue-Eyes Ultimate Spirit Dragon | 2 Blue-Eyes Spirit Dragon | 1 Azure-Eyes Silver Dragon | 1 Indigo-Eyes Silver Dragon | 2 Spirit with Eyes of Blue
      1 Blue-Eyes Tyrant Dragon | 1 Neo Blue-Eyes Ultimate Dragon | 1 Blue-Eyes Twin Burst Dragon | 1 Blue-Eyes Alternative Ultimate Dragon
      1 Hieratic Seal of the Heavenly Spheres | 1 Baronne de Fleur | 1 Number 97: Draglubion`,
  },
  {
    file: 'dark-magician',
    name: 'Magicien Sombre',
    cover: 'Dark Magician',
    list: `
      3 Dark Magician | 3 Magician's Rod | 3 Magicians' Souls | 2 Illusion of Chaos | 1 Apprentice Illusion Magician | 1 Dark Magician Girl
      1 Magician of Dark Illusion | 1 Timaeus the United Dragon | 1 Magician of Chaos
      3 Dark Magical Circle | 3 Soul Servant | 2 Magician's Salvation | 1 Illusion Magic | 1 Secrets of Dark Magic | 1 The Eye of Timaeus | 1 Piercing the Darkness | 1 Chaos Form
      3 Eternal Soul | 3 Magician Navigation
      2 Ash Blossom & Joyous Spring | 1 Called by the Grave | 2 Infinite Impermanence
      1 Dark Magician the Dragon Knight | 1 Red-Eyes Dark Dragoon | 1 The Dark Magicians | 1 Dark Paladin | 1 Amulet Dragon | 1 Master of Chaos | 1 Dark Cavalry
      1 Dark Magician Girl the Dragon Knight | 1 Quintet Magician | 2 Ebon Illusion Magician | 1 Ebon High Magician | 1 Number 11: Big Eye
      1 Selene, Queen of the Master Magicians | 1 Artemis, the Magistus Moon Maiden`,
  },
  {
    file: 'hero',
    name: 'HÉROS',
    cover: 'Destiny HERO - Destroyer Phoenix Enforcer',
    list: `
      1 Elemental HERO Stratos | 2 Elemental HERO Shadow Mist | 1 Elemental HERO Solid Soldier | 2 Elemental HERO Liquid Soldier | 1 Elemental HERO Honest Neos | 1 Elemental HERO Neos
      3 Vision HERO Faris | 2 Vision HERO Increase | 3 Vision HERO Vyon | 2 Destiny HERO - Malicious | 1 Destiny HERO - Celestial | 1 Destiny HERO - Denier
      2 Elemental HERO Spirit of Neos | 1 Neo Space Connector
      3 A Hero Lives | 3 E - Emergency Call | 2 Polymerization | 2 Fusion Destiny | 1 Miracle Fusion | 2 Mask Change | 1 Reinforcement of the Army | 1 Favorite Contact
      2 Ash Blossom & Joyous Spring
      2 Destiny HERO - Destroyer Phoenix Enforcer | 1 Destiny HERO - Dangerous | 1 Elemental HERO Sunrise | 1 Elemental HERO Absolute Zero
      1 Elemental HERO Flame Wingman - Infernal Rage | 1 Elemental HERO Shining Neos Wingman | 1 Masked HERO Dark Law | 1 Masked HERO Acid
      1 Xtra HERO Wonder Driver | 1 Xtra HERO Cross Crusader | 1 Xtra HERO Infernal Devicer | 1 Xtra HERO Dread Decimator | 1 Vision HERO Trinity | 1 Wake Up Your Elemental HERO`,
  },
  {
    file: 'sky-striker',
    name: 'Sky Striker',
    cover: 'Sky Striker Ace - Raye',
    list: `
      3 Sky Striker Ace - Raye | 3 Sky Striker Ace - Roze
      3 Sky Striker Mobilize - Engage! | 2 Sky Striker Mecha - Hornet Drones | 3 Sky Striker Mecha - Widow Anchor | 1 Sky Striker Mecha - Eagle Booster | 1 Sky Striker Mecha - Shark Cannon
      2 Sky Striker Maneuver - Afterburners! | 1 Sky Striker Maneuver - Jamming Waves! | 2 Sky Striker Mecha Modules - Multirole | 1 Sky Striker Airspace - Area Zero
      1 Sky Striker Maneuver - Scissors Cross | 1 Sky Striker Mobilize - Linkage! | 1 Reinforcement of the Army | 2 Upstart Goblin | 2 Lightning Storm | 1 Terraforming
      3 Ash Blossom & Joyous Spring | 2 Effect Veiler | 3 Infinite Impermanence | 2 Called by the Grave
      3 Sky Striker Ace - Kagari | 2 Sky Striker Ace - Shizuku | 2 Sky Striker Ace - Hayate | 1 Sky Striker Ace - Kaina | 1 Sky Striker Ace - Zeke
      1 Sky Striker Ace - Camellia | 1 Sky Striker Ace - Azalea | 1 Accesscode Talker | 1 Knightmare Phoenix | 1 I:P Masquerena | 1 S:P Little Knight`,
  },
  {
    file: 'salamangreat',
    name: 'Salamangreat',
    cover: 'Salamangreat Pyro Phoenix',
    list: `
      3 Salamangreat Gazelle | 3 Salamangreat Spinny | 2 Salamangreat Jack Jaguar | 1 Salamangreat Falco | 2 Salamangreat Foxy | 1 Salamangreat Meer
      1 Salamangreat Raccoon | 1 Salamangreat Fowl | 2 Salamangreat of Fire | 2 Lady Debug | 1 Flame Bufferlo
      3 Salamangreat Circle | 2 Salamangreat Sanctuary | 1 Will of the Salamangreat | 1 Fusion of Fire | 1 Rise of the Salamangreat | 2 Cynet Mining
      2 Salamangreat Roar | 1 Salamangreat Rage
      3 Ash Blossom & Joyous Spring | 2 Called by the Grave | 3 Infinite Impermanence
      2 Salamangreat Balelynx | 2 Salamangreat Sunlight Wolf | 2 Salamangreat Heatleo | 1 Salamangreat Pyro Phoenix | 1 Salamangreat Miragestallio
      1 Salamangreat Violet Chimera | 1 Salamangreat Raging Phoenix | 1 Update Jammer | 1 Transcode Talker | 1 Accesscode Talker | 1 Decode Talker Heatsoul | 1 Splash Mage`,
  },
  {
    file: 'swordsoul',
    name: 'Swordsoul',
    cover: 'Swordsoul Grandmaster - Chixiao',
    list: `
      3 Swordsoul of Mo Ye | 3 Swordsoul of Taia | 3 Swordsoul Strategist Longyuan | 3 Incredible Ecclesia, the Virtuous
      1 Tenyi Spirit - Adhara | 2 Tenyi Spirit - Vishuda | 3 Tenyi Spirit - Ashuna | 1 Archnemeses Protos
      3 Swordsoul Emergence | 1 Swordsoul Sacred Summit | 2 Swordsoul Blackout | 1 Swordsoul Assessment | 1 Vessel for the Dragon Cycle | 1 Heavenly Dragon Circle | 2 Pot of Desires
      3 Ash Blossom & Joyous Spring | 2 Called by the Grave | 3 Infinite Impermanence | 2 Effect Veiler
      2 Swordsoul Grandmaster - Chixiao | 2 Swordsoul Sinister Sovereign - Qixing Longyuan | 1 Swordsoul Supreme Sovereign - Chengying
      1 Baronne de Fleur | 1 Yazi, Evil of the Yang Zing | 1 Baxia, Brightness of the Yang Zing | 1 Draco Berserker of the Tenyi | 1 Monk of the Tenyi
      1 Berserker of the Tenyi | 1 Shaman of the Tenyi | 1 Ruddy Rose Dragon | 1 Adamancipator Risen - Dragite | 1 Geomathmech Final Sigma`,
  },
  {
    file: 'branded',
    name: 'Branded Despia',
    cover: 'Mirrorjade the Iceblade Dragon',
    list: `
      3 Fallen of Albaz | 3 Aluber the Jester of Despia | 2 Despian Tragedy | 1 Springans Kitt | 2 Blazing Cartesia, the Virtuous | 1 Tri-Brigade Mercourier
      1 Albion the Shrouded Dragon | 1 Guiding Quem, the Virtuous | 1 The Bystial Lubellion | 1 Bystial Magnamhut | 1 Bystial Druiswurm
      3 Branded Fusion | 2 Branded Opening | 2 Branded in Red | 1 Branded in High Spirits | 1 Branded Lost | 1 Fusion Deployment | 1 Foolish Burial | 2 Super Polymerization
      1 Branded Retribution | 1 Branded Beast
      3 Ash Blossom & Joyous Spring | 2 Called by the Grave | 3 Infinite Impermanence
      2 Mirrorjade the Iceblade Dragon | 1 Albion the Branded Dragon | 1 Lubellion the Searing Dragon | 1 Titaniklad the Ash Dragon | 1 Granguignol the Dusk Dragon
      1 Despian Quaeritis | 1 Guardian Chimera | 1 Albion the Sanctifire Dragon | 1 Alba-Lenatus the Abyss Dragon | 1 Brigrand the Glory Dragon
      1 Rindbrumm the Striking Dragon | 1 Sprind the Irondash Dragon | 1 Predaplant Dragostapelia | 1 Mudragon of the Swamp`,
  },
  {
    file: 'tenpai',
    name: 'Dragon Tenpai',
    cover: 'Sangenpai Bident Dragion',
    list: `
      3 Tenpai Dragon Chundra | 3 Tenpai Dragon Paidra | 2 Tenpai Dragon Fadra | 1 Tenpai Dragon Genroku
      3 Sangen Summoning | 2 Sangen Kaimen | 3 Bonfire | 3 Pot of Prosperity | 2 Lightning Storm | 1 Harpie's Feather Duster | 2 Dark Ruler No More
      2 Triple Tactics Talent | 2 Upstart Goblin
      3 Ash Blossom & Joyous Spring | 3 Effect Veiler | 3 Infinite Impermanence | 2 Called by the Grave
      3 Sangenpai Bident Dragion | 2 Sangenpai Transcendent Dragion | 2 Trident Dragion | 1 Black Rose Dragon | 1 Ruddy Rose Dragon
      1 Salamangreat Raging Phoenix | 1 Promethean Princess, Bestower of Flames | 1 Worldsea Dragon Zealantis | 1 Hiita the Fire Charmer, Ablaze | 1 Crimson Dragon | 1 Bystial Dis Pater`,
  },
]

if (!existsSync(RAW)) {
  console.error('data/raw/cards.en.json introuvable. Lance d’abord : npm run fetch-cards')
  process.exit(1)
}
const cards = JSON.parse(await readFile(RAW, 'utf8')).data
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]))
const isExtra = (c) => /Fusion|Synchro|XYZ|Link/.test(c.type)
const playable = (c) => c.frameType !== 'token' && c.frameType !== 'skill'

// Cartes dont le script d'effet ne se charge pas dans le moteur embarqué (script plus récent que le
// moteur) : elles se joueraient sans effet, on les écarte des decks générés.
const BROKEN = new Set([88264978])

// Une carte inconnue du moteur ferait échouer le duel : on la retire du deck.
let inEngine = (c) => !BROKEN.has(c.id)
if (existsSync(CDB)) {
  const db = new DatabaseSync(CDB, { readOnly: true })
  const known = new Set(db.prepare('select id from datas').all().map((r) => Number(r.id)))
  inEngine = (c) => known.has(c.id) && !BROKEN.has(c.id)
}

const ace = (list) => [...list].filter((c) => c.atk !== undefined).sort((a, b) => (b.level ?? b.linkval ?? 0) - (a.level ?? a.linkval ?? 0) || b.atk - a.atk)[0]

async function write(file, name, series, source, main, extra, cover) {
  const lines = [
    '#created by Duelborne (scripts/build-decks.mjs)',
    `#name: ${name}`,
    `#series: ${series}`,
    `#source: ${source}`,
    `#cover: ${(cover ?? ace([...main, ...extra]) ?? main[0]).id}`,
    '#main',
    ...main.map((c) => c.id),
    '#extra',
    ...extra.map((c) => c.id),
    '!side',
  ]
  await writeFile(path.join(OUT, `${file}.ydk`), lines.join('\n') + '\n')
  console.log(`✔ ${name.padEnd(30)} ${String(main.length).padStart(2)} cartes + ${String(extra.length).padStart(2)} Extra`)
}

await mkdir(OUT, { recursive: true })

// ── 1 et 2 : decks reconstitués à partir d'un produit ──
for (const [list, pad] of [
  [STARTERS, false],
  [STRUCTURES, true],
]) {
  for (const [file, name, series, product] of list) {
    const inSet = cards.filter((c) => c.card_sets?.some((s) => s.set_name === product) && playable(c) && inEngine(c))
    const main = inSet.filter((c) => !isExtra(c))
    const extra = inSet.filter(isExtra).slice(0, 15)
    // Les données ne disent pas combien d'exemplaires contient un Structure Deck : on double d'abord
    // les monstres qui s'invoquent sans Tribut, puis les Magies, jusqu'à 40 cartes.
    if (pad) {
      const doubles = [...main.filter((c) => c.atk !== undefined && (c.level ?? 9) <= 4), ...main.filter((c) => c.frameType === 'spell')]
      for (let i = 0; main.length < 40 && i < doubles.length * 2; i++) main.push(doubles[i % doubles.length])
    }
    if (main.length < 40) {
      console.warn(`✖ ${name} : seulement ${main.length} cartes dans « ${product} », deck ignoré`)
      continue
    }
    await write(file, name, series, product, main, extra)
  }
}

// ── 3 : decks modernes écrits à la main ──
/**
 * Liste « n Nom | n Nom » d'un deck d'archétype (voir decks-archetypes.mjs) : les cartes de l'archétype jouables dans le moteur,
 * petits monstres à effet en 3 exemplaires, moyens en 2, gros en 1, puis Magies et Pièges ; tout l'Extra Deck de l'archétype.
 */
function autoList(deck) {
  const seen = new Set()
  const pool = cards.filter((c) => c.archetype === deck.archetype && playable(c) && inEngine(c) && !seen.has(c.name) && seen.add(c.name))
  const level = (c) => c.level ?? c.linkval ?? 0
  const rank = (c) => {
    if (c.atk === undefined) return c.type.includes('Trap') ? 3 : 2
    if (c.type.includes('Normal')) return 3
    return level(c) <= 4 ? 1 : level(c) <= 6 ? 2 : 4
  }
  const copies = (c) => {
    if (c.atk === undefined) return c.race === 'Field' ? 1 : c.type.includes('Trap') ? 2 : 3
    return level(c) <= 4 ? 3 : level(c) <= 6 ? 2 : 1
  }
  const entries = []
  let total = 0
  for (const c of pool.filter((x) => !isExtra(x)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))) {
    const n = Math.min(copies(c), 44 - total)
    if (n <= 0) break
    entries.push(`${n} ${c.name}`)
    total += n
  }
  const extra = pool.filter(isExtra).sort((a, b) => level(b) - level(a)).slice(0, 15).map((c) => `1 ${c.name}`)
  if (!pool.length) console.warn(`  ⚠ ${deck.name} : aucune carte pour l'archétype « ${deck.archetype} »`)
  return [...entries, ...extra, 'AUTRES', deck.add ?? '', ...(deck.add ? [] : [])].filter((x) => x && x !== 'AUTRES').join(' | ')
}

for (const deck of [...MODERN, ...CHARACTERS, ...ARCHETYPES.map((d) => ({ ...d, list: autoList(d) }))]) {
  const main = []
  const extra = []
  const missing = []
  const add = (name, n) => {
    const card = byName.get(name.toLowerCase())
    if (!card || !inEngine(card)) return missing.push(name)
    for (let i = 0; i < n; i++) (isExtra(card) ? extra : main).push(card)
  }
  for (const entry of deck.list.split(/[|\n]/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d)\s+(.+)$/.exec(entry)
    if (m) add(m[2], Number(m[1]))
  }
  // Carte introuvable (nom différent dans les données) : on complète avec des cartes génériques.
  for (const name of STAPLES) {
    const card = byName.get(name.toLowerCase())
    while (card && main.length < 40 && main.filter((c) => c.id === card.id).length < 3) main.push(card)
  }
  if (missing.length) console.warn(`  ⚠ ${deck.name} : introuvables → ${missing.join(' · ')}`)
  await write(deck.file, deck.name, deck.series ?? 'Moderne', deck.archetype ? `archétype ${deck.archetype}` : 'liste écrite à la main', main, extra.slice(0, 15), deck.cover ? byName.get(deck.cover.toLowerCase()) : undefined)
}
