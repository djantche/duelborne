// Decks bâtis à partir d'un ARCHÉTYPE (champ « archetype » de data/raw/cards.en.json) : le builder (build-decks.mjs, autoList)
// choisit les cartes de l'archétype disponibles dans le moteur — les petits monstres à effet en trois exemplaires, les
// monstres moyens en deux, les gros en un seul, puis Magies et Pièges — complète avec des cartes d'interruption génériques
// et ajoute tout le Extra Deck de l'archétype. `add` : cartes supplémentaires (« n Nom | n Nom »), `skip` : cartes à écarter.
// Ces decks sont des bases cohérentes de l'archétype, pas des listes de tournoi : pour affiner l'un d'eux, écrire sa liste
// à la main dans decks-personnages.mjs.
export const ARCHETYPES = [
  // ─────────────── Personnages ───────────────
  { file: 'yugi-exodia', name: 'Yugi · Exodia', series: 'Duel Monsters', archetype: 'Exodia', add: '1 Exodia the Forbidden One | 1 Left Leg of the Forbidden One | 1 Right Leg of the Forbidden One | 1 Left Arm of the Forbidden One | 1 Right Arm of the Forbidden One | 3 Pot of Prosperity | 3 Upstart Goblin | 3 Card of Demise | 3 Royal Magical Library | 3 Mind Control | 3 Terraforming', cover: 'Exodia the Forbidden One' },
  { file: 'dartz-atlantiens', name: 'Dartz · Atlantes', series: 'Duel Monsters', archetype: 'Atlantean', add: '3 Legendary Atlantean Tridon | 3 Mermail Abysstrite | 3 Abyss-scale of the Mizuchi' },
  { file: 'gx-crowler-engrenages-anciens', name: 'Crowler · Engrenages Antiques', series: 'GX', archetype: 'Ancient Gear', cover: 'Ancient Gear Golem' },
  { file: 'gx-sartorius-arcana', name: 'Sartorius · Arcana Force', series: 'GX', archetype: 'Arcana Force' },
  { file: 'gx-camula-vampires', name: 'Camula · Vampires', series: 'GX', archetype: 'Vampire' },
  { file: 'gx-blair-amazones', name: 'Blair · Amazones', series: 'GX', archetype: 'Amazoness' },
  { file: 'gx-hassleberry-jurrac', name: 'Hassleberry · Jurrac', series: 'GX', archetype: 'Jurrac' },
  { file: '5ds-jack-archidemons', name: 'Jack · Archidémons', series: "5D's", archetype: 'Archfiend', add: '3 Red Dragon Archfiend | 1 Scarlight Red Dragon Archfiend | 1 Red Dragon Archfiend', cover: 'Red Dragon Archfiend' },
  { file: '5ds-yusei-junk', name: 'Yusei · Ferraille', series: "5D's", archetype: 'Junk', cover: 'Junk Warrior' },
  { file: 'arcv-selena-lunalight', name: 'Selena · Lunalight', series: 'ARC-V', archetype: 'Lunalight' },
  { file: 'arcv-yuzu-melodieuses', name: 'Yuzu · Mélodieuses', series: 'ARC-V', archetype: 'Melodious' },
  { file: 'arcv-zarc-roi-supreme', name: 'Zarc · Roi Suprême', series: 'ARC-V', archetype: 'Supreme King', add: '2 Odd-Eyes Pendulum Dragon | 2 Supreme King Dragon Odd-Eyes', cover: 'Supreme King Z-ARC' },
  { file: 'arcv-sora-fluffal', name: 'Sora · Fluffal', series: 'ARC-V', archetype: 'Fluffal' },
  { file: 'arcv-dennis-performapal', name: 'Dennis · Performapal', series: 'ARC-V', archetype: 'Performapal' },
  { file: 'vrains-playmaker-code-talker', name: 'Playmaker · Code Talker', series: 'VRAINS', archetype: 'Code Talker', cover: 'Firewall Dragon' },
  { file: 'vrains-ghost-girl-ghostrick', name: 'Ghost Girl · Ghostrick', series: 'VRAINS', archetype: 'Ghostrick' },

  // ─────────────── Archétypes modernes et classiques ───────────────
  { file: 'm-snake-eye', name: 'Œil de Serpent', archetype: 'Snake-Eye', add: '3 Diabellstar the Black Witch | 3 Fire King Avatar Barong | 2 Fiendsmith Engraver', cover: 'Snake-Eyes Flamberge Dragon' },
  { file: 'm-fire-king', name: 'Rois du Feu (moderne)', archetype: 'Fire King' },
  { file: 'm-labrynth', name: 'Labrynth', archetype: 'Labrynth', cover: 'Lovely Labrynth of the Silver Castle' },
  { file: 'm-ryzeal', name: 'Ryzeal', archetype: 'Ryzeal' },
  { file: 'm-mannadium', name: 'Mannadium', archetype: 'Mannadium' },
  { file: 'm-tearlaments', name: 'Larmes (Tearlaments)', archetype: 'Tearlaments', cover: 'Tearlaments Kitkallos' },
  { file: 'm-kashtira', name: 'Kashtira', archetype: 'Kashtira', cover: 'Kashtira Fenrir' },
  { file: 'm-mekk-knight', name: 'Mekk-Knight', archetype: 'Mekk-Knight' },
  { file: 'm-spright', name: 'Spright', archetype: 'Spright' },
  { file: 'm-runick', name: 'Runick', archetype: 'Runick' },
  { file: 'm-virtual-world', name: 'Monde Virtuel', archetype: 'Virtual World' },
  { file: 'm-voiceless-voice', name: 'Voix Muette', archetype: 'Voiceless Voice', add: '2 Sauravis, Dragon Sage of the Voiceless Voice' },
  { file: 'm-melffy', name: 'Melffy', archetype: 'Melffy' },
  { file: 'm-purrely', name: 'Purrely', archetype: 'Purrely' },
  { file: 'm-dogmatika', name: 'Dogmatika', archetype: 'Dogmatika' },
  { file: 'm-lightsworn', name: 'Porteurs de Lumière', archetype: 'Lightsworn' },
  { file: 'm-zoodiac', name: 'Zoodiaque', archetype: 'Zoodiac' },
  { file: 'm-ice-barrier', name: 'Barrière de Glace', archetype: 'Ice Barrier' },
  { file: 'm-ritual-beast', name: 'Bête Rituelle', archetype: 'Ritual Beast' },
  { file: 'm-nekroz', name: 'Nekroz', archetype: 'Nekroz' },
  { file: 'm-burning-abyss', name: 'Abysse Brûlant', archetype: 'Burning Abyss' },
  { file: 'm-drytron', name: 'Drytron', archetype: 'Drytron' },
  { file: 'm-eldlich', name: 'Eldlich', archetype: 'Eldlich', add: '3 Golden Land Forever! | 3 Cursed Eldland | 2 Eldlixir of Black Awakening | 2 Eldlixir of White Destiny' },
  { file: 'm-exosister', name: 'Exosœur', archetype: 'Exosister' },
  { file: 'm-altergeist', name: 'Altergeist', archetype: 'Altergeist' },
  { file: 'm-orcust', name: 'Orcust', archetype: 'Orcust' },
  { file: 'm-floowandereeze', name: 'Floowandereeze', archetype: 'Floowandereeze' },
  { file: 'm-gladiator-beast', name: 'Bête Gladiateur', archetype: 'Gladiator Beast' },
  { file: 'm-shaddoll', name: 'Shaddoll', archetype: 'Shaddoll' },
  { file: 'm-subterror', name: 'Subterror', archetype: 'Subterror' },
  { file: 'm-mermail', name: 'Mermail', archetype: 'Mermail' },
  { file: 'm-kozmo', name: 'Kozmo', archetype: 'Kozmo' },
]
