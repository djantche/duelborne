// Les meilleurs decks des personnages principaux de Yu-Gi-Oh! (Duel Monsters), GX, 5D's et ARC-V.
//
// Chaque deck reprend l'archétype ou le monstre emblème du personnage, dans une liste jouable aujourd'hui : les cartes de son
// anime et leurs soutiens modernes qui le font fonctionner. Une ligne = « n Nom de carte » séparés par « | » (noms anglais de
// data/raw/cards.en.json) ; le tri Deck Principal / Extra Deck est automatique (voir build-decks.mjs, qui signale toute carte
// introuvable). Les decks existants du dossier (Starter Decks, Jack, Zane, Jesse…) restent : ceux-ci s'y ajoutent.
const HANDTRAPS = '3 Ash Blossom & Joyous Spring | 2 Called by the Grave | 3 Infinite Impermanence'

export const CHARACTERS = [
  // ─────────────── Yu-Gi-Oh! (Duel Monsters) ───────────────
  {
    file: 'yugi-magicien-sombre',
    name: 'Yugi · Magicien Sombre',
    series: 'Duel Monsters',
    cover: 'Dark Magician',
    list: `
      3 Dark Magician | 2 Dark Magician Girl | 1 Magician of Black Chaos | 3 Apprentice Magician | 1 Magician of Dark Illusion | 1 Palladium Oracle Mahad | 1 Skilled Dark Magician | 1 Dark Magician Girl the Magician's Apprentice
      3 Magicians' Souls | 1 Magician's Rod | 1 Dark Sage | 3 Eternal Soul | 3 Soul Servant | 3 Secrets of Dark Magic | 3 Dark Magic Attack | 2 Thousand Knives | 2 Magicians' Combination | 1 Dark Magic Expanded | 1 Dark Burning Attack
      ${HANDTRAPS} | 1 Monster Reborn | 1 Pot of Prosperity | 1 Mystical Space Typhoon
      1 Dark Magician the Dragon Knight | 1 Dark Magician Girl the Dragon Knight | 1 Dark Paladin | 1 Magician of Black Chaos MAX | 1 The Dark Magicians | 1 Dark Flare Knight | 1 Dark Cavalry | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'kaiba-dragons-blancs-cyber',
    name: 'Kaiba · Dragons Blancs & Cyber',
    series: 'Duel Monsters',
    cover: 'Blue-Eyes White Dragon',
    list: `
      3 Blue-Eyes White Dragon | 3 Sage with Eyes of Blue | 3 Maiden of White | 3 Cyber Dragon | 1 Cyber Dragon Core | 2 Neo Kaiser Sea Horse | 1 Blue-Eyes Alternative White Dragon | 1 Dragon Spirit of White | 1 Blue-Eyes Jet Dragon
      3 Wishes for Eyes of Blue | 2 Roar of the Blue-Eyed Dragons | 2 True Light | 3 Polymerization | 1 Overload Fusion | 2 Cyberload Fusion | 1 Ultimate Fusion | 1 Majesty of the White Dragons | 2 Cybernetic Revolution
      ${HANDTRAPS} | 1 Monster Reborn | 1 Pot of Prosperity
      1 Blue-Eyes Ultimate Dragon | 1 Cyber End Dragon | 1 Chimeratech Overdragon | 1 Cyber Twin Dragon | 1 Cyber Dragon Infinity | 1 Cyber Dragon Nova | 1 Cyber Dragon Sieger | 1 Blue-Eyes Twin Burst Dragon | 1 Neo Blue-Eyes Ultimate Dragon | 1 Blue-Eyes Alternative Ultimate Dragon | 1 Blue-Eyes Spirit Dragon | 1 Blue-Eyes Ultimate Spirit Dragon | 1 Blue-Eyes Tyrant Dragon | 1 Cyber Eternity Dragon | 1 Cyber Dragon Herz`,
  },
  {
    file: 'joey-yeux-rouges',
    name: 'Joey · Dragon Noir aux Yeux Rouges',
    series: 'Duel Monsters',
    cover: 'Red-Eyes Black Dragon',
    list: `
      3 Red-Eyes Black Dragon | 3 Red-Eyes Black Metal Dragon | 3 Black Dragon's Chick | 3 Red-Eyes Wyvern | 3 Red-Eyes Retro Dragon | 2 Red-Eyes Darkness Dragon | 2 Flame Swordsman | 1 Gearfried the Red-Eyes Iron Knight | 1 Time Wizard | 1 Lord of the Red
      3 Red-Eyes Fusion | 3 Red-Eyes Insight | 3 Red-Eyes Spirit | 2 Red-Eyes Soul | 2 Return of the Red-Eyes | 1 Polymerization | 2 Cards of the Red Stone | 1 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Red-Eyes Dark Dragoon | 1 Red-Eyes Flare Metal Dragon | 1 Red-Eyes Slash Dragon | 1 Red-Eyes Zombie Necro Dragon | 1 Red-Eyes Zombie Dragon Lord | 1 Red-Eyes Black Dragon Sword | 1 Meteor Black Comet Dragon | 1 Meteor Black Dragon | 1 Darkness Metal, the Dragon of Dark Steel | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'mai-harpies',
    name: 'Mai · Dames Harpie',
    series: 'Duel Monsters',
    cover: 'Harpie Lady Sisters',
    list: `
      3 Harpie Lady | 3 Harpie Lady Sisters | 3 Harpie Girl | 3 Harpie Channeler | 2 Harpie Dancer | 2 Harpie Harpist | 2 Harpie Perfumer | 1 Harpie Queen | 1 Harpie Oracle | 1 Cyber Harpie Lady | 1 Harpie's Pet Dragon
      3 Harpies' Hunting Ground | 3 Elegant Egotist | 3 Harpie's Feather Duster | 2 Hysteric Party | 3 Hysteric Sign | 2 Harpie Lady Elegance | 1 Harpie Lady Phoenix Formation | 1 Triangle Ecstasy Spark | 1 Pot of Prosperity | 1 Monster Reborn
      ${HANDTRAPS}
      1 Harpie's Pet Phantasmal Dragon | 1 Harpie Conductor | 1 Cyber Slash Harpie Lady | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess | 1 Chaos Angel | 1 Hieratic Seal of the Heavenly Spheres`,
  },
  {
    file: 'pegasus-toons',
    name: 'Pegasus · Monde Toon',
    series: 'Duel Monsters',
    cover: 'Toon Dark Magician Girl',
    list: `
      3 Toon World | 3 Toon Kingdom | 3 Toon Dark Magician Girl | 3 Toon Summoned Skull | 3 Toon Cannon Soldier | 3 Toon Mermaid | 3 Toon Gemini Elf | 2 Toon Goblin Attack Force | 2 Toon Masked Sorcerer | 2 Toon Buster Blader | 1 Toon Black Luster Soldier | 1 Toon Cyber Dragon | 1 Toon Dark Magician | 1 Toon Harpie Lady | 1 Blue-Eyes Toon Dragon | 1 Red-Eyes Toon Dragon | 1 Toon Table of Contents
      3 Manga Ryu-Ran | 1 Comic Hand | 1 Shadow Toon | 1 Thousand-Eyes Restrict | 1 Relinquished
      ${HANDTRAPS} | 1 Monster Reborn | 1 Pot of Prosperity | 1 Polymerization`,
  },
  {
    file: 'marik-dieux-egyptiens',
    name: 'Marik · Dieux Égyptiens',
    series: 'Duel Monsters',
    cover: 'Obelisk the Tormentor',
    list: `
      3 Obelisk the Tormentor | 3 Slifer the Sky Dragon | 3 The Winged Dragon of Ra | 2 Sphinx Teleia | 2 Andro Sphinx | 3 Mystical Elf | 3 Mystic Tomato | 2 Thousand-Eyes Idol | 2 Gift of The Mystical Elf | 2 Pharaonic Guardian Sphinx | 1 Guardian Sphinx | 1 Criosphinx | 1 Theinen the Great Sphinx
      3 Dark Hole | 3 Monster Reborn | 3 Foolish Burial | 2 Mystical Space Typhoon | 1 Heavy Storm | 1 Pot of Prosperity | 1 Raigeki
      ${HANDTRAPS} | 3 Solemn Judgment | 2 Magic Cylinder | 1 Mirror Force | 1 Dimensional Prison`,
  },
  {
    file: 'weevil-insectes',
    name: 'Weevil · Insectes',
    series: 'Duel Monsters',
    cover: 'Perfectly Ultimate Great Moth',
    list: `
      3 Petit Moth | 3 Cocoon of Evolution | 3 Great Moth | 1 Perfectly Ultimate Great Moth | 3 Basic Insect | 2 Insect Knight | 2 Insect Queen | 2 Ultimate Insect LV1 | 1 Ultimate Insect LV3 | 1 Ultimate Insect LV5 | 1 Ultimate Insect LV7 | 2 Insect Princess | 2 Shinobi Insect Hagakuremino | 1 Chainsaw Insect | 1 Mitsu the Insect Ninja | 1 Big Insect
      3 Insect Barrier | 2 Cocoon Party | 3 Metamorphosed Insect Queen | 1 Insect Armor with Laser Cannon | 1 Insect Imitation | 1 Bio-Insect Armor | 1 Pot of Prosperity | 3 Monster Reborn | 1 Dark Hole | 1 Mystical Space Typhoon
      ${HANDTRAPS} | 2 Solemn Judgment | 1 Mirror Force`,
  },
  {
    file: 'rex-dinosaures',
    name: 'Rex Raptor · Dinosaures',
    series: 'Duel Monsters',
    cover: 'Black Tyranno',
    list: `
      3 Black Tyranno | 3 Two-Headed King Rex | 2 Ultimate Tyranno | 3 Babycerasaurus | 3 Sabersaurus | 3 Gilasaurus | 3 Dark Driceratops | 3 Miracle Jurassic Egg | 3 Petiteranodon | 2 Little D | 1 Super Conductor Tyranno
      3 Fossil Dig | 1 Fossil Fusion | 3 Foolish Burial | 3 Monster Reborn | 2 Dark Hole | 2 Mystical Space Typhoon | 1 Pot of Prosperity | 1 Terraforming
      ${HANDTRAPS} | 3 Solemn Judgment | 2 Magic Cylinder | 1 Mirror Force | 1 Torrential Tribute`,
  },

  // ─────────────── Yu-Gi-Oh! GX ───────────────
  {
    file: 'gx-jaden-heros-elementaires',
    name: 'Jaden · Héros Élémentaires',
    series: 'GX',
    cover: 'Elemental HERO Neos',
    list: `
      3 Elemental HERO Stratos | 3 Elemental HERO Bubbleman | 3 Elemental HERO Clayman | 3 Elemental HERO Avian | 3 Elemental HERO Burstinatrix | 3 Elemental HERO Sparkman | 2 Elemental HERO Neos | 1 Elemental HERO Prisma | 1 Elemental HERO Wildheart | 1 Neo-Spacian Grand Mole | 1 Neo-Spacian Dark Panther | 1 Neo-Spacian Aqua Dolphin | 1 Winged Kuriboh
      3 Polymerization | 3 Miracle Fusion | 3 Neo Space | 3 Hero Flash!! | 2 Mask Change | 3 Fusion Substitute | 2 Skyscraper | 3 Favorite Hero | 2 Instant Neo Space | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Elemental HERO Flame Wingman | 1 Elemental HERO Shining Flare Wingman | 1 Elemental HERO Absolute Zero | 1 Elemental HERO Gaia | 1 Elemental HERO The Shining | 1 Elemental HERO Great Tornado | 1 Elemental HERO Electrum | 1 Elemental HERO Divine Neos | 1 Elemental HERO Escuridao | 1 Elemental HERO Terra Firma | 1 Elemental HERO Nova Master | 1 Elemental HERO Tempest | 1 Elemental HERO Magma Neos | 1 Elemental HERO Dark Neos | 1 Rainbow Neos`,
  },
  {
    file: 'gx-syrus-roids',
    name: 'Syrus · Roids & Vehicroids',
    series: 'GX',
    cover: 'Super Vehicroid Jumbo Drill',
    list: `
      3 Gyroid | 3 Drillroid | 3 Submarineroid | 3 Expressroid | 3 Steamroid | 3 Truckroid | 3 Rescueroid | 3 Carrierroid | 2 Armoroid | 2 Stealthroid | 2 Jetroid | 1 Shuttleroid | 1 Ambulanceroid
      3 Vehicroid Connection Zone | 3 Megaroid City | 3 Wonder Garage | 3 Supercharge | 2 Monster Reborn | 1 Pot of Prosperity | 1 Polymerization | 1 Mystical Space Typhoon
      ${HANDTRAPS}
      1 Super Vehicroid Jumbo Drill | 1 Super Vehicroid - Stealth Union | 1 Super Vehicroid - Mobile Base | 1 Steam Gyroid | 1 Ambulance Rescueroid | 1 Barbaroid, the Ultimate Battle Machine | 1 UFOroid Fighter | 1 Pair Cycroid | 1 Magical Android | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'gx-chazz-ojama-dragon-arme',
    name: 'Chazz · Ojama & Dragon Armé',
    series: 'GX',
    cover: 'Armed Dragon LV7',
    list: `
      3 Ojama Yellow | 3 Ojama Green | 3 Ojama Black | 3 Ojama Pink | 3 Ojama Blue | 3 Ojama Red | 3 Armed Dragon LV3 | 3 Armed Dragon LV5 | 2 Armed Dragon LV7 | 1 Armed Dragon LV10 | 2 Ojamuscle
      3 Ojama Trio | 3 Ojama Delta Hurricane!! | 3 Ojamatch | 3 Ojama Country | 3 Ojama Duo | 1 Ojamagic | 3 Level Up! | 1 Monster Reborn
      ${HANDTRAPS}
      1 Ojama King | 1 Ojama Emperor | 1 Ojama Knight | 1 Armed Dragon Catapult Cannon | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'gx-alexis-anges-cybers',
    name: 'Alexis · Anges Cybers',
    series: 'GX',
    cover: 'Cyber Angel Benten',
    list: `
      3 Cyber Petit Angel | 3 Cyber Egg Angel | 3 Cyber Angel Natasha | 3 Cyber Angel Benten | 2 Cyber Angel Dakini | 2 Cyber Angel Idaten | 2 Cyber Angel Izana | 2 Cyber Angel Vrash | 1 Cyber Tutu | 1 Cyber Prima | 1 Etoile Cyber | 1 Cyber Gymnast | 1 Cyber Blader
      3 Machine Angel Ritual | 3 Machine Angel Absolute Ritual | 2 Incarnated Machine Angel | 2 Magnificent Machine Angel | 2 Merciful Machine Angel | 2 Foolish Burial | 1 Pot of Prosperity | 2 Monster Reborn | 1 Mystical Space Typhoon
      ${HANDTRAPS}`,
  },
  {
    file: 'gx-aster-heros-du-destin',
    name: 'Aster Phoenix · Héros du Destin',
    series: 'GX',
    cover: 'Destiny HERO - Destroyer Phoenix Enforcer',
    list: `
      3 Destiny HERO - Diamond Dude | 3 Destiny HERO - Malicious | 3 Destiny HERO - Celestial | 3 Destiny HERO - Defender | 3 Destiny HERO - Fear Monger | 2 Destiny HERO - Dogma | 2 Destiny HERO - Doom Lord | 2 Destiny HERO - Dreadmaster | 2 Destiny HERO - Drawhand | 1 Destiny HERO - Plasma | 1 Destiny HERO - Dasher | 1 Destiny HERO - Captain Tenacious | 1 Destiny HERO - Decider
      3 Destiny Draw | 3 Dark City | 3 Fusion Destiny | 3 Polymerization | 2 Destiny Signal | 2 D - Time | 1 Clock Tower Prison | 1 Pot of Prosperity | 1 Monster Reborn
      ${HANDTRAPS}
      1 Destiny HERO - Destroyer Phoenix Enforcer | 1 Destiny HERO - Dystopia | 1 Destiny HERO - Dominance | 1 Destiny HERO - Dangerous | 1 Destiny HERO - Dusktopia | 1 Destiny End Dragoon | 1 Elemental HERO Shining Flare Wingman | 1 Knightmare Phoenix`,
  },

  // ─────────────── Yu-Gi-Oh! 5D's ───────────────
  {
    file: '5ds-yusei-stardust',
    name: 'Yusei · Dragon Poussière d’Étoile',
    series: "5D's",
    cover: 'Stardust Dragon',
    list: `
      3 Junk Synchron | 3 Quillbolt Hedgehog | 3 Stardust Synchron | 3 Starjunk Synchron | 3 Junk Destroyer | 3 Speed Warrior | 3 Nitro Warrior | 3 Road Synchron | 2 Turbo Synchron | 2 Steam Synchron | 2 Drill Synchron | 2 Nitro Synchron | 2 Hyper Synchron | 2 Quickdraw Synchron | 1 Stardust Charge Warrior | 1 Stardust Assault Warrior | 1 Stardust Wurm | 1 Junk Speeder
      3 Stardust Mirage | 2 Stardust Flash | 2 Stardust Shimmer | 3 Stardust Re-Spark | 2 Stardust Illumination | 2 Stardust Wish | 3 Foolish Burial | 2 Monster Reborn | 1 Pot of Prosperity | 1 Terraforming
      ${HANDTRAPS}
      2 Stardust Dragon | 1 Stardust Spark Dragon | 1 Stardust Sifr Divine Dragon | 1 Stardust Chronicle Spark Dragon | 1 Accel Synchro Stardust Dragon | 1 Shooting Star Dragon | 1 Shooting Quasar Dragon | 1 Junk Warrior | 1 Junk Warrior Extreme | 1 Power Tool Dragon | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Accel Synchron | 1 Formula Synchron | 1 Black Rose Dragon | 1 Hot Red Dragon Archfiend | 1 Red Nova Dragon`,
  },
  {
    file: '5ds-crow-ailes-noires',
    name: 'Crow · Ailes Noires',
    series: "5D's",
    cover: 'Black-Winged Dragon',
    list: `
      3 Blackwing - Gale the Whirlwind | 3 Blackwing - Zephyros the Elite | 3 Blackwing - Sirocco the Dawn | 3 Blackwing - Bora the Spear | 2 Blackwing - Kalut the Moon Shadow | 2 Blackwing - Kochi the Daybreak | 2 Blackwing - Shura the Blue Flame | 2 Blackwing - Oroshi the Squall | 2 Blackwing - Elphin the Raven | 1 Blackwing - Blizzard the Far North | 1 Blackwing - Vayu the Emblem of Honor | 1 Blackwing - Hillen the Tengu-wind | 1 Blackwing - Kris the Crack of Dawn
      3 Black Whirlwind | 2 Black Feather Beacon | 2 Blackbird Close | 3 Black Sonic | 2 Black Return | 2 Cards for Black Feathers | 2 Against the Wind | 1 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Black-Winged Dragon | 1 Blackwing Armor Master | 1 Blackwing Full Armor Master | 1 Blackwing - Silverwind the Ascendant | 1 Blackwing Armed Wing | 1 Blackwing - Nothung the Starlight | 1 Blackwing - Gram the Shining Star | 1 Blackwing - Boreastorm the Wicked Wind | 1 Blackwing Tamer - Obsidian Hawk Joe | 1 Black Rose Dragon | 1 Stardust Dragon | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Red Nova Dragon | 1 Hot Red Dragon Archfiend`,
  },
  {
    file: '5ds-akiza-rose-noire',
    name: 'Akiza · Dragon Rose Noire',
    series: "5D's",
    cover: 'Black Rose Dragon',
    list: `
      3 Roxrose Dragon | 3 Ruddy Rose Witch | 3 Twilight Rose Black Knight | 3 Witch of the Black Rose | 3 Rose, Warrior of Revenge | 3 Lonefire Blossom | 3 Spore | 3 Dandylion | 3 Evil Thorn | 3 Copy Plant | 2 Tytannial, Princess of Camellias | 2 Garden Rose Maiden | 1 Rose Girl | 1 Rose Shaman
      3 Black Rose Garden | 3 Basal Rose Shoot | 3 Hero's Rule 1: Five Freedoms | 1 Terraforming | 3 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Black Rose Dragon | 1 Black Rose Moonlight Dragon | 1 Bramble Rose Dragon | 1 Ruddy Rose Dragon | 1 Garden Rose Flora | 1 Rage Rose Witch | 1 Stardust Dragon | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Hot Red Dragon Archfiend | 1 Red Nova Dragon | 1 Ancient Fairy Dragon | 1 Mist Wurm | 1 Colossal Fighter | 1 Knightmare Phoenix`,
  },
  {
    file: '5ds-leo-morphtroniques',
    name: 'Leo · Morphtroniques',
    series: "5D's",
    cover: 'Power Tool Dragon',
    list: `
      3 Morphtronic Celfon | 3 Morphtronic Remoten | 3 Morphtronic Radion | 3 Morphtronic Boarden | 3 Morphtronic Videon | 3 Morphtronic Magnen | 3 Morphtronic Datatron | 3 Morphtronic Scopen | 2 Morphtronic Slingen | 2 Morphtronic Vacuumen | 2 Morphtronic Cameran | 1 Morphtronic Lantron | 1 Morphtronic Staplen
      3 Morphtransition | 2 Morphtronic Forcefield | 3 Morphtronic Accelerator | 3 Morphtronic Boomboxen | 2 Factory of 100 Machines | 1 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Power Tool Dragon | 1 Stardust Dragon | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Black Rose Dragon | 1 Hot Red Dragon Archfiend | 1 Red Nova Dragon | 1 Ancient Fairy Dragon | 1 Junk Warrior | 1 Accel Synchron | 1 Colossal Fighter | 1 Mist Wurm | 1 Morphtronic Earfon | 1 Armory Arm | 1 Knightmare Phoenix`,
  },

  // ─────────────── Yu-Gi-Oh! ARC-V ───────────────
  {
    file: 'arcv-yuya-yeux-bicolores',
    name: 'Yuya · Pendule Yeux Bicolores',
    series: 'ARC-V',
    cover: 'Odd-Eyes Pendulum Dragon',
    list: `
      3 Odd-Eyes Pendulum Dragon | 2 Odd-Eyes Advance Dragon | 2 Odd-Eyes Gravity Dragon | 2 Odd-Eyes Lancer Dragon | 2 Odd-Eyes Saber Dragon | 2 Odd-Eyes Wizard Dragon | 2 Odd-Eyes Pendulumgraph Dragon | 1 Supreme King Dragon Odd-Eyes | 3 Performapal Odd-Eyes Light Phoenix | 2 Performapal Odd-Eyes Unicorn | 3 Performapal Odd-Eyes Synchron | 2 Performapal Odd-Eyes Minitaurus | 2 Performapal Odd-Eyes Seer | 2 Performapal Odd-Eyes Butler | 2 Performapal Odd-Eyes Valet | 1 Performapal Odd-Eyes Dissolver | 1 Performapal Bot-Eyes Lizard
      3 Odd-Eyes Fusion | 2 Odd-Eyes Advent | 2 Spiral Flame Strike | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Odd-Eyes Absolute Dragon | 1 Odd-Eyes Arcray Dragon | 1 Odd-Eyes Meteorburst Dragon | 1 Odd-Eyes Override Dragon | 1 Odd-Eyes Rebellion Xyz Dragon | 1 Odd-Eyes Solblaze Dragon | 1 Odd-Eyes Vortex Dragon | 1 Rune-Eyes Pendulum Dragon | 1 Performapal Odd-Eyes Metal Claw | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Dark Rebellion Xyz Dragon | 1 Knightmare Phoenix`,
  },
  {
    file: 'arcv-yugo-speedroids',
    name: 'Yugo · Speedroids',
    series: 'ARC-V',
    cover: 'Clear Wing Synchro Dragon',
    list: `
      3 Speedroid Terrortop | 3 Speedroid Taketomborg | 3 Speedroid Double Yoyo | 3 Speedroid Menko | 3 Speedroid Red-Eyed Dice | 3 Speedroid Pachingo-Kart | 3 Speedroid Tri-Eyed Dice | 2 Speedroid Skull Marbles | 2 Speedroid Gum Prize | 2 Speedroid Razorang | 2 Speedroid Maliciousmagnet | 1 Speedroid Ohajikid | 1 Speedroid Horse Stilts | 3 Odd-Eyes Pendulum Dragon | 2 Performapal Odd-Eyes Synchron
      3 Speedlift | 3 Hi-Speed Re-Level | 3 Speed Recovery | 3 Re-dyce-cle | 2 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Stardust Dragon | 1 Shooting Quasar Dragon | 1 Red Nova Dragon | 1 Hot Red Dragon Archfiend | 1 Black Rose Dragon | 1 Mist Wurm | 1 Colossal Fighter | 1 Accel Synchron | 1 Odd-Eyes Rebellion Xyz Dragon | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'arcv-yuto-chevaliers-fantomes',
    name: 'Yuto · Chevaliers Fantômes',
    series: 'ARC-V',
    cover: 'Dark Rebellion Xyz Dragon',
    list: `
      3 The Phantom Knights of Silent Boots | 3 The Phantom Knights of Shade Brigandine | 3 The Phantom Knights of Ancient Cloak | 3 The Phantom Knights of Wrong Magnetring | 3 The Phantom Knights of Fragile Armor | 3 The Phantom Knights of Lost Vambrace | 3 The Phantom Knights of Ragged Gloves | 2 The Phantom Knights of Mist Claws | 1 The Phantom Knights of Stained Greaves | 1 The Phantom Knights of Torn Scales | 1 The Phantom Knights of Tomb Shield | 1 The Phantom Knights of Umbrage Veil
      3 Phantom Knights' Fog Blade | 3 Phantom Knights' Sword | 3 The Phantom Knights' Rank-Up-Magic Launch | 2 The Phantom Knights' Rank-Up-Magic Requiem | 2 Phantom Knights' Wing | 2 Phantom Knights' Spear | 3 Raider's Unbreakable Mind | 2 Rank-Up-Magic Raptor's Force | 1 Pot of Prosperity
      ${HANDTRAPS}
      2 Dark Rebellion Xyz Dragon | 1 Dark Rebellion Xyz Dragon, Four Heavenly Dragons | 1 The Phantom Knights of Break Sword | 1 The Phantom Knights of Cursed Javelin | 1 The Phantom Knights of Malevolent Scythe | 1 The Phantom Knights of Rusty Bardiche | 1 Raider's Knight | 1 Phantom of Yubel | 1 Number 39: Utopia | 1 Number C39: Utopia Ray | 1 Number 39: Utopia Beyond | 1 Raidraptor - Revolution Falcon | 1 Raidraptor - Rise Falcon | 1 Knightmare Phoenix`,
  },
  {
    file: 'arcv-yuri-predaplantes',
    name: 'Yuri · Prédaplantes',
    series: 'ARC-V',
    cover: 'Starving Venom Fusion Dragon',
    list: `
      3 Predaplant Chlamydosundew | 3 Predaplant Flytrap | 3 Predaplant Ophrys Scorpio | 3 Predaplant Darlingtonia Cobra | 3 Predaplant Sarraceniant | 3 Predaplant Spinodionaea | 2 Predaplant Byblisp | 2 Predaplant Squid Drosera | 2 Predaplant Heliamphorhynchus | 2 Predaplant Moray Nepenthes | 2 Predaplant Banksiogre | 1 Predaplant Cordyceps | 1 Predaplant Pterapenthes | 1 Predaplant Drosophyllum Hydra
      3 Predaprime Fusion | 3 Predaponics | 3 Predapruning | 3 Predaplanning | 2 Predapractice | 3 Polymerization | 1 Pot of Prosperity
      ${HANDTRAPS}
      2 Starving Venom Predapower Fusion Dragon | 1 Greedy Venom Fusion Dragon | 1 Predaplant Verte Anaconda | 1 Predaplant Chimerafflesia | 1 Predaplant Dragostapelia | 1 Predaplant Ambulomelides | 1 Predaplant Triphyoverutum | 1 Black Rose Dragon | 1 Knightmare Phoenix | 1 Apollousa, Bow of the Goddess`,
  },
  {
    file: 'arcv-shun-raidraptors',
    name: 'Shun · Raidraptors',
    series: 'ARC-V',
    cover: 'Raidraptor - Revolution Falcon',
    list: `
      3 Raidraptor - Vanishing Lanius | 3 Raidraptor - Fuzzy Lanius | 3 Raidraptor - Mimicry Lanius | 3 Raidraptor - Tribute Lanius | 2 Raidraptor - Skull Eagle | 2 Raidraptor - Sharp Lanius | 2 Raidraptor - Strangle Lanius | 1 Raidraptor - Pain Lanius | 1 Raidraptor - Noir Lanius | 1 Raidraptor - Singing Lanius | 1 Raidraptor - Heel Eagle | 2 Raidraptor - Necro Vulture | 1 Raidraptor - Last Strix | 1 Raidraptor - Booster Strix
      3 Raidraptor - Nest | 3 Raidraptor - Call | 2 Raidraptor - Roost | 2 Raidraptor - Return | 3 Raider's Wing | 3 Rank-Up-Magic Raptor's Force | 1 Rank-Up-Magic Revolution Force | 1 Rank-Up-Magic Raid Force
      ${HANDTRAPS}
      1 Raidraptor - Revolution Falcon | 1 Raidraptor - Revolution Falcon - Air Raid | 1 Raidraptor - Rise Falcon | 1 Raidraptor - Satellite Cannon Falcon | 1 Raidraptor - Blaze Falcon | 1 Raidraptor - Stranger Falcon | 1 Raidraptor - Force Strix | 1 Raidraptor - Brave Strix | 1 Raidraptor - Wise Strix | 1 Raidraptor - Fiend Eagle | 1 Raidraptor - Ultimate Falcon | 1 Raidraptor - Final Fortress Falcon | 1 Raidraptor - Arsenal Falcon | 1 Raidraptor - Blade Burner Falcon | 1 Raidraptor - Rising Rebellion Falcon`,
  },
  {
    file: 'arcv-gong-samourais-lourds',
    name: 'Gong · Samouraïs Lourds',
    series: 'ARC-V',
    cover: 'Superheavy Samurai Big Benkei',
    list: `
      3 Superheavy Samurai Big Benkei | 3 Superheavy Samurai Flutist | 3 Superheavy Samurai Scales | 3 Superheavy Samurai Kabuto | 3 Superheavy Samurai Blue Brawler | 3 Superheavy Samurai Battleball | 3 Superheavy Samurai Ninja Sarutobi | 3 Superheavy Samurai Prodigy Wakaushi | 3 Superheavy Samurai Blowtorch | 2 Superheavy Samurai Monk Big Benkei | 2 Superheavy Samurai Beast Kyubi | 2 Superheavy Samurai Ogre Shutendoji | 2 Superheavy Samurai General Jade | 2 Superheavy Samurai General Coral
      3 Superheavy Samurai Soulbang Cannon | 3 Superheavy Samurai Prepped Defense | 3 Superheavy Samurai Magnet | 3 Superheavy Samurai Drum | 2 Superheavy Samurai Motorbike | 2 Superheavy Samurai Security | 1 Superheavy Samurai Helper | 2 Monster Reborn | 1 Pot of Prosperity
      ${HANDTRAPS}
      1 Superheavy Samurai Brave Masurawo | 1 Superheavy Samurai Commander Shanawo | 1 Stardust Dragon | 1 Clear Wing Synchro Dragon | 1 Crystal Wing Synchro Dragon | 1 Number 39: Utopia | 1 Number C39: Utopia Ray | 1 Knightmare Phoenix`,
  },
]
