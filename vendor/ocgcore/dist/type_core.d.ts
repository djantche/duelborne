/** The result of each call to {@link OcgCore#duelProcess}. */
export type OcgProcessResult = (typeof OcgProcessResult)[keyof typeof OcgProcessResult];
/** The result of each call to {@link OcgCore#duelProcess}. */
export declare const OcgProcessResult: {
    /**
     * Duel ended, you can't no longer call {@link OcgCore#duelProcess}.
     */
    readonly END: 0;
    /**
     * Waiting for a player action, provide a response with {@link OcgCore#duelSetResponse}
     * before calling {@link OcgCore#duelProcess} again.
     */
    readonly WAITING: 1;
    /**
     * Intermidate processing step, you should call {@link OcgCore#duelProcess} again.
     */
    readonly CONTINUE: 2;
};
/** Position (faceup or facedown and defense or attack) of a card. */
export type OcgPosition = (typeof OcgPosition)[keyof typeof OcgPosition];
/** Position (faceup or facedown and defense or attack) of a card. */
export declare const OcgPosition: {
    /** FACEUP_ATTACK */
    readonly FACEUP_ATTACK: 1;
    /** FACEDOWN_ATTACK */
    readonly FACEDOWN_ATTACK: 2;
    /** FACEUP_DEFENSE */
    readonly FACEUP_DEFENSE: 4;
    /** FACEDOWN_DEFENSE */
    readonly FACEDOWN_DEFENSE: 8;
    /** FACEUP_ATTACK | FACEUP_DEFENSE */
    readonly FACEUP: 5;
    /** FACEDOWN_ATTACK | FACEDOWN_DEFENSE */
    readonly FACEDOWN: 10;
    /** FACEUP_ATTACK | FACEDOWN_ATTACK */
    readonly ATTACK: 3;
    /** FACEUP_DEFENSE | FACEDOWN_DEFENSE */
    readonly DEFENSE: 12;
};
/**
 * Parse a position mask and returns the list of actual positions it matches.
 * @param positionMask - The mask to parse
 */
export declare function ocgPositionParse(positionMask: OcgPosition): Extract<OcgPosition, 0x1 | 0x2 | 0x4 | 0x8>[];
/** Location of a card. */
export type OcgLocation = (typeof OcgLocation)[keyof typeof OcgLocation];
/** Location of a card. */
export declare const OcgLocation: {
    /** Main deck. */
    readonly DECK: 1;
    /** Hand. */
    readonly HAND: 2;
    /** Monster zone. */
    readonly MZONE: 4;
    /** Spell/Trap zone. */
    readonly SZONE: 8;
    /** Graveyard. */
    readonly GRAVE: 16;
    /** Banished (removed from play). */
    readonly REMOVED: 32;
    /** Extra deck. */
    readonly EXTRA: 64;
    /** Xyz material. */
    readonly OVERLAY: 128;
    /** Field spell zone. */
    readonly FZONE: 256;
    /** Pendulum zone. */
    readonly PZONE: 512;
    /** Onfield mask. */
    readonly ONFIELD: 12;
    /** All possible locations mask. */
    readonly ALL: 1023;
};
/** Card type (monster/spell/trap and additional properties in case of a monster). */
export type OcgType = (typeof OcgType)[keyof typeof OcgType];
/** Card type (monster/spell/trap and additional properties in case of a monster). */
export declare const OcgType: {
    /** Monster. */
    readonly MONSTER: 1;
    /** Spell. */
    readonly SPELL: 2;
    /** Trap. */
    readonly TRAP: 4;
    /** Normal monster. */
    readonly NORMAL: 16;
    /** Effect monster. */
    readonly EFFECT: 32;
    /** Fusion monster. */
    readonly FUSION: 64;
    /** Ritual monster. */
    readonly RITUAL: 128;
    /** Trap monster trap. */
    readonly TRAPMONSTER: 256;
    /** Spirit monster. */
    readonly SPIRIT: 512;
    /** Union monster. */
    readonly UNION: 1024;
    /** Gemini monster. */
    readonly GEMINI: 2048;
    /** Tuner monster. */
    readonly TUNER: 4096;
    /** Synchro monster. */
    readonly SYNCHRO: 8192;
    /** Token monster. */
    readonly TOKEN: 16384;
    /** Maximum monster. */
    readonly MAXIMUM: 32768;
    /** Quickplay spell. */
    readonly QUICKPLAY: 65536;
    /** Continuous spell or trap. */
    readonly CONTINUOUS: 131072;
    /** Equip spell. */
    readonly EQUIP: 262144;
    /** Field spell. */
    readonly FIELD: 524288;
    /** Counter trap. */
    readonly COUNTER: 1048576;
    /** Flip monster. */
    readonly FLIP: 2097152;
    /** Toon monster. */
    readonly TOON: 4194304;
    /** Xyz monster. */
    readonly XYZ: 8388608;
    /** Pendulum monster. */
    readonly PENDULUM: 16777216;
    /** Special summonable monster. */
    readonly SPSUMMON: 33554432;
    /** Link monster. */
    readonly LINK: 67108864;
};
/**
 * Parse a OcgType mask and return the matching types.
 * @param type - The mask to parse.
 */
export declare function ocgTypeParse(type: OcgType): OcgType[];
/** Monster card attribute. */
export type OcgAttribute = (typeof OcgAttribute)[keyof typeof OcgAttribute];
/** Monster card attribute. */
export declare const OcgAttribute: {
    /** Earth. */
    readonly EARTH: 1;
    /** Water. */
    readonly WATER: 2;
    /** Fire. */
    readonly FIRE: 4;
    /** Wind. */
    readonly WIND: 8;
    /** Light. */
    readonly LIGHT: 16;
    /** Dark. */
    readonly DARK: 32;
    /** Divine. */
    readonly DIVINE: 64;
};
/**
 * Parse a {@link (OcgAttribute:type)} mask and return the matching attributes.
 * @param attribute - The mask to parse.
 */
export declare function ocgAttributeParse(attribute: OcgAttribute): OcgAttribute[];
/** Monster card race. */
export type OcgRace = (typeof OcgRace)[keyof typeof OcgRace];
/** Monster card race. */
export declare const OcgRace: {
    /** Warrior. */
    readonly WARRIOR: 0x1n;
    /** Spellcaster. */
    readonly SPELLCASTER: 0x2n;
    /** Fairy. */
    readonly FAIRY: 0x4n;
    /** Fiend. */
    readonly FIEND: 0x8n;
    /** Zombie. */
    readonly ZOMBIE: 0x10n;
    /** Machine. */
    readonly MACHINE: 0x20n;
    /** Aqua. */
    readonly AQUA: 0x40n;
    /** Pyro. */
    readonly PYRO: 0x80n;
    /** Rock. */
    readonly ROCK: 0x100n;
    /** Winged beast. */
    readonly WINGEDBEAST: 0x200n;
    /** Plant. */
    readonly PLANT: 0x400n;
    /** Insect. */
    readonly INSECT: 0x800n;
    /** Thunder. */
    readonly THUNDER: 0x1000n;
    /** Dragon. */
    readonly DRAGON: 0x2000n;
    /** Beast. */
    readonly BEAST: 0x4000n;
    /** Beast-warrior. */
    readonly BEASTWARRIOR: 0x8000n;
    /** Dinosaur. */
    readonly DINOSAUR: 0x10000n;
    /** Fish. */
    readonly FISH: 0x20000n;
    /** Seaserpent. */
    readonly SEASERPENT: 0x40000n;
    /** Reptile. */
    readonly REPTILE: 0x80000n;
    /** Psychic. */
    readonly PSYCHIC: 0x100000n;
    /** Divine. */
    readonly DIVINE: 0x200000n;
    /** Creator god. */
    readonly CREATORGOD: 0x400000n;
    /** Wyrm. */
    readonly WYRM: 0x800000n;
    /** Cyberse. */
    readonly CYBERSE: 0x1000000n;
    /** Illusion. */
    readonly ILLUSION: 0x2000000n;
    /** Cyborg. */
    readonly CYBORG: 0x4000000n;
    /** Magical knight. */
    readonly MAGICALKNIGHT: 0x8000000n;
    /** High dragon. */
    readonly HIGHDRAGON: 0x10000000n;
    /** Omega psychic. */
    readonly OMEGAPSYCHIC: 0x20000000n;
    /** Celestial warrior. */
    readonly CELESTIALWARRIOR: 0x40000000n;
    /** Galaxy. */
    readonly GALAXY: 0x80000000n;
};
/**
 * Parse a {@link (OcgRace:type)} mask and return the matching races.
 * @param race - The mask to parse.
 */
export declare function ocgRaceParse(race: OcgRace): OcgRace[];
/** Link monster markers positions. */
export type OcgLinkMarker = number;
/** Link monster markers positions. */
export declare const OcgLinkMarker: {
    BOTTOM_LEFT: number;
    BOTTOM: number;
    BOTTOM_RIGHT: number;
    LEFT: number;
    RIGHT: number;
    TOP_LEFT: number;
    TOP: number;
    TOP_RIGHT: number;
};
/**
 * Parse a {@link (OcgLinkMarker:type)} mask and return the matching markers.
 * @param marker - The mask to parse.
 */
export declare function ocgLinkMarkerParse(marker: OcgLinkMarker): OcgLinkMarker[];
/** Rock paper scissor. */
export type OcgRPS = number;
/** Rock paper scissor. */
export declare const OcgRPS: {
    /** Scissors. */
    SCISSORS: number;
    /** Rock. */
    ROCK: number;
    /** Paper. */
    PAPER: number;
};
/** Duel creation options. */
export type OcgDuelMode = (typeof OcgDuelMode)[Exclude<keyof typeof OcgDuelMode, `MODE_${string}`>];
/** Duel creation options. */
export declare const OcgDuelMode: {
    /** @deprecated Unused. */
    readonly TEST_MODE: 0x01n;
    /** Allow battle phase in the first turn. */
    readonly ATTACK_FIRST_TURN: 0x02n;
    /** Continuous traps effects cannot be activated until the end of the chain they're flipped in. */
    readonly USE_TRAPS_IN_NEW_CHAIN: 0x04n;
    /** After damage calculation substep actually separated sub steps. */
    readonly SIX_STEP_BATLLE_STEP: 0x08n;
    /** Disable decks shuffling. */
    readonly PSEUDO_SHUFFLE: 0x10n;
    /** Searching the deck doesn't require knowledge checking. */
    readonly TRIGGER_WHEN_PRIVATE_KNOWLEDGE: 0x20n;
    /** Automate some responses with a simple AI. */
    readonly SIMPLE_AI: 0x40n;
    /** Is tag duel. */
    readonly RELAY: 0x80n;
    /** Master Rule 1 obsolete ignition effects. */
    readonly OBSOLETE_IGNITION: 0x100n;
    /** Draw on the first turn. */
    readonly FIRST_TURN_DRAW: 0x200n;
    /** Only allow a single face-up field spell. */
    readonly ONE_FACEUP_FIELD: 0x400n;
    /** Enable pendulum zones. */
    readonly PZONE: 0x800n;
    /** Pendulum zones are separated from S/T zones. */
    readonly SEPARATE_PZONE: 0x1000n;
    /** Enable extra monster zone. */
    readonly EMZONE: 0x2000n;
    /** Fusion, synchro and xyz from the extra deck can go into the main monster zones. */
    readonly FSX_MMZONE: 0x4000n;
    /** Trap monsters do not take a spell/trap zone aswell as a main monster zone. */
    readonly TRAP_MONSTERS_NOT_USE_ZONE: 0x8000n;
    /** Return to main deck or extra deck do not trigger "leaving the field" effects. */
    readonly RETURN_TO_DECK_TRIGGERS: 0x10000n;
    /** Trigger effect cannot be activated if the card is moved to other place. */
    readonly TRIGGER_ONLY_IN_LOCATION: 0x20000n;
    /** Negated summons and special summons count towards any limit. */
    readonly SPSUMMON_ONCE_OLD_NEGATE: 0x40000n;
    /** Negated summons and special summons count towards any limit. */
    readonly CANNOT_SUMMON_OATH_OLD: 0x80000n;
    /** Disable standby phase (rush duels). */
    readonly NO_STANDBY_PHASE: 0x100000n;
    /** Disable main phase 2 (rush and speed duels). */
    readonly NO_MAIN_PHASE_2: 0x200000n;
    /** Only 3 main monster zones and spell/trap zones (rush and speed duels). */
    readonly THREE_COLUMNS_FIELD: 0x400000n;
    /** In draw phase draw until 5 cards in hand (rush duels). */
    readonly DRAW_UNTIL_5: 0x800000n;
    /** Disable hand limit checks. */
    readonly NO_HAND_LIMIT: 0x1000000n;
    /** Remove limit of 1 normal summon per turn (rush duels). */
    readonly UNLIMITED_SUMMONS: 0x2000000n;
    /** Inverted quick effects priority (rush duels). */
    readonly INVERTED_QUICK_PRIORITY: 0x4000000n;
    /** The to be equipped monster is not sent to the grave if the equip target is no longer valid (goat duels). */
    readonly EQUIP_NOT_SENT_IF_MISSING_TARGET: 0x8000000n;
    /** If a 0 atk monster attacks a 0 atk monster, both get destroyed (goat duels). */
    readonly ZERO_ATK_DESTROYED: 0x10000000n;
    /** Attack replays can be used later (goat duels). */
    readonly STORE_ATTACK_REPLAYS: 0x20000000n;
    /** One chain per damage sub step (goat duels). */
    readonly SINGLE_CHAIN_IN_DAMAGE_SUBSTEP: 0x40000000n;
    /** Cards can be repositioned if the control changed (goat duels). */
    readonly CAN_REPOS_IF_NON_SUMPLAYER: 0x80000000n;
    /** TCG Simultaneous Effects Go On Chain for non public knowledge. */
    readonly TCG_SEGOC_NONPUBLIC: 0x100000000n;
    /** TCG Simultaneous Effects Go On Chain. */
    readonly TCG_SEGOC_FIRSTTRIGGER: 0x200000000n;
    /** Master Rule 1 ruleset. */
    readonly MODE_MR1: bigint;
    /** Speed duel ruleset. */
    readonly MODE_SPEED: bigint;
    /** Rush duel ruleset. */
    readonly MODE_RUSH: bigint;
    /** Goat ruleset. */
    readonly MODE_GOAT: bigint;
    /** Master Rule 2 ruleset */
    readonly MODE_MR2: bigint;
    /** Master Rule 3 ruleset */
    readonly MODE_MR3: bigint;
    /** New Master Rule ruleset */
    readonly MODE_MR4: bigint;
    /** New Master Rule (April 2020) ruleset */
    readonly MODE_MR5: bigint;
};
/**
 * Parse a {@link (OcgDuelMode:type)} mask and return the matching options.
 * @param mode - The mask to parse.
 */
export declare function ocgDuelModeParse(mode: OcgDuelMode): OcgDuelMode[];
/** Log type. */
export type OcgLogType = (typeof OcgLogType)[keyof typeof OcgLogType];
/** Log type. */
export declare const OcgLogType: {
    /** Error. */
    readonly ERROR: 0;
    /** From script. */
    readonly FROM_SCRIPT: 1;
    /** Debug. */
    readonly FOR_DEBUG: 2;
    /** Undefined. */
    readonly UNDEFINED: 3;
};
/** Requested card properties, used when querying. */
export type OcgQueryFlags = (typeof OcgQueryFlags)[keyof typeof OcgQueryFlags];
/** Requested card properties, used when querying. */
export declare const OcgQueryFlags: {
    /** Code. */
    readonly CODE: 1;
    /** Position. */
    readonly POSITION: 2;
    /** Aliases. */
    readonly ALIAS: 4;
    /** Type. */
    readonly TYPE: 8;
    /** Level. */
    readonly LEVEL: 16;
    /** Rank. */
    readonly RANK: 32;
    /** Attribute. */
    readonly ATTRIBUTE: 64;
    /** Race. */
    readonly RACE: 128;
    /** Attack. */
    readonly ATTACK: 256;
    /** Defense. */
    readonly DEFENSE: 512;
    /** Base attack. */
    readonly BASE_ATTACK: 1024;
    /** Base defense. */
    readonly BASE_DEFENSE: 2048;
    /** Reason. */
    readonly REASON: 4096;
    /** Reason card. */
    readonly REASON_CARD: 8192;
    /** Equipped to card. */
    readonly EQUIP_CARD: 16384;
    /** Targeted card. */
    readonly TARGET_CARD: 32768;
    /** Overlayed card. */
    readonly OVERLAY_CARD: 65536;
    /** Counters. */
    readonly COUNTERS: 131072;
    /** Owner. */
    readonly OWNER: 262144;
    /** Status. */
    readonly STATUS: 524288;
    /** Is public knowledge. */
    readonly IS_PUBLIC: 1048576;
    /** Left pendulum scale. */
    readonly LSCALE: 2097152;
    /** Right pendulum scale. */
    readonly RSCALE: 4194304;
    /** Link arrows. */
    readonly LINK: 8388608;
    /** Is hidden. */
    readonly IS_HIDDEN: 16777216;
    /** Cover. */
    readonly COVER: 33554432;
};
/** Legality scope of a card. */
export type OcgScope = (typeof OcgScope)[keyof typeof OcgScope];
/** Legality scope of a card. */
export declare const OcgScope: {
    /** OCG legal. */
    readonly OCG: 1;
    /** TCG legal.*/
    readonly TCG: 2;
    /** Anime card.*/
    readonly ANIME: 4;
    /** Cannot be used in a duel.*/
    readonly ILLEGAL: 8;
    /** Video game card.*/
    readonly VIDEO_GAME: 16;
    /** Custom card.*/
    readonly CUSTOM: 32;
    /** Speed duel card.*/
    readonly SPEED: 64;
    /** Prerelease.*/
    readonly PRERELEASE: 256;
    /** Rush duel card.*/
    readonly RUSH: 512;
    /** Rush duel legend card.*/
    readonly LEGEND: 1024;
    /** Hidden.*/
    readonly HIDDEN: 4096;
};
/** Turn phase. */
export type OcgPhase = (typeof OcgPhase)[keyof typeof OcgPhase];
/** Turn phase. */
export declare const OcgPhase: {
    /** Draw phase. */
    readonly DRAW: 1;
    /** Stand-by phase. */
    readonly STANDBY: 2;
    /** Main phase 1. */
    readonly MAIN1: 4;
    /** Battle phase: start step */
    readonly BATTLE_START: 8;
    /** Battle phase: battle step */
    readonly BATTLE_STEP: 16;
    /** Battle phase: damage step */
    readonly DAMAGE: 32;
    /** Battle phase: damage calculation */
    readonly DAMAGE_CAL: 64;
    /** Battle phase: end step */
    readonly BATTLE: 128;
    /** Main phase 2. */
    readonly MAIN2: 256;
    /** End phase. */
    readonly END: 512;
};
/** Hint type. */
export type OcgHintType = (typeof OcgHintType)[keyof typeof OcgHintType];
/** Hint type. */
export declare const OcgHintType: {
    /** Event. */
    readonly EVENT: 1;
    /** Message. */
    readonly MESSAGE: 2;
    /** Select message. */
    readonly SELECTMSG: 3;
    /** Operation selected. */
    readonly OPSELECTED: 4;
    /** Effect. */
    readonly EFFECT: 5;
    /** Race. */
    readonly RACE: 6;
    /** Attribute. */
    readonly ATTRIB: 7;
    /** Card code. */
    readonly CODE: 8;
    /** Number. */
    readonly NUMBER: 9;
    /** Card. */
    readonly CARD: 10;
    /** Zone. */
    readonly ZONE: 11;
};
/** Timing hints */
export type OcgHintTiming = (typeof OcgHintTiming)[keyof typeof OcgHintTiming];
/** Timing hints */
export declare const OcgHintTiming: {
    /** In draw phase */
    readonly DRAW_PHASE: 1;
    /** In standby phase */
    readonly STANDBY_PHASE: 2;
    /** Before end of main */
    readonly MAIN_END: 4;
    /** In battle phase */
    readonly BATTLE_START: 8;
    /** After battle */
    readonly BATTLE_END: 16;
    /** In end phase */
    readonly END_PHASE: 32;
    /** After summon */
    readonly SUMMON: 64;
    /** After special summon */
    readonly SPSUMMON: 128;
    /** After flip summon */
    readonly FLIPSUMMON: 256;
    /** After monster set */
    readonly MSET: 512;
    /** After spell set */
    readonly SSET: 1024;
    /** After pos change */
    readonly POS_CHANGE: 2048;
    /** In attack declaration */
    readonly ATTACK: 4096;
    /** In damage step */
    readonly DAMAGE_STEP: 8192;
    /** In damage calculation */
    readonly DAMAGE_CAL: 16384;
    /** After chain resolved */
    readonly CHAIN_END: 32768;
    /** After card draw */
    readonly DRAW: 65536;
    /** After damage */
    readonly DAMAGE: 131072;
    /** After recover */
    readonly RECOVER: 262144;
    /** After destroy */
    readonly DESTROY: 524288;
    /** After banis */
    readonly REMOVE: 1048576;
    /** After card added to the hand */
    readonly TOHAND: 2097152;
    /** After card sent to the deck */
    readonly TODECK: 4194304;
    /** After card sent to the graveyard */
    readonly TOGRAVE: 8388608;
    /** Battle phase */
    readonly BATTLE_PHASE: 16777216;
    /** After equip */
    readonly EQUIP: 33554432;
    /** Battle step end */
    readonly BATTLE_STEP_END: 67108864;
    /** Battled */
    readonly BATTLED: 134217728;
};
/**
 * Parse a {@link (OcgHintTiming:type)} mask and return the matching timings.
 * @param timing - The mask to parse.
 */
export declare function ocgHintTimingParse(timing: OcgHintTiming): OcgHintTiming[];
