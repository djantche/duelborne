//#region vendor/ocgcore/src/data.ts
function writeCardData(view, data) {
	view.setUint32(0, data.code ?? 0, true);
	view.setUint32(4, data.alias ?? 0, true);
	if (data.ptrSize === 4) {
		view.setUint32(8, data.setcodes ?? 0, true);
		view.setUint32(12, data.type ?? 0, true);
		view.setUint32(16, data.level ?? 0, true);
		view.setUint32(20, data.attribute ?? 0, true);
		view.setBigUint64(24, data.race ?? 0n, true);
		view.setInt32(32, data.attack ?? 0, true);
		view.setInt32(36, data.defense ?? 0, true);
		view.setUint32(40, data.lscale ?? 0, true);
		view.setUint32(44, data.rscale ?? 0, true);
		view.setUint32(48, data.link_marker ?? 0, true);
	} else {
		view.setBigUint64(8, data.setcodes ?? 0n, true);
		view.setUint32(16, data.type ?? 0, true);
		view.setUint32(20, data.level ?? 0, true);
		view.setUint32(24, data.attribute ?? 0, true);
		view.setBigUint64(32, data.race ?? 0n, true);
		view.setInt32(36, data.attack ?? 0, true);
		view.setInt32(40, data.defense ?? 0, true);
		view.setUint32(44, data.lscale ?? 0, true);
		view.setUint32(48, data.rscale ?? 0, true);
		view.setUint32(52, data.link_marker ?? 0, true);
	}
}
function writeDuelOptions(view, options) {
	view.setBigUint64(0, options.seed[0], true);
	view.setBigUint64(8, options.seed[1], true);
	view.setBigUint64(16, options.seed[2], true);
	view.setBigUint64(24, options.seed[3], true);
	view.setBigUint64(32, options.flags, true);
	view.setUint32(40, options.team1.startingLP, true);
	view.setUint32(44, options.team1.startingDrawCount, true);
	view.setUint32(48, options.team1.drawCountPerTurn, true);
	view.setUint32(52, options.team2.startingLP, true);
	view.setUint32(56, options.team2.startingDrawCount, true);
	view.setUint32(60, options.team2.drawCountPerTurn, true);
	if (options.ptrSize === 4) {
		view.setUint32(64, options.cardReader, true);
		view.setUint32(68, options.cardReaderPayload, true);
		view.setUint32(72, options.scriptReader, true);
		view.setUint32(76, options.scriptReaderPayload, true);
		view.setUint32(80, options.errorHandler, true);
		view.setUint32(84, options.errorHandlerPayload, true);
		view.setUint32(88, options.cardReaderDone, true);
		view.setUint32(92, options.cardReaderDonePayload, true);
		view.setUint8(96, options.enableUnsafeLibraries ? 1 : 0);
	} else {
		view.setBigUint64(64, options.cardReader, true);
		view.setBigUint64(72, options.cardReaderPayload, true);
		view.setBigUint64(80, options.scriptReader, true);
		view.setBigUint64(88, options.scriptReaderPayload, true);
		view.setBigUint64(96, options.errorHandler, true);
		view.setBigUint64(104, options.errorHandlerPayload, true);
		view.setBigUint64(112, options.cardReaderDone, true);
		view.setBigUint64(120, options.cardReaderDonePayload, true);
		view.setUint8(128, options.enableUnsafeLibraries ? 1 : 0);
	}
}
function writeNewCardInfo(view, data) {
	view.setUint8(0, data.team);
	view.setUint8(1, data.duelist);
	view.setUint32(4, data.code, true);
	view.setUint8(8, data.controller);
	view.setUint32(12, data.location, true);
	view.setUint32(16, data.sequence, true);
	view.setUint32(20, data.position, true);
}
//#endregion
//#region vendor/ocgcore/src/internal/buffer.ts
var BufferReader = class BufferReader {
	view;
	off;
	static from(b) {
		return new BufferReader(new DataView(b, 0, b.byteLength));
	}
	constructor(view, off) {
		this.view = view;
		this.off = off ?? 0;
	}
	get avail() {
		return this.view.byteLength - this.off;
	}
	reset() {
		this.off = 0;
	}
	sub(length) {
		if (this.avail < length) throw new Error("eof");
		const b = new BufferReader(new DataView(this.view.buffer, this.view.byteOffset + this.off, length), 0);
		this.off += length;
		return b;
	}
	bytes(length) {
		if (this.avail < length) throw new Error("eof");
		const bytes = this.view.buffer.slice(this.view.byteOffset + this.off, this.view.byteOffset + this.off + length);
		this.off += length;
		return new Uint8Array(bytes);
	}
	u8() {
		if (this.avail < 1) throw new Error("eof");
		const value = this.view.getUint8(this.off);
		this.off += 1;
		return value;
	}
	i8() {
		if (this.avail < 1) throw new Error("eof");
		const value = this.view.getInt8(this.off);
		this.off += 1;
		return value;
	}
	u16() {
		if (this.avail < 2) throw new Error("eof");
		const value = this.view.getUint16(this.off, true);
		this.off += 2;
		return value;
	}
	i16() {
		if (this.avail < 2) throw new Error("eof");
		const value = this.view.getInt16(this.off, true);
		this.off += 2;
		return value;
	}
	u32() {
		if (this.avail < 4) throw new Error("eof");
		const value = this.view.getUint32(this.off, true);
		this.off += 4;
		return value;
	}
	i32() {
		if (this.avail < 4) throw new Error("eof");
		const value = this.view.getInt32(this.off, true);
		this.off += 4;
		return value;
	}
	u64() {
		if (this.avail < 8) throw new Error("eof");
		const value = this.view.getBigUint64(this.off, true);
		this.off += 8;
		return value;
	}
	i64() {
		if (this.avail < 8) throw new Error("eof");
		const value = this.view.getBigInt64(this.off, true);
		this.off += 8;
		return value;
	}
};
var BufferWriter = class {
	buffer;
	view;
	off;
	aligned;
	constructor(length = 64, aligned = false) {
		this.buffer = new Uint8Array(length);
		this.view = new DataView(this.buffer.buffer);
		this.off = 0;
		this.aligned = aligned;
	}
	get(alignment = 0) {
		if (alignment > 0) this.align(alignment);
		return this.buffer.slice(0, this.off);
	}
	align(size) {
		const amount = (size - this.off % size) % size;
		this.grow(amount);
		this.off += amount;
	}
	grow(toAdd) {
		if (this.off + toAdd <= this.buffer.byteLength) return;
		const newBuffer = new Uint8Array(this.buffer.byteLength * 2);
		newBuffer.set(this.buffer, 0);
		this.buffer = newBuffer;
		this.view = new DataView(this.buffer.buffer);
	}
	bytes(bytes) {
		if (bytes instanceof ArrayBuffer) {
			this.grow(bytes.byteLength);
			this.buffer.set(new Uint8Array(bytes), this.off);
			this.off += bytes.byteLength;
		} else {
			this.grow(bytes.length);
			this.buffer.set(bytes, this.off);
			this.off += bytes.length;
		}
	}
	u8(value) {
		this.grow(1);
		this.view.setUint8(this.off, value);
		this.off += 1;
		return this;
	}
	i8(value) {
		this.grow(1);
		this.view.setInt8(this.off, value);
		this.off += 1;
		return this;
	}
	u16(value) {
		if (this.aligned) this.align(2);
		this.grow(2);
		this.view.setUint16(this.off, value, true);
		this.off += 2;
		return this;
	}
	i16(value) {
		if (this.aligned) this.align(2);
		this.grow(2);
		this.view.setInt16(this.off, value, true);
		this.off += 2;
		return this;
	}
	u32(value) {
		if (this.aligned) this.align(4);
		this.grow(4);
		this.view.setUint32(this.off, value, true);
		this.off += 4;
		return this;
	}
	i32(value) {
		if (this.aligned) this.align(4);
		this.grow(4);
		this.view.setInt32(this.off, value, true);
		this.off += 4;
		return this;
	}
	u64(value) {
		if (this.aligned) this.align(8);
		this.grow(8);
		this.view.setBigUint64(this.off, value, true);
		this.off += 8;
		return this;
	}
	i64(value) {
		if (this.aligned) this.align(8);
		this.grow(8);
		this.view.setBigInt64(this.off, value, true);
		this.off += 8;
		return this;
	}
};
//#endregion
//#region vendor/ocgcore/src/type_core.ts
/** The result of each call to {@link OcgCore#duelProcess}. */
const OcgProcessResult = {
	/**
	* Duel ended, you can't no longer call {@link OcgCore#duelProcess}.
	*/
	END: 0,
	/**
	* Waiting for a player action, provide a response with {@link OcgCore#duelSetResponse}
	* before calling {@link OcgCore#duelProcess} again.
	*/
	WAITING: 1,
	/**
	* Intermidate processing step, you should call {@link OcgCore#duelProcess} again.
	*/
	CONTINUE: 2
};
/** Position (faceup or facedown and defense or attack) of a card. */
const OcgPosition = {
	/** FACEUP_ATTACK */
	FACEUP_ATTACK: 1,
	/** FACEDOWN_ATTACK */
	FACEDOWN_ATTACK: 2,
	/** FACEUP_DEFENSE */
	FACEUP_DEFENSE: 4,
	/** FACEDOWN_DEFENSE */
	FACEDOWN_DEFENSE: 8,
	/** FACEUP_ATTACK | FACEUP_DEFENSE */
	FACEUP: 5,
	/** FACEDOWN_ATTACK | FACEDOWN_DEFENSE */
	FACEDOWN: 10,
	/** FACEUP_ATTACK | FACEDOWN_ATTACK */
	ATTACK: 3,
	/** FACEUP_DEFENSE | FACEDOWN_DEFENSE */
	DEFENSE: 12
};
const ocgPositionMapElements = [
	OcgPosition.FACEUP_ATTACK,
	OcgPosition.FACEDOWN_ATTACK,
	OcgPosition.FACEUP_DEFENSE,
	OcgPosition.FACEDOWN_DEFENSE
];
/**
* Parse a position mask and returns the list of actual positions it matches.
* @param positionMask - The mask to parse
*/
function ocgPositionParse(positionMask) {
	return ocgPositionMapElements.filter((x) => positionMask & x);
}
/** Location of a card. */
const OcgLocation = {
	/** Main deck. */
	DECK: 1,
	/** Hand. */
	HAND: 2,
	/** Monster zone. */
	MZONE: 4,
	/** Spell/Trap zone. */
	SZONE: 8,
	/** Graveyard. */
	GRAVE: 16,
	/** Banished (removed from play). */
	REMOVED: 32,
	/** Extra deck. */
	EXTRA: 64,
	/** Xyz material. */
	OVERLAY: 128,
	/** Field spell zone. */
	FZONE: 256,
	/** Pendulum zone. */
	PZONE: 512,
	/** Onfield mask. */
	ONFIELD: 12,
	/** All possible locations mask. */
	ALL: 1023
};
/** Card type (monster/spell/trap and additional properties in case of a monster). */
const OcgType = {
	/** Monster. */
	MONSTER: 1,
	/** Spell. */
	SPELL: 2,
	/** Trap. */
	TRAP: 4,
	/** Normal monster. */
	NORMAL: 16,
	/** Effect monster. */
	EFFECT: 32,
	/** Fusion monster. */
	FUSION: 64,
	/** Ritual monster. */
	RITUAL: 128,
	/** Trap monster trap. */
	TRAPMONSTER: 256,
	/** Spirit monster. */
	SPIRIT: 512,
	/** Union monster. */
	UNION: 1024,
	/** Gemini monster. */
	GEMINI: 2048,
	/** Tuner monster. */
	TUNER: 4096,
	/** Synchro monster. */
	SYNCHRO: 8192,
	/** Token monster. */
	TOKEN: 16384,
	/** Maximum monster. */
	MAXIMUM: 32768,
	/** Quickplay spell. */
	QUICKPLAY: 65536,
	/** Continuous spell or trap. */
	CONTINUOUS: 131072,
	/** Equip spell. */
	EQUIP: 262144,
	/** Field spell. */
	FIELD: 524288,
	/** Counter trap. */
	COUNTER: 1048576,
	/** Flip monster. */
	FLIP: 2097152,
	/** Toon monster. */
	TOON: 4194304,
	/** Xyz monster. */
	XYZ: 8388608,
	/** Pendulum monster. */
	PENDULUM: 16777216,
	/** Special summonable monster. */
	SPSUMMON: 33554432,
	/** Link monster. */
	LINK: 67108864
};
const ocgTypeMapElements = Object.values(OcgType);
/**
* Parse a OcgType mask and return the matching types.
* @param type - The mask to parse.
*/
function ocgTypeParse(type) {
	return ocgTypeMapElements.filter((x) => type & x);
}
/** Monster card attribute. */
const OcgAttribute = {
	/** Earth. */
	EARTH: 1,
	/** Water. */
	WATER: 2,
	/** Fire. */
	FIRE: 4,
	/** Wind. */
	WIND: 8,
	/** Light. */
	LIGHT: 16,
	/** Dark. */
	DARK: 32,
	/** Divine. */
	DIVINE: 64
};
const ocgAttributeMapElements = Object.values(OcgAttribute);
/**
* Parse a {@link (OcgAttribute:type)} mask and return the matching attributes.
* @param attribute - The mask to parse.
*/
function ocgAttributeParse(attribute) {
	return ocgAttributeMapElements.filter((x) => attribute & x);
}
/** Monster card race. */
const OcgRace = {
	/** Warrior. */
	WARRIOR: 1n,
	/** Spellcaster. */
	SPELLCASTER: 2n,
	/** Fairy. */
	FAIRY: 4n,
	/** Fiend. */
	FIEND: 8n,
	/** Zombie. */
	ZOMBIE: 16n,
	/** Machine. */
	MACHINE: 32n,
	/** Aqua. */
	AQUA: 64n,
	/** Pyro. */
	PYRO: 128n,
	/** Rock. */
	ROCK: 256n,
	/** Winged beast. */
	WINGEDBEAST: 512n,
	/** Plant. */
	PLANT: 1024n,
	/** Insect. */
	INSECT: 2048n,
	/** Thunder. */
	THUNDER: 4096n,
	/** Dragon. */
	DRAGON: 8192n,
	/** Beast. */
	BEAST: 16384n,
	/** Beast-warrior. */
	BEASTWARRIOR: 32768n,
	/** Dinosaur. */
	DINOSAUR: 65536n,
	/** Fish. */
	FISH: 131072n,
	/** Seaserpent. */
	SEASERPENT: 262144n,
	/** Reptile. */
	REPTILE: 524288n,
	/** Psychic. */
	PSYCHIC: 1048576n,
	/** Divine. */
	DIVINE: 2097152n,
	/** Creator god. */
	CREATORGOD: 4194304n,
	/** Wyrm. */
	WYRM: 8388608n,
	/** Cyberse. */
	CYBERSE: 16777216n,
	/** Illusion. */
	ILLUSION: 33554432n,
	/** Cyborg. */
	CYBORG: 67108864n,
	/** Magical knight. */
	MAGICALKNIGHT: 134217728n,
	/** High dragon. */
	HIGHDRAGON: 268435456n,
	/** Omega psychic. */
	OMEGAPSYCHIC: 536870912n,
	/** Celestial warrior. */
	CELESTIALWARRIOR: 1073741824n,
	/** Galaxy. */
	GALAXY: 2147483648n
};
const ocgRaceMapElements = Object.values(OcgRace);
/**
* Parse a {@link (OcgRace:type)} mask and return the matching races.
* @param race - The mask to parse.
*/
function ocgRaceParse(race) {
	return ocgRaceMapElements.filter((x) => race & x);
}
/** Link monster markers positions. */
const OcgLinkMarker = {
	BOTTOM_LEFT: 1,
	BOTTOM: 2,
	BOTTOM_RIGHT: 4,
	LEFT: 8,
	RIGHT: 32,
	TOP_LEFT: 64,
	TOP: 128,
	TOP_RIGHT: 256
};
const ocgLinkMarkerMapElements = Object.values(OcgLinkMarker);
/**
* Parse a {@link (OcgLinkMarker:type)} mask and return the matching markers.
* @param marker - The mask to parse.
*/
function ocgLinkMarkerParse(marker) {
	return ocgLinkMarkerMapElements.filter((x) => marker & x);
}
/** Rock paper scissor. */
const OcgRPS = {
	/** Scissors. */
	SCISSORS: 1,
	/** Rock. */
	ROCK: 2,
	/** Paper. */
	PAPER: 3
};
const duelModeBase = {
	/** @deprecated Unused. */
	TEST_MODE: 1n,
	/** Allow battle phase in the first turn. */
	ATTACK_FIRST_TURN: 2n,
	/** Continuous traps effects cannot be activated until the end of the chain they're flipped in. */
	USE_TRAPS_IN_NEW_CHAIN: 4n,
	/** After damage calculation substep actually separated sub steps. */
	SIX_STEP_BATLLE_STEP: 8n,
	/** Disable decks shuffling. */
	PSEUDO_SHUFFLE: 16n,
	/** Searching the deck doesn't require knowledge checking. */
	TRIGGER_WHEN_PRIVATE_KNOWLEDGE: 32n,
	/** Automate some responses with a simple AI. */
	SIMPLE_AI: 64n,
	/** Is tag duel. */
	RELAY: 128n,
	/** Master Rule 1 obsolete ignition effects. */
	OBSOLETE_IGNITION: 256n,
	/** Draw on the first turn. */
	FIRST_TURN_DRAW: 512n,
	/** Only allow a single face-up field spell. */
	ONE_FACEUP_FIELD: 1024n,
	/** Enable pendulum zones. */
	PZONE: 2048n,
	/** Pendulum zones are separated from S/T zones. */
	SEPARATE_PZONE: 4096n,
	/** Enable extra monster zone. */
	EMZONE: 8192n,
	/** Fusion, synchro and xyz from the extra deck can go into the main monster zones. */
	FSX_MMZONE: 16384n,
	/** Trap monsters do not take a spell/trap zone aswell as a main monster zone. */
	TRAP_MONSTERS_NOT_USE_ZONE: 32768n,
	/** Return to main deck or extra deck do not trigger "leaving the field" effects. */
	RETURN_TO_DECK_TRIGGERS: 65536n,
	/** Trigger effect cannot be activated if the card is moved to other place. */
	TRIGGER_ONLY_IN_LOCATION: 131072n,
	/** Negated summons and special summons count towards any limit. */
	SPSUMMON_ONCE_OLD_NEGATE: 262144n,
	/** Negated summons and special summons count towards any limit. */
	CANNOT_SUMMON_OATH_OLD: 524288n,
	/** Disable standby phase (rush duels). */
	NO_STANDBY_PHASE: 1048576n,
	/** Disable main phase 2 (rush and speed duels). */
	NO_MAIN_PHASE_2: 2097152n,
	/** Only 3 main monster zones and spell/trap zones (rush and speed duels). */
	THREE_COLUMNS_FIELD: 4194304n,
	/** In draw phase draw until 5 cards in hand (rush duels). */
	DRAW_UNTIL_5: 8388608n,
	/** Disable hand limit checks. */
	NO_HAND_LIMIT: 16777216n,
	/** Remove limit of 1 normal summon per turn (rush duels). */
	UNLIMITED_SUMMONS: 33554432n,
	/** Inverted quick effects priority (rush duels). */
	INVERTED_QUICK_PRIORITY: 67108864n,
	/** The to be equipped monster is not sent to the grave if the equip target is no longer valid (goat duels). */
	EQUIP_NOT_SENT_IF_MISSING_TARGET: 134217728n,
	/** If a 0 atk monster attacks a 0 atk monster, both get destroyed (goat duels). */
	ZERO_ATK_DESTROYED: 268435456n,
	/** Attack replays can be used later (goat duels). */
	STORE_ATTACK_REPLAYS: 536870912n,
	/** One chain per damage sub step (goat duels). */
	SINGLE_CHAIN_IN_DAMAGE_SUBSTEP: 1073741824n,
	/** Cards can be repositioned if the control changed (goat duels). */
	CAN_REPOS_IF_NON_SUMPLAYER: 2147483648n,
	/** TCG Simultaneous Effects Go On Chain for non public knowledge. */
	TCG_SEGOC_NONPUBLIC: 4294967296n,
	/** TCG Simultaneous Effects Go On Chain. */
	TCG_SEGOC_FIRSTTRIGGER: 8589934592n
};
const duelModeBase1 = {
	...duelModeBase,
	/** Master Rule 1 ruleset. */
	MODE_MR1: duelModeBase.OBSOLETE_IGNITION | duelModeBase.FIRST_TURN_DRAW | duelModeBase.ONE_FACEUP_FIELD | duelModeBase.SPSUMMON_ONCE_OLD_NEGATE | duelModeBase.RETURN_TO_DECK_TRIGGERS | duelModeBase.CANNOT_SUMMON_OATH_OLD
};
/** Duel creation options. */
const OcgDuelMode = {
	...duelModeBase1,
	/** Speed duel ruleset. */
	MODE_SPEED: duelModeBase.THREE_COLUMNS_FIELD | duelModeBase.NO_MAIN_PHASE_2 | duelModeBase.TRIGGER_ONLY_IN_LOCATION,
	/** Rush duel ruleset. */
	MODE_RUSH: duelModeBase.THREE_COLUMNS_FIELD | duelModeBase.NO_MAIN_PHASE_2 | duelModeBase.NO_STANDBY_PHASE | duelModeBase.FIRST_TURN_DRAW | duelModeBase.INVERTED_QUICK_PRIORITY | duelModeBase.DRAW_UNTIL_5 | duelModeBase.NO_HAND_LIMIT | duelModeBase.UNLIMITED_SUMMONS | duelModeBase.TRIGGER_ONLY_IN_LOCATION,
	/** Goat ruleset. */
	MODE_GOAT: duelModeBase1.MODE_MR1 | duelModeBase.USE_TRAPS_IN_NEW_CHAIN | duelModeBase.SIX_STEP_BATLLE_STEP | duelModeBase.TRIGGER_WHEN_PRIVATE_KNOWLEDGE | duelModeBase.EQUIP_NOT_SENT_IF_MISSING_TARGET | duelModeBase.ZERO_ATK_DESTROYED | duelModeBase.STORE_ATTACK_REPLAYS | duelModeBase.SINGLE_CHAIN_IN_DAMAGE_SUBSTEP | duelModeBase.CAN_REPOS_IF_NON_SUMPLAYER | duelModeBase.TCG_SEGOC_NONPUBLIC | duelModeBase.TCG_SEGOC_FIRSTTRIGGER,
	/** Master Rule 2 ruleset */
	MODE_MR2: duelModeBase.FIRST_TURN_DRAW | duelModeBase.ONE_FACEUP_FIELD | duelModeBase.SPSUMMON_ONCE_OLD_NEGATE | duelModeBase.RETURN_TO_DECK_TRIGGERS | duelModeBase.CANNOT_SUMMON_OATH_OLD,
	/** Master Rule 3 ruleset */
	MODE_MR3: duelModeBase.PZONE | duelModeBase.SEPARATE_PZONE | duelModeBase.SPSUMMON_ONCE_OLD_NEGATE | duelModeBase.RETURN_TO_DECK_TRIGGERS | duelModeBase.CANNOT_SUMMON_OATH_OLD,
	/** New Master Rule ruleset */
	MODE_MR4: duelModeBase.PZONE | duelModeBase.EMZONE | duelModeBase.SPSUMMON_ONCE_OLD_NEGATE | duelModeBase.RETURN_TO_DECK_TRIGGERS | duelModeBase.CANNOT_SUMMON_OATH_OLD,
	/** New Master Rule (April 2020) ruleset */
	MODE_MR5: duelModeBase.PZONE | duelModeBase.EMZONE | duelModeBase.FSX_MMZONE | duelModeBase.TRAP_MONSTERS_NOT_USE_ZONE | duelModeBase.TRIGGER_ONLY_IN_LOCATION
};
const ocgDuelModeMapElements = Object.values(duelModeBase);
/**
* Parse a {@link (OcgDuelMode:type)} mask and return the matching options.
* @param mode - The mask to parse.
*/
function ocgDuelModeParse(mode) {
	return ocgDuelModeMapElements.filter((x) => mode & x);
}
/** Log type. */
const OcgLogType = {
	/** Error. */
	ERROR: 0,
	/** From script. */
	FROM_SCRIPT: 1,
	/** Debug. */
	FOR_DEBUG: 2,
	/** Undefined. */
	UNDEFINED: 3
};
/** Requested card properties, used when querying. */
const OcgQueryFlags = {
	/** Code. */
	CODE: 1,
	/** Position. */
	POSITION: 2,
	/** Aliases. */
	ALIAS: 4,
	/** Type. */
	TYPE: 8,
	/** Level. */
	LEVEL: 16,
	/** Rank. */
	RANK: 32,
	/** Attribute. */
	ATTRIBUTE: 64,
	/** Race. */
	RACE: 128,
	/** Attack. */
	ATTACK: 256,
	/** Defense. */
	DEFENSE: 512,
	/** Base attack. */
	BASE_ATTACK: 1024,
	/** Base defense. */
	BASE_DEFENSE: 2048,
	/** Reason. */
	REASON: 4096,
	/** Reason card. */
	REASON_CARD: 8192,
	/** Equipped to card. */
	EQUIP_CARD: 16384,
	/** Targeted card. */
	TARGET_CARD: 32768,
	/** Overlayed card. */
	OVERLAY_CARD: 65536,
	/** Counters. */
	COUNTERS: 131072,
	/** Owner. */
	OWNER: 262144,
	/** Status. */
	STATUS: 524288,
	/** Is public knowledge. */
	IS_PUBLIC: 1048576,
	/** Left pendulum scale. */
	LSCALE: 2097152,
	/** Right pendulum scale. */
	RSCALE: 4194304,
	/** Link arrows. */
	LINK: 8388608,
	/** Is hidden. */
	IS_HIDDEN: 16777216,
	/** Cover. */
	COVER: 33554432
};
/** Legality scope of a card. */
const OcgScope = {
	/** OCG legal. */
	OCG: 1,
	/** TCG legal.*/
	TCG: 2,
	/** Anime card.*/
	ANIME: 4,
	/** Cannot be used in a duel.*/
	ILLEGAL: 8,
	/** Video game card.*/
	VIDEO_GAME: 16,
	/** Custom card.*/
	CUSTOM: 32,
	/** Speed duel card.*/
	SPEED: 64,
	/** Prerelease.*/
	PRERELEASE: 256,
	/** Rush duel card.*/
	RUSH: 512,
	/** Rush duel legend card.*/
	LEGEND: 1024,
	/** Hidden.*/
	HIDDEN: 4096
};
/** Turn phase. */
const OcgPhase = {
	/** Draw phase. */
	DRAW: 1,
	/** Stand-by phase. */
	STANDBY: 2,
	/** Main phase 1. */
	MAIN1: 4,
	/** Battle phase: start step */
	BATTLE_START: 8,
	/** Battle phase: battle step */
	BATTLE_STEP: 16,
	/** Battle phase: damage step */
	DAMAGE: 32,
	/** Battle phase: damage calculation */
	DAMAGE_CAL: 64,
	/** Battle phase: end step */
	BATTLE: 128,
	/** Main phase 2. */
	MAIN2: 256,
	/** End phase. */
	END: 512
};
/** Hint type. */
const OcgHintType = {
	/** Event. */
	EVENT: 1,
	/** Message. */
	MESSAGE: 2,
	/** Select message. */
	SELECTMSG: 3,
	/** Operation selected. */
	OPSELECTED: 4,
	/** Effect. */
	EFFECT: 5,
	/** Race. */
	RACE: 6,
	/** Attribute. */
	ATTRIB: 7,
	/** Card code. */
	CODE: 8,
	/** Number. */
	NUMBER: 9,
	/** Card. */
	CARD: 10,
	/** Zone. */
	ZONE: 11
};
/** Timing hints */
const OcgHintTiming = {
	/** In draw phase */
	DRAW_PHASE: 1,
	/** In standby phase */
	STANDBY_PHASE: 2,
	/** Before end of main */
	MAIN_END: 4,
	/** In battle phase */
	BATTLE_START: 8,
	/** After battle */
	BATTLE_END: 16,
	/** In end phase */
	END_PHASE: 32,
	/** After summon */
	SUMMON: 64,
	/** After special summon */
	SPSUMMON: 128,
	/** After flip summon */
	FLIPSUMMON: 256,
	/** After monster set */
	MSET: 512,
	/** After spell set */
	SSET: 1024,
	/** After pos change */
	POS_CHANGE: 2048,
	/** In attack declaration */
	ATTACK: 4096,
	/** In damage step */
	DAMAGE_STEP: 8192,
	/** In damage calculation */
	DAMAGE_CAL: 16384,
	/** After chain resolved */
	CHAIN_END: 32768,
	/** After card draw */
	DRAW: 65536,
	/** After damage */
	DAMAGE: 131072,
	/** After recover */
	RECOVER: 262144,
	/** After destroy */
	DESTROY: 524288,
	/** After banis */
	REMOVE: 1048576,
	/** After card added to the hand */
	TOHAND: 2097152,
	/** After card sent to the deck */
	TODECK: 4194304,
	/** After card sent to the graveyard */
	TOGRAVE: 8388608,
	/** Battle phase */
	BATTLE_PHASE: 16777216,
	/** After equip */
	EQUIP: 33554432,
	/** Battle step end */
	BATTLE_STEP_END: 67108864,
	/** Battled */
	BATTLED: 134217728
};
const ocgHintTimingMapElements = Object.values(OcgHintTiming);
/**
* Parse a {@link (OcgHintTiming:type)} mask and return the matching timings.
* @param timing - The mask to parse.
*/
function ocgHintTimingParse(timing) {
	return ocgHintTimingMapElements.filter((x) => timing & x);
}
//#endregion
//#region vendor/ocgcore/src/queries.ts
function readQuery(reader) {
	const result = {};
	while (reader.avail > 0) {
		let size = reader.u16();
		if (size === 0) return null;
		if (size < 4) break;
		const flag = reader.u32();
		size -= 4;
		if (flag === 2147483648) break;
		else if (flag === OcgQueryFlags.CODE && size === 4) result.code = reader.u32();
		else if (flag === OcgQueryFlags.POSITION && size === 4) result.position = reader.u32();
		else if (flag === OcgQueryFlags.ALIAS && size === 4) result.alias = reader.u32();
		else if (flag === OcgQueryFlags.TYPE && size === 4) result.type = reader.u32();
		else if (flag === OcgQueryFlags.LEVEL && size === 4) result.level = reader.u32();
		else if (flag === OcgQueryFlags.RANK && size === 4) result.rank = reader.u32();
		else if (flag === OcgQueryFlags.ATTRIBUTE && size === 4) result.attribute = reader.u32();
		else if (flag === OcgQueryFlags.RACE && size === 8) result.race = reader.u64();
		else if (flag === OcgQueryFlags.ATTACK && size === 4) result.attack = reader.u32();
		else if (flag === OcgQueryFlags.DEFENSE && size === 4) result.defense = reader.u32();
		else if (flag === OcgQueryFlags.BASE_ATTACK && size === 4) result.baseAttack = reader.u32();
		else if (flag === OcgQueryFlags.BASE_DEFENSE && size === 4) result.baseDefense = reader.u32();
		else if (flag === OcgQueryFlags.REASON && size === 4) result.reason = reader.u32();
		else if (flag === OcgQueryFlags.COVER && size === 4) result.cover = reader.u32();
		else if (flag === OcgQueryFlags.REASON_CARD && size === 10) {
			const card = parseInfoLocation(reader);
			if (!isInfoLocationEmpty(card)) result.reasonCard = card;
		} else if (flag === OcgQueryFlags.EQUIP_CARD && size === 10) {
			const card = parseInfoLocation(reader);
			if (!isInfoLocationEmpty(card)) result.equipCard = card;
		} else if (flag === OcgQueryFlags.TARGET_CARD && size >= 4) {
			result.targetCards = [];
			const length = reader.u32();
			for (let i = 0; i < length; i++) {
				const card = parseInfoLocation(reader);
				if (!isInfoLocationEmpty(card)) result.targetCards.push(card);
			}
		} else if (flag === OcgQueryFlags.OVERLAY_CARD && size >= 4) {
			result.overlayCards = [];
			const length = reader.u32();
			for (let i = 0; i < length; i++) result.overlayCards.push(reader.u32());
		} else if (flag === OcgQueryFlags.COUNTERS && size >= 4) {
			result.counters = {};
			const length = reader.u32();
			for (let i = 0; i < length; i++) {
				const kind = reader.u16();
				const count = reader.u16();
				result.counters[kind] = count;
			}
		} else if (flag === OcgQueryFlags.OWNER && size === 1) result.owner = reader.u8();
		else if (flag === OcgQueryFlags.STATUS && size === 4) result.status = reader.u32();
		else if (flag === OcgQueryFlags.IS_PUBLIC && size === 1) result.isPublic = !!reader.u8();
		else if (flag === OcgQueryFlags.RSCALE && size === 4) result.rightScale = reader.u32();
		else if (flag === OcgQueryFlags.LSCALE && size === 4) result.leftScale = reader.u32();
		else if (flag === OcgQueryFlags.IS_HIDDEN && size === 1) result.isHidden = !!reader.u8();
		else if (flag === OcgQueryFlags.LINK && size === 8) result.link = {
			rating: reader.u32(),
			marker: reader.u32()
		};
		else reader.bytes(size);
	}
	return result;
}
function readQueryLocation(reader) {
	reader.u32();
	const cards = [];
	while (reader.avail > 0) cards.push(readQuery(reader));
	return cards;
}
function readField(reader) {
	return {
		flags: BigInt(reader.u32()),
		players: Array.from({ length: 2 }, () => ({
			lp: reader.i32(),
			monsters: Array.from({ length: 7 }, () => reader.u8() != 0 ? {
				position: reader.u8(),
				materials: reader.u32()
			} : null),
			spells: Array.from({ length: 8 }, () => reader.u8() != 0 ? {
				position: reader.u8(),
				materials: reader.u32()
			} : null),
			deck_size: reader.u32(),
			hand_size: reader.u32(),
			grave_size: reader.u32(),
			banish_size: reader.u32(),
			extra_size: reader.u32(),
			extra_faceup_count: reader.u32()
		})),
		chain: Array.from({ length: reader.u32() }, () => ({
			code: reader.u32(),
			...parseInfoLocation(reader),
			triggering_controller: reader.u8(),
			triggering_location: reader.u8(),
			triggering_sequence: reader.u32(),
			description: reader.u64()
		}))
	};
}
//#endregion
//#region vendor/ocgcore/src/type_message.ts
let OcgEffectClientMode = /* @__PURE__ */ function(OcgEffectClientMode) {
	OcgEffectClientMode[OcgEffectClientMode["NORMAL"] = 0] = "NORMAL";
	OcgEffectClientMode[OcgEffectClientMode["RESOLVE"] = 1] = "RESOLVE";
	OcgEffectClientMode[OcgEffectClientMode["RESET"] = 2] = "RESET";
	return OcgEffectClientMode;
}({});
let OcgCardHintType = /* @__PURE__ */ function(OcgCardHintType) {
	OcgCardHintType[OcgCardHintType["TURN"] = 1] = "TURN";
	OcgCardHintType[OcgCardHintType["CARD"] = 2] = "CARD";
	OcgCardHintType[OcgCardHintType["RACE"] = 3] = "RACE";
	OcgCardHintType[OcgCardHintType["ATTRIBUTE"] = 4] = "ATTRIBUTE";
	OcgCardHintType[OcgCardHintType["NUMBER"] = 5] = "NUMBER";
	OcgCardHintType[OcgCardHintType["DESC_ADD"] = 6] = "DESC_ADD";
	OcgCardHintType[OcgCardHintType["DESC_REMOVE"] = 7] = "DESC_REMOVE";
	return OcgCardHintType;
}({});
let OcgPlayerHintType = /* @__PURE__ */ function(OcgPlayerHintType) {
	OcgPlayerHintType[OcgPlayerHintType["DESC_ADD"] = 6] = "DESC_ADD";
	OcgPlayerHintType[OcgPlayerHintType["DESC_REMOVE"] = 7] = "DESC_REMOVE";
	return OcgPlayerHintType;
}({});
/** Message type enum. */
let OcgMessageType = /* @__PURE__ */ function(OcgMessageType) {
	OcgMessageType[OcgMessageType["RETRY"] = 1] = "RETRY";
	OcgMessageType[OcgMessageType["HINT"] = 2] = "HINT";
	OcgMessageType[OcgMessageType["WAITING"] = 3] = "WAITING";
	OcgMessageType[OcgMessageType["START"] = 4] = "START";
	OcgMessageType[OcgMessageType["WIN"] = 5] = "WIN";
	OcgMessageType[OcgMessageType["UPDATE_DATA"] = 6] = "UPDATE_DATA";
	OcgMessageType[OcgMessageType["UPDATE_CARD"] = 7] = "UPDATE_CARD";
	OcgMessageType[OcgMessageType["REQUEST_DECK"] = 8] = "REQUEST_DECK";
	OcgMessageType[OcgMessageType["SELECT_BATTLECMD"] = 10] = "SELECT_BATTLECMD";
	OcgMessageType[OcgMessageType["SELECT_IDLECMD"] = 11] = "SELECT_IDLECMD";
	OcgMessageType[OcgMessageType["SELECT_EFFECTYN"] = 12] = "SELECT_EFFECTYN";
	OcgMessageType[OcgMessageType["SELECT_YESNO"] = 13] = "SELECT_YESNO";
	OcgMessageType[OcgMessageType["SELECT_OPTION"] = 14] = "SELECT_OPTION";
	OcgMessageType[OcgMessageType["SELECT_CARD"] = 15] = "SELECT_CARD";
	OcgMessageType[OcgMessageType["SELECT_CHAIN"] = 16] = "SELECT_CHAIN";
	OcgMessageType[OcgMessageType["SELECT_PLACE"] = 18] = "SELECT_PLACE";
	OcgMessageType[OcgMessageType["SELECT_POSITION"] = 19] = "SELECT_POSITION";
	OcgMessageType[OcgMessageType["SELECT_TRIBUTE"] = 20] = "SELECT_TRIBUTE";
	OcgMessageType[OcgMessageType["SORT_CHAIN"] = 21] = "SORT_CHAIN";
	OcgMessageType[OcgMessageType["SELECT_COUNTER"] = 22] = "SELECT_COUNTER";
	OcgMessageType[OcgMessageType["SELECT_SUM"] = 23] = "SELECT_SUM";
	OcgMessageType[OcgMessageType["SELECT_DISFIELD"] = 24] = "SELECT_DISFIELD";
	OcgMessageType[OcgMessageType["SORT_CARD"] = 25] = "SORT_CARD";
	OcgMessageType[OcgMessageType["SELECT_UNSELECT_CARD"] = 26] = "SELECT_UNSELECT_CARD";
	OcgMessageType[OcgMessageType["CONFIRM_DECKTOP"] = 30] = "CONFIRM_DECKTOP";
	OcgMessageType[OcgMessageType["CONFIRM_CARDS"] = 31] = "CONFIRM_CARDS";
	OcgMessageType[OcgMessageType["SHUFFLE_DECK"] = 32] = "SHUFFLE_DECK";
	OcgMessageType[OcgMessageType["SHUFFLE_HAND"] = 33] = "SHUFFLE_HAND";
	OcgMessageType[OcgMessageType["REFRESH_DECK"] = 34] = "REFRESH_DECK";
	OcgMessageType[OcgMessageType["SWAP_GRAVE_DECK"] = 35] = "SWAP_GRAVE_DECK";
	OcgMessageType[OcgMessageType["SHUFFLE_SET_CARD"] = 36] = "SHUFFLE_SET_CARD";
	OcgMessageType[OcgMessageType["REVERSE_DECK"] = 37] = "REVERSE_DECK";
	OcgMessageType[OcgMessageType["DECK_TOP"] = 38] = "DECK_TOP";
	OcgMessageType[OcgMessageType["SHUFFLE_EXTRA"] = 39] = "SHUFFLE_EXTRA";
	OcgMessageType[OcgMessageType["NEW_TURN"] = 40] = "NEW_TURN";
	OcgMessageType[OcgMessageType["NEW_PHASE"] = 41] = "NEW_PHASE";
	OcgMessageType[OcgMessageType["CONFIRM_EXTRATOP"] = 42] = "CONFIRM_EXTRATOP";
	OcgMessageType[OcgMessageType["MOVE"] = 50] = "MOVE";
	OcgMessageType[OcgMessageType["POS_CHANGE"] = 53] = "POS_CHANGE";
	OcgMessageType[OcgMessageType["SET"] = 54] = "SET";
	OcgMessageType[OcgMessageType["SWAP"] = 55] = "SWAP";
	OcgMessageType[OcgMessageType["FIELD_DISABLED"] = 56] = "FIELD_DISABLED";
	OcgMessageType[OcgMessageType["SUMMONING"] = 60] = "SUMMONING";
	OcgMessageType[OcgMessageType["SUMMONED"] = 61] = "SUMMONED";
	OcgMessageType[OcgMessageType["SPSUMMONING"] = 62] = "SPSUMMONING";
	OcgMessageType[OcgMessageType["SPSUMMONED"] = 63] = "SPSUMMONED";
	OcgMessageType[OcgMessageType["FLIPSUMMONING"] = 64] = "FLIPSUMMONING";
	OcgMessageType[OcgMessageType["FLIPSUMMONED"] = 65] = "FLIPSUMMONED";
	OcgMessageType[OcgMessageType["CHAINING"] = 70] = "CHAINING";
	OcgMessageType[OcgMessageType["CHAINED"] = 71] = "CHAINED";
	OcgMessageType[OcgMessageType["CHAIN_SOLVING"] = 72] = "CHAIN_SOLVING";
	OcgMessageType[OcgMessageType["CHAIN_SOLVED"] = 73] = "CHAIN_SOLVED";
	OcgMessageType[OcgMessageType["CHAIN_END"] = 74] = "CHAIN_END";
	OcgMessageType[OcgMessageType["CHAIN_NEGATED"] = 75] = "CHAIN_NEGATED";
	OcgMessageType[OcgMessageType["CHAIN_DISABLED"] = 76] = "CHAIN_DISABLED";
	OcgMessageType[OcgMessageType["CARD_SELECTED"] = 80] = "CARD_SELECTED";
	OcgMessageType[OcgMessageType["RANDOM_SELECTED"] = 81] = "RANDOM_SELECTED";
	OcgMessageType[OcgMessageType["BECOME_TARGET"] = 83] = "BECOME_TARGET";
	OcgMessageType[OcgMessageType["DRAW"] = 90] = "DRAW";
	OcgMessageType[OcgMessageType["DAMAGE"] = 91] = "DAMAGE";
	OcgMessageType[OcgMessageType["RECOVER"] = 92] = "RECOVER";
	OcgMessageType[OcgMessageType["EQUIP"] = 93] = "EQUIP";
	OcgMessageType[OcgMessageType["LPUPDATE"] = 94] = "LPUPDATE";
	OcgMessageType[OcgMessageType["CARD_TARGET"] = 96] = "CARD_TARGET";
	OcgMessageType[OcgMessageType["CANCEL_TARGET"] = 97] = "CANCEL_TARGET";
	OcgMessageType[OcgMessageType["PAY_LPCOST"] = 100] = "PAY_LPCOST";
	OcgMessageType[OcgMessageType["ADD_COUNTER"] = 101] = "ADD_COUNTER";
	OcgMessageType[OcgMessageType["REMOVE_COUNTER"] = 102] = "REMOVE_COUNTER";
	OcgMessageType[OcgMessageType["ATTACK"] = 110] = "ATTACK";
	OcgMessageType[OcgMessageType["BATTLE"] = 111] = "BATTLE";
	OcgMessageType[OcgMessageType["ATTACK_DISABLED"] = 112] = "ATTACK_DISABLED";
	OcgMessageType[OcgMessageType["DAMAGE_STEP_START"] = 113] = "DAMAGE_STEP_START";
	OcgMessageType[OcgMessageType["DAMAGE_STEP_END"] = 114] = "DAMAGE_STEP_END";
	OcgMessageType[OcgMessageType["MISSED_EFFECT"] = 120] = "MISSED_EFFECT";
	OcgMessageType[OcgMessageType["BE_CHAIN_TARGET"] = 121] = "BE_CHAIN_TARGET";
	OcgMessageType[OcgMessageType["CREATE_RELATION"] = 122] = "CREATE_RELATION";
	OcgMessageType[OcgMessageType["RELEASE_RELATION"] = 123] = "RELEASE_RELATION";
	OcgMessageType[OcgMessageType["TOSS_COIN"] = 130] = "TOSS_COIN";
	OcgMessageType[OcgMessageType["TOSS_DICE"] = 131] = "TOSS_DICE";
	OcgMessageType[OcgMessageType["ROCK_PAPER_SCISSORS"] = 132] = "ROCK_PAPER_SCISSORS";
	OcgMessageType[OcgMessageType["HAND_RES"] = 133] = "HAND_RES";
	OcgMessageType[OcgMessageType["ANNOUNCE_RACE"] = 140] = "ANNOUNCE_RACE";
	OcgMessageType[OcgMessageType["ANNOUNCE_ATTRIB"] = 141] = "ANNOUNCE_ATTRIB";
	OcgMessageType[OcgMessageType["ANNOUNCE_CARD"] = 142] = "ANNOUNCE_CARD";
	OcgMessageType[OcgMessageType["ANNOUNCE_NUMBER"] = 143] = "ANNOUNCE_NUMBER";
	OcgMessageType[OcgMessageType["CARD_HINT"] = 160] = "CARD_HINT";
	OcgMessageType[OcgMessageType["TAG_SWAP"] = 161] = "TAG_SWAP";
	OcgMessageType[OcgMessageType["RELOAD_FIELD"] = 162] = "RELOAD_FIELD";
	OcgMessageType[OcgMessageType["AI_NAME"] = 163] = "AI_NAME";
	OcgMessageType[OcgMessageType["SHOW_HINT"] = 164] = "SHOW_HINT";
	OcgMessageType[OcgMessageType["PLAYER_HINT"] = 165] = "PLAYER_HINT";
	OcgMessageType[OcgMessageType["MATCH_KILL"] = 170] = "MATCH_KILL";
	OcgMessageType[OcgMessageType["CUSTOM_MSG"] = 180] = "CUSTOM_MSG";
	OcgMessageType[OcgMessageType["REMOVE_CARDS"] = 190] = "REMOVE_CARDS";
	return OcgMessageType;
}({});
//#endregion
//#region vendor/ocgcore/src/messages.ts
function parseInfoLocation(reader) {
	const controller = reader.u8();
	const location = reader.u8();
	const sequence = reader.u32();
	const position = reader.u32();
	if (location & OcgLocation.OVERLAY) return {
		controller,
		location: location & ~OcgLocation.OVERLAY,
		sequence,
		position: OcgPosition.FACEUP_ATTACK,
		overlay_sequence: position
	};
	else return {
		controller,
		location,
		sequence,
		position
	};
}
function isInfoLocationEmpty(loc) {
	return !loc.controller && !loc.location && !loc.sequence && !loc.position && !loc.overlay_sequence;
}
function readMessage(reader) {
	const type = reader.u8();
	switch (type) {
		case 1: return { type };
		case 2: return {
			type,
			hint_type: reader.u8(),
			player: reader.u8(),
			hint: reader.avail > 4 ? reader.u64() : BigInt(reader.u32())
		};
		case 5: return {
			type,
			player: reader.u8(),
			reason: reader.u8()
		};
		case 10: return {
			type,
			player: reader.u8(),
			chains: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32(),
				description: reader.u64(),
				client_mode: reader.u8()
			})),
			attacks: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u8(),
				can_direct: reader.u8() != 0
			})),
			to_m2: reader.u8() != 0,
			to_ep: reader.u8() != 0
		};
		case 11: return {
			type,
			player: reader.u8(),
			summons: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			})),
			special_summons: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			})),
			pos_changes: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u8()
			})),
			monster_sets: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			})),
			spell_sets: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			})),
			activates: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32(),
				description: reader.u64(),
				client_mode: reader.u8()
			})),
			to_bp: reader.u8() != 0,
			to_ep: reader.u8() != 0,
			shuffle: reader.u8() != 0
		};
		case 12: return {
			type,
			player: reader.u8(),
			code: reader.u32(),
			...parseInfoLocation(reader),
			description: reader.u64()
		};
		case 13: return {
			type,
			player: reader.u8(),
			description: reader.u64()
		};
		case 14: return {
			type,
			player: reader.u8(),
			options: Array.from({ length: reader.u8() }, () => reader.u64())
		};
		case 15: return {
			type,
			player: reader.u8(),
			can_cancel: reader.u8() != 0,
			min: reader.u32(),
			max: reader.u32(),
			selects: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				...parseInfoLocation(reader)
			}))
		};
		case 16: return {
			type,
			player: reader.u8(),
			spe_count: reader.u8(),
			forced: reader.u8() != 0,
			hint_timing: reader.u32(),
			hint_timing_other: reader.u32(),
			selects: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				...parseInfoLocation(reader),
				description: reader.u64(),
				client_mode: reader.u8()
			}))
		};
		case 18: return {
			type,
			player: reader.u8(),
			count: reader.u8(),
			field_mask: reader.u32()
		};
		case 19: return {
			type,
			player: reader.u8(),
			code: reader.u32(),
			positions: reader.u8()
		};
		case 20: return {
			type,
			player: reader.u8(),
			can_cancel: reader.u8() != 0,
			min: reader.u32(),
			max: reader.u32(),
			selects: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32(),
				release_param: reader.u8()
			}))
		};
		case 21: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u32(),
				sequence: reader.u32()
			}))
		};
		case 22: return {
			type,
			player: reader.u8(),
			counter_type: reader.u16(),
			count: reader.u16(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u8(),
				count: reader.u16()
			}))
		};
		case 23: return {
			type,
			player: reader.u8(),
			select_max: reader.u8(),
			amount: reader.u32(),
			min: reader.u32(),
			max: reader.u32(),
			selects_must: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32(),
				position: reader.u32(),
				amount: reader.u32()
			})),
			selects: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32(),
				position: reader.u32(),
				amount: reader.u32()
			}))
		};
		case 24: return {
			type,
			player: reader.u8(),
			count: reader.u8(),
			field_mask: reader.u32()
		};
		case 25: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u32(),
				sequence: reader.u32()
			}))
		};
		case 26: return {
			type,
			player: reader.u8(),
			can_finish: reader.u8() != 0,
			can_cancel: reader.u8() != 0,
			min: reader.u32(),
			max: reader.u32(),
			select_cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				...parseInfoLocation(reader)
			})),
			unselect_cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				...parseInfoLocation(reader)
			}))
		};
		case 30: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			}))
		};
		case 31: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			}))
		};
		case 32: return {
			type,
			player: reader.u8()
		};
		case 33: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => reader.u32())
		};
		case 34: return { type };
		case 35:
			let deck_size;
			return {
				type,
				player: reader.u8(),
				deck_size: deck_size = reader.u32(),
				returned_to_extra: (() => {
					const ret = [];
					const bytes = reader.bytes(reader.u32());
					for (let i = 0; i < deck_size; i++) if (bytes[Math.floor(i / 8)] & 1 << i % 8) ret.push(i);
					return ret;
				})()
			};
		case 36: {
			const location = reader.u8();
			const count = reader.u8();
			const before = Array.from({ length: count }, () => parseInfoLocation(reader));
			const after = Array.from({ length: count }, () => parseInfoLocation(reader));
			return {
				type,
				location,
				cards: before.map((from, i) => ({
					from,
					to: after[i]
				}))
			};
		}
		case 37: return { type };
		case 38: return {
			type,
			player: reader.u8(),
			count: reader.u32(),
			code: reader.u32(),
			position: reader.u32()
		};
		case 39: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => reader.u32())
		};
		case 40: return {
			type,
			player: reader.u8()
		};
		case 41: return {
			type,
			phase: reader.u16()
		};
		case 42: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				controller: reader.u8(),
				location: reader.u8(),
				sequence: reader.u32()
			}))
		};
		case 50: return {
			type,
			card: reader.u32(),
			from: parseInfoLocation(reader),
			to: parseInfoLocation(reader),
			reason: reader.avail >= 4 ? reader.u32() : 0
		};
		case 53: return {
			type,
			code: reader.u32(),
			controller: reader.u8(),
			location: reader.u8(),
			sequence: reader.u8(),
			prev_position: reader.u8(),
			position: reader.u8()
		};
		case 54: return {
			type,
			code: reader.u32(),
			...parseInfoLocation(reader)
		};
		case 55: return {
			type,
			card1: {
				code: reader.u32(),
				...parseInfoLocation(reader)
			},
			card2: {
				code: reader.u32(),
				...parseInfoLocation(reader)
			}
		};
		case 56: return {
			type,
			field_mask: reader.u32()
		};
		case 60: return {
			type,
			code: reader.u32(),
			...parseInfoLocation(reader)
		};
		case 61: return { type };
		case 62: return {
			type,
			code: reader.u32(),
			...parseInfoLocation(reader)
		};
		case 63: return { type };
		case 64: return {
			type,
			code: reader.u32(),
			...parseInfoLocation(reader)
		};
		case 65: return { type };
		case 70: return {
			type,
			code: reader.u32(),
			...parseInfoLocation(reader),
			triggering_controller: reader.u8(),
			triggering_location: reader.u8(),
			triggering_sequence: reader.u32(),
			description: reader.u64(),
			chain_size: reader.u32()
		};
		case 71: return {
			type,
			chain_size: reader.u8()
		};
		case 72: return {
			type,
			chain_size: reader.u8()
		};
		case 73: return {
			type,
			chain_size: reader.u8()
		};
		case 74: return { type };
		case 75: return {
			type,
			chain_size: reader.u8()
		};
		case 76: return {
			type,
			chain_size: reader.u8()
		};
		case 80: return {
			type,
			cards: Array.from({ length: reader.u32() }, () => parseInfoLocation(reader))
		};
		case 81: return {
			type,
			player: reader.u8(),
			cards: Array.from({ length: reader.u32() }, () => parseInfoLocation(reader))
		};
		case 83: return {
			type,
			cards: Array.from({ length: reader.u32() }, () => parseInfoLocation(reader))
		};
		case 90: return {
			type,
			player: reader.u8(),
			drawn: Array.from({ length: reader.u32() }, () => ({
				code: reader.u32(),
				position: reader.u32()
			}))
		};
		case 91: return {
			type,
			player: reader.u8(),
			amount: reader.u32()
		};
		case 92: return {
			type,
			player: reader.u8(),
			amount: reader.u32()
		};
		case 93: return {
			type,
			card: parseInfoLocation(reader),
			target: parseInfoLocation(reader)
		};
		case 94: return {
			type,
			player: reader.u8(),
			lp: reader.u32()
		};
		case 96: return {
			type,
			card: parseInfoLocation(reader),
			target: parseInfoLocation(reader)
		};
		case 97: return {
			type,
			card: parseInfoLocation(reader),
			target: parseInfoLocation(reader)
		};
		case 100: return {
			type,
			player: reader.u8(),
			amount: reader.u32()
		};
		case 101: return {
			type,
			counter_type: reader.u16(),
			controller: reader.u8(),
			location: reader.u8(),
			sequence: reader.u8(),
			count: reader.u16()
		};
		case 102: return {
			type,
			counter_type: reader.u16(),
			controller: reader.u8(),
			location: reader.u8(),
			sequence: reader.u8(),
			count: reader.u16()
		};
		case 110: return {
			type,
			card: parseInfoLocation(reader),
			target: (() => {
				const loc = parseInfoLocation(reader);
				if (isInfoLocationEmpty(loc)) return null;
				return loc;
			})()
		};
		case 111: return {
			type,
			card: {
				...parseInfoLocation(reader),
				attack: reader.u32(),
				defense: reader.u32(),
				destroyed: reader.u8() != 0
			},
			target: {
				...parseInfoLocation(reader),
				attack: reader.u32(),
				defense: reader.u32(),
				destroyed: reader.u8() != 0
			}
		};
		case 112: return { type };
		case 113: return { type };
		case 114: return { type };
		case 120: return {
			type,
			...parseInfoLocation(reader),
			code: reader.u32()
		};
		case 121: return { type };
		case 122: return { type };
		case 123: return { type };
		case 130: return {
			type,
			player: reader.u8(),
			results: Array.from({ length: reader.u8() }, () => reader.u8() != 0)
		};
		case 131: return {
			type,
			player: reader.u8(),
			results: Array.from({ length: reader.u8() }, () => reader.u8())
		};
		case 132: return {
			type,
			player: reader.u8()
		};
		case 133: return {
			type,
			results: (() => {
				const result = reader.u8();
				return [result & 3, result >> 2 & 3];
			})()
		};
		case 140: return {
			type,
			player: reader.u8(),
			count: reader.u8(),
			available: reader.u64()
		};
		case 141: return {
			type,
			player: reader.u8(),
			count: reader.u8(),
			available: reader.u32()
		};
		case 142: return {
			type,
			player: reader.u8(),
			opcodes: Array.from({ length: reader.u8() }, () => reader.u64())
		};
		case 143: return {
			type,
			player: reader.u8(),
			options: Array.from({ length: reader.u8() }, () => reader.u64())
		};
		case 160: return {
			type,
			...parseInfoLocation(reader),
			card_hint: reader.u8(),
			description: reader.u64()
		};
		case 161: {
			const player = reader.u8();
			const deck_size = reader.u32();
			const extra_size = reader.u32();
			const extra_faceup_count = reader.u32();
			const hand_length = reader.u32();
			const deck_top_card = reader.u32();
			return {
				type,
				player,
				deck_size,
				extra_faceup_count,
				deck_top_card: deck_top_card == 0 ? null : deck_top_card,
				hand: Array.from({ length: hand_length }, () => ({
					code: reader.u32(),
					position: reader.u32()
				})),
				extra: Array.from({ length: extra_size }, () => ({
					code: reader.u32(),
					position: reader.u32()
				}))
			};
		}
		case 162: return {
			type,
			...readField(reader)
		};
		case 163: return {
			type,
			name: (() => {
				const name = reader.bytes(reader.u16());
				return new TextDecoder().decode(name);
			})()
		};
		case 164: return {
			type,
			hint: (() => {
				const hint = reader.bytes(reader.u16());
				return new TextDecoder().decode(hint);
			})()
		};
		case 165: return {
			type,
			player: reader.u8(),
			player_hint: reader.u8(),
			description: reader.u64()
		};
		case 170: return {
			type,
			card: reader.u32()
		};
		case 180: return { type };
		case 190: return {
			type,
			cards: Array.from({ length: reader.u32() }, () => parseInfoLocation(reader))
		};
		default: return null;
	}
}
//#endregion
//#region vendor/ocgcore/src/type_response.ts
/** Response type enum. */
let OcgResponseType = /* @__PURE__ */ function(OcgResponseType) {
	OcgResponseType[OcgResponseType["SELECT_BATTLECMD"] = 0] = "SELECT_BATTLECMD";
	OcgResponseType[OcgResponseType["SELECT_IDLECMD"] = 1] = "SELECT_IDLECMD";
	OcgResponseType[OcgResponseType["SELECT_EFFECTYN"] = 2] = "SELECT_EFFECTYN";
	OcgResponseType[OcgResponseType["SELECT_YESNO"] = 3] = "SELECT_YESNO";
	OcgResponseType[OcgResponseType["SELECT_OPTION"] = 4] = "SELECT_OPTION";
	OcgResponseType[OcgResponseType["SELECT_CARD"] = 5] = "SELECT_CARD";
	OcgResponseType[OcgResponseType["SELECT_CARD_CODES"] = 6] = "SELECT_CARD_CODES";
	OcgResponseType[OcgResponseType["SELECT_UNSELECT_CARD"] = 7] = "SELECT_UNSELECT_CARD";
	OcgResponseType[OcgResponseType["SELECT_CHAIN"] = 8] = "SELECT_CHAIN";
	OcgResponseType[OcgResponseType["SELECT_DISFIELD"] = 9] = "SELECT_DISFIELD";
	OcgResponseType[OcgResponseType["SELECT_PLACE"] = 10] = "SELECT_PLACE";
	OcgResponseType[OcgResponseType["SELECT_POSITION"] = 11] = "SELECT_POSITION";
	OcgResponseType[OcgResponseType["SELECT_TRIBUTE"] = 12] = "SELECT_TRIBUTE";
	OcgResponseType[OcgResponseType["SELECT_COUNTER"] = 13] = "SELECT_COUNTER";
	OcgResponseType[OcgResponseType["SELECT_SUM"] = 14] = "SELECT_SUM";
	OcgResponseType[OcgResponseType["SORT_CARD"] = 15] = "SORT_CARD";
	OcgResponseType[OcgResponseType["ANNOUNCE_RACE"] = 16] = "ANNOUNCE_RACE";
	OcgResponseType[OcgResponseType["ANNOUNCE_ATTRIB"] = 17] = "ANNOUNCE_ATTRIB";
	OcgResponseType[OcgResponseType["ANNOUNCE_CARD"] = 18] = "ANNOUNCE_CARD";
	OcgResponseType[OcgResponseType["ANNOUNCE_NUMBER"] = 19] = "ANNOUNCE_NUMBER";
	OcgResponseType[OcgResponseType["ROCK_PAPER_SCISSORS"] = 20] = "ROCK_PAPER_SCISSORS";
	return OcgResponseType;
}({});
/** Battle command enum, used in {@link OcgResponseSelectBattleCMD}. */
let SelectBattleCMDAction = /* @__PURE__ */ function(SelectBattleCMDAction) {
	SelectBattleCMDAction[SelectBattleCMDAction["SELECT_CHAIN"] = 0] = "SELECT_CHAIN";
	SelectBattleCMDAction[SelectBattleCMDAction["SELECT_BATTLE"] = 1] = "SELECT_BATTLE";
	SelectBattleCMDAction[SelectBattleCMDAction["TO_M2"] = 2] = "TO_M2";
	SelectBattleCMDAction[SelectBattleCMDAction["TO_EP"] = 3] = "TO_EP";
	return SelectBattleCMDAction;
}({});
/** Idle command enum, used in {@link OcgResponseSelectIdleCMD}. */
let SelectIdleCMDAction = /* @__PURE__ */ function(SelectIdleCMDAction) {
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_SUMMON"] = 0] = "SELECT_SUMMON";
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_SPECIAL_SUMMON"] = 1] = "SELECT_SPECIAL_SUMMON";
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_POS_CHANGE"] = 2] = "SELECT_POS_CHANGE";
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_MONSTER_SET"] = 3] = "SELECT_MONSTER_SET";
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_SPELL_SET"] = 4] = "SELECT_SPELL_SET";
	SelectIdleCMDAction[SelectIdleCMDAction["SELECT_ACTIVATE"] = 5] = "SELECT_ACTIVATE";
	SelectIdleCMDAction[SelectIdleCMDAction["TO_BP"] = 6] = "TO_BP";
	SelectIdleCMDAction[SelectIdleCMDAction["TO_EP"] = 7] = "TO_EP";
	SelectIdleCMDAction[SelectIdleCMDAction["SHUFFLE"] = 8] = "SHUFFLE";
	return SelectIdleCMDAction;
}({});
//#endregion
//#region vendor/ocgcore/src/responses.ts
function createResponse(response) {
	const writer = new BufferWriter();
	switch (response.type) {
		case 0:
			writer.i32(response.action | (response.index ?? 0) << 16);
			break;
		case 1:
			writer.i32(response.action | (response.index ?? 0) << 16);
			break;
		case 2:
			writer.i32(response.yes ? 1 : 0);
			break;
		case 3:
			writer.i32(response.yes ? 1 : 0);
			break;
		case 4:
			writer.i32(response.index);
			break;
		case 5:
		case 12:
		case 14:
			if (response.indicies) {
				writer.i32(0);
				writer.i32(response.indicies.length);
				for (const i of response.indicies) writer.i32(i);
			} else writer.i32(-1);
			break;
		case 6:
			if (response.codes) {
				writer.i32(0);
				writer.i32(response.codes.length);
				for (const i of response.codes) writer.i32(i);
			} else writer.i32(-1);
			break;
		case 7:
			if (response.index === null) writer.i32(-1);
			else {
				writer.i32(1);
				writer.i32(response.index);
			}
			break;
		case 9:
		case 10:
			for (const place of response.places) {
				writer.i8(place.player);
				writer.i8(place.location);
				writer.i8(place.sequence);
			}
			break;
		case 8:
			if (response.index === null) writer.i32(-1);
			else writer.i32(response.index);
			break;
		case 11:
			writer.i32(response.position);
			break;
		case 13:
			for (const count of response.counters) writer.i16(count);
			break;
		case 15:
			if (!response.order) {
				writer.i8(-1);
				break;
			}
			for (const i of response.order) writer.i8(i);
			break;
		case 16:
			let race = 0n;
			for (const r of response.races) race |= r;
			writer.u64(race);
			break;
		case 17:
			let attribute = 0;
			for (const a of response.attributes) attribute |= a;
			writer.u32(attribute);
			break;
		case 18:
			writer.i32(response.card);
			break;
		case 19:
			writer.i32(response.value);
			break;
		case 20: writer.i32(response.value);
	}
	return writer.buffer.subarray(0, writer.off);
}
//#endregion
//#region vendor/ocgcore/src/type_handle.ts
const DuelHandleSymbol = Symbol("duel-handle");
//#endregion
//#region vendor/ocgcore/src/internal/utils.ts
/** Internal utility to create type-safe Map objects. */
function makeMap(e) {
	return new Map(e);
}
//#endregion
//#region vendor/ocgcore/src/type_serialize.ts
/**
* Convert a {@link OcgEffectClientMode} to its string representation.
*/
const ocgEffectClientModeStrings = makeMap([
	[0, "normal"],
	[1, "resolve"],
	[2, "reset"]
]);
/**
* Convert a {@link OcgCardHintType} to its string representation.
*/
const ocgCardHintTypeStrings = makeMap([
	[1, "turn"],
	[2, "card"],
	[3, "race"],
	[4, "attribute"],
	[5, "number"],
	[6, "desc_add"],
	[7, "desc_remove"]
]);
/**
* Convert a {@link OcgPlayerHintType} to its string representation.
*/
const ocgPlayerHintTypeStrings = makeMap([[6, "desc_add"], [7, "desc_remove"]]);
/**
* Convert a {@link OcgMessageType} to its string representation.
*/
const ocgMessageTypeStrings = makeMap([
	[1, "retry"],
	[2, "hint"],
	[3, "waiting"],
	[4, "start"],
	[5, "win"],
	[6, "update_data"],
	[7, "update_card"],
	[8, "request_deck"],
	[10, "select_battlecmd"],
	[11, "select_idlecmd"],
	[12, "select_effectyn"],
	[13, "select_yesno"],
	[14, "select_option"],
	[15, "select_card"],
	[16, "select_chain"],
	[18, "select_place"],
	[19, "select_position"],
	[20, "select_tribute"],
	[21, "sort_chain"],
	[22, "select_counter"],
	[23, "select_sum"],
	[24, "select_disfield"],
	[25, "sort_card"],
	[26, "select_unselect_card"],
	[30, "confirm_decktop"],
	[31, "confirm_cards"],
	[32, "shuffle_deck"],
	[33, "shuffle_hand"],
	[34, "refresh_deck"],
	[35, "swap_grave_deck"],
	[36, "shuffle_set_card"],
	[37, "reverse_deck"],
	[38, "deck_top"],
	[39, "shuffle_extra"],
	[40, "new_turn"],
	[41, "new_phase"],
	[42, "confirm_extratop"],
	[50, "move"],
	[53, "pos_change"],
	[54, "set"],
	[55, "swap"],
	[56, "field_disabled"],
	[60, "summoning"],
	[61, "summoned"],
	[62, "spsummoning"],
	[63, "spsummoned"],
	[64, "flipsummoning"],
	[65, "flipsummoned"],
	[70, "chaining"],
	[71, "chained"],
	[72, "chain_solving"],
	[73, "chain_solved"],
	[74, "chain_end"],
	[75, "chain_negated"],
	[76, "chain_disabled"],
	[80, "card_selected"],
	[81, "random_selected"],
	[83, "become_target"],
	[90, "draw"],
	[91, "damage"],
	[92, "recover"],
	[93, "equip"],
	[94, "lpupdate"],
	[96, "card_target"],
	[97, "cancel_target"],
	[100, "pay_lpcost"],
	[101, "add_counter"],
	[102, "remove_counter"],
	[110, "attack"],
	[111, "battle"],
	[112, "attack_disabled"],
	[113, "damage_step_start"],
	[114, "damage_step_end"],
	[120, "missed_effect"],
	[121, "be_chain_target"],
	[122, "create_relation"],
	[123, "release_relation"],
	[130, "toss_coin"],
	[131, "toss_dice"],
	[132, "rock_paper_scissors"],
	[133, "hand_res"],
	[140, "announce_race"],
	[141, "announce_attrib"],
	[142, "announce_card"],
	[143, "announce_number"],
	[160, "card_hint"],
	[161, "tag_swap"],
	[162, "reload_field"],
	[163, "ai_name"],
	[164, "show_hint"],
	[165, "player_hint"],
	[170, "match_kill"],
	[180, "custom_msg"],
	[190, "remove_cards"]
]);
/**
* Convert a {@link OcgResponseType} to its string representation.
*/
const responseTypeStrings = makeMap([
	[0, "select_battlecmd"],
	[1, "select_idlecmd"],
	[2, "select_effectyn"],
	[3, "select_yesno"],
	[4, "select_option"],
	[5, "select_card"],
	[6, "select_card_codes"],
	[7, "select_unselect_card"],
	[8, "select_chain"],
	[9, "select_disfield"],
	[10, "select_place"],
	[11, "select_position"],
	[12, "select_tribute"],
	[13, "select_counter"],
	[14, "select_sum"],
	[15, "sort_card"],
	[16, "announce_race"],
	[17, "announce_attrib"],
	[18, "announce_card"],
	[19, "announce_number"],
	[20, "rock_paper_scissors"]
]);
/**
* Convert a {@link SelectBattleCMDAction} to its string representation.
*/
const selectBattleCMDActionStrings = makeMap([
	[0, "select_chain"],
	[1, "select_battle"],
	[2, "to_m2"],
	[3, "to_ep"]
]);
/**
* Convert a {@link SelectIdleCMDAction} to its string representation.
*/
const selectIdleCMDActionStrings = makeMap([
	[0, "select_summon"],
	[1, "select_special_summon"],
	[2, "select_pos_change"],
	[3, "select_monster_set"],
	[4, "select_spell_set"],
	[5, "select_activate"],
	[6, "to_bp"],
	[7, "to_ep"],
	[8, "shuffle"]
]);
/**
* Convert a {@link (OcgQueryFlags:type)} to its string representation.
*/
const ocgQueryFlagsString = makeMap([
	[OcgQueryFlags.CODE, "code"],
	[OcgQueryFlags.POSITION, "position"],
	[OcgQueryFlags.ALIAS, "alias"],
	[OcgQueryFlags.TYPE, "type"],
	[OcgQueryFlags.LEVEL, "level"],
	[OcgQueryFlags.RANK, "rank"],
	[OcgQueryFlags.ATTRIBUTE, "attribute"],
	[OcgQueryFlags.RACE, "race"],
	[OcgQueryFlags.ATTACK, "attack"],
	[OcgQueryFlags.DEFENSE, "defense"],
	[OcgQueryFlags.BASE_ATTACK, "base_attack"],
	[OcgQueryFlags.BASE_DEFENSE, "base_defense"],
	[OcgQueryFlags.REASON, "reason"],
	[OcgQueryFlags.REASON_CARD, "reason_card"],
	[OcgQueryFlags.EQUIP_CARD, "equip_card"],
	[OcgQueryFlags.TARGET_CARD, "target_card"],
	[OcgQueryFlags.OVERLAY_CARD, "overlay_card"],
	[OcgQueryFlags.COUNTERS, "counters"],
	[OcgQueryFlags.OWNER, "owner"],
	[OcgQueryFlags.STATUS, "status"],
	[OcgQueryFlags.IS_PUBLIC, "is_public"],
	[OcgQueryFlags.LSCALE, "lscale"],
	[OcgQueryFlags.RSCALE, "rscale"],
	[OcgQueryFlags.LINK, "link"],
	[OcgQueryFlags.IS_HIDDEN, "is_hidden"],
	[OcgQueryFlags.COVER, "cover"]
]);
/**
* Convert a {@link (OcgScope:type)} to its string representation.
*/
const ocgScopeString = makeMap([
	[OcgScope.OCG, "ocg"],
	[OcgScope.TCG, "tcg"],
	[OcgScope.ANIME, "anime"],
	[OcgScope.ILLEGAL, "illegal"],
	[OcgScope.VIDEO_GAME, "video_game"],
	[OcgScope.CUSTOM, "custom"],
	[OcgScope.SPEED, "speed"],
	[OcgScope.PRERELEASE, "prerelease"],
	[OcgScope.RUSH, "rush"],
	[OcgScope.LEGEND, "legend"],
	[OcgScope.HIDDEN, "hidden"]
]);
/**
* Convert a {@link (OcgProcessResult:type)} to its string representation.
*/
const ocgProcessResultString = makeMap([
	[OcgProcessResult.END, "end"],
	[OcgProcessResult.WAITING, "waiting"],
	[OcgProcessResult.CONTINUE, "continue"]
]);
/**
* Convert a {@link (OcgPosition:type)} to its string representation.
*/
const ocgPositionString = makeMap([
	[OcgPosition.FACEUP_ATTACK, "faceup_attack"],
	[OcgPosition.FACEDOWN_ATTACK, "facedown_attack"],
	[OcgPosition.FACEUP_DEFENSE, "faceup_defense"],
	[OcgPosition.FACEDOWN_DEFENSE, "facedown_defense"],
	[OcgPosition.FACEUP, "faceup"],
	[OcgPosition.FACEDOWN, "facedown"],
	[OcgPosition.ATTACK, "attack"],
	[OcgPosition.DEFENSE, "defense"]
]);
/**
* Convert a {@link (OcgLocation:type)} to its string representation.
*/
const ocgLocationString = makeMap([
	[OcgLocation.DECK, "deck"],
	[OcgLocation.HAND, "hand"],
	[OcgLocation.MZONE, "mzone"],
	[OcgLocation.SZONE, "szone"],
	[OcgLocation.GRAVE, "grave"],
	[OcgLocation.REMOVED, "removed"],
	[OcgLocation.EXTRA, "extra"],
	[OcgLocation.OVERLAY, "overlay"],
	[OcgLocation.FZONE, "fzone"],
	[OcgLocation.PZONE, "pzone"],
	[OcgLocation.ONFIELD, "onfield"],
	[OcgLocation.ALL, "all"]
]);
/**
* Convert a {@link (OcgType:type)} to its string representation.
*/
const ocgTypeString = makeMap([
	[OcgType.MONSTER, "monster"],
	[OcgType.SPELL, "spell"],
	[OcgType.TRAP, "trap"],
	[OcgType.NORMAL, "normal"],
	[OcgType.EFFECT, "effect"],
	[OcgType.FUSION, "fusion"],
	[OcgType.RITUAL, "ritual"],
	[OcgType.TRAPMONSTER, "trapmonster"],
	[OcgType.SPIRIT, "spirit"],
	[OcgType.UNION, "union"],
	[OcgType.GEMINI, "gemini"],
	[OcgType.TUNER, "tuner"],
	[OcgType.SYNCHRO, "synchro"],
	[OcgType.TOKEN, "token"],
	[OcgType.MAXIMUM, "maximum"],
	[OcgType.QUICKPLAY, "quickplay"],
	[OcgType.CONTINUOUS, "continuous"],
	[OcgType.EQUIP, "equip"],
	[OcgType.FIELD, "field"],
	[OcgType.COUNTER, "counter"],
	[OcgType.FLIP, "flip"],
	[OcgType.TOON, "toon"],
	[OcgType.XYZ, "xyz"],
	[OcgType.PENDULUM, "pendulum"],
	[OcgType.SPSUMMON, "spsummon"],
	[OcgType.LINK, "link"]
]);
/**
* Convert a {@link (OcgAttribute:type)} to its string representation.
*/
const ocgAttributeString = makeMap([
	[OcgAttribute.EARTH, "earth"],
	[OcgAttribute.WATER, "water"],
	[OcgAttribute.FIRE, "fire"],
	[OcgAttribute.WIND, "wind"],
	[OcgAttribute.LIGHT, "light"],
	[OcgAttribute.DARK, "dark"],
	[OcgAttribute.DIVINE, "divine"]
]);
/**
* Convert a {@link (OcgRace:type)} to its string representation.
*/
const ocgRaceString = makeMap([
	[OcgRace.WARRIOR, "warrior"],
	[OcgRace.SPELLCASTER, "spellcaster"],
	[OcgRace.FAIRY, "fairy"],
	[OcgRace.FIEND, "fiend"],
	[OcgRace.ZOMBIE, "zombie"],
	[OcgRace.MACHINE, "machine"],
	[OcgRace.AQUA, "aqua"],
	[OcgRace.PYRO, "pyro"],
	[OcgRace.ROCK, "rock"],
	[OcgRace.WINGEDBEAST, "winged_beast"],
	[OcgRace.PLANT, "plant"],
	[OcgRace.INSECT, "insect"],
	[OcgRace.THUNDER, "thunder"],
	[OcgRace.DRAGON, "dragon"],
	[OcgRace.BEAST, "beast"],
	[OcgRace.BEASTWARRIOR, "beast_warrior"],
	[OcgRace.DINOSAUR, "dinosaur"],
	[OcgRace.FISH, "fish"],
	[OcgRace.SEASERPENT, "sea_serpent"],
	[OcgRace.REPTILE, "reptile"],
	[OcgRace.PSYCHIC, "psychic"],
	[OcgRace.DIVINE, "divine"],
	[OcgRace.CREATORGOD, "creator_god"],
	[OcgRace.WYRM, "wyrm"],
	[OcgRace.CYBERSE, "cyberse"],
	[OcgRace.ILLUSION, "illusion"],
	[OcgRace.CYBORG, "cyborg"],
	[OcgRace.MAGICALKNIGHT, "magical_knight"],
	[OcgRace.HIGHDRAGON, "high_dragon"],
	[OcgRace.OMEGAPSYCHIC, "omega_psychic"],
	[OcgRace.CELESTIALWARRIOR, "celestial_warrior"],
	[OcgRace.GALAXY, "galaxy"]
]);
/**
* Convert a {@link (OcgLinkMarker:type)} to its string representation.
*/
const ocgLinkMarkerString = makeMap([
	[OcgLinkMarker.BOTTOM_LEFT, "bottom_left"],
	[OcgLinkMarker.BOTTOM, "bottom"],
	[OcgLinkMarker.BOTTOM_RIGHT, "bottom_right"],
	[OcgLinkMarker.LEFT, "left"],
	[OcgLinkMarker.RIGHT, "right"],
	[OcgLinkMarker.TOP_LEFT, "top_left"],
	[OcgLinkMarker.TOP, "top"],
	[OcgLinkMarker.TOP_RIGHT, "top_right"]
]);
/**
* Convert a {@link (OcgRPS:type)} to its string representation.
*/
const ocgRPSString = makeMap([
	[OcgRPS.SCISSORS, "scissors"],
	[OcgRPS.ROCK, "rock"],
	[OcgRPS.PAPER, "paper"]
]);
/**
* Convert a {@link (OcgDuelMode:type)} to its string representation.
*/
const ocgDuelModeString = makeMap([
	[OcgDuelMode.TEST_MODE, "test_mode"],
	[OcgDuelMode.ATTACK_FIRST_TURN, "attack_first_turn"],
	[OcgDuelMode.USE_TRAPS_IN_NEW_CHAIN, "use_traps_in_new_chain"],
	[OcgDuelMode.SIX_STEP_BATLLE_STEP, "six_step_batlle_step"],
	[OcgDuelMode.PSEUDO_SHUFFLE, "pseudo_shuffle"],
	[OcgDuelMode.TRIGGER_WHEN_PRIVATE_KNOWLEDGE, "trigger_when_private_knowledge"],
	[OcgDuelMode.SIMPLE_AI, "simple_ai"],
	[OcgDuelMode.RELAY, "relay"],
	[OcgDuelMode.OBSOLETE_IGNITION, "obsolete_ignition"],
	[OcgDuelMode.FIRST_TURN_DRAW, "first_turn_draw"],
	[OcgDuelMode.ONE_FACEUP_FIELD, "one_faceup_field"],
	[OcgDuelMode.PZONE, "pzone"],
	[OcgDuelMode.SEPARATE_PZONE, "separate_pzone"],
	[OcgDuelMode.EMZONE, "emzone"],
	[OcgDuelMode.FSX_MMZONE, "fsx_mmzone"],
	[OcgDuelMode.TRAP_MONSTERS_NOT_USE_ZONE, "trap_monsters_not_use_zone"],
	[OcgDuelMode.RETURN_TO_DECK_TRIGGERS, "return_to_extra_deck_triggers"],
	[OcgDuelMode.TRIGGER_ONLY_IN_LOCATION, "trigger_only_in_location"],
	[OcgDuelMode.SPSUMMON_ONCE_OLD_NEGATE, "spsummon_once_old_negate"],
	[OcgDuelMode.CANNOT_SUMMON_OATH_OLD, "cannot_summon_oath_old"],
	[OcgDuelMode.NO_STANDBY_PHASE, "no_standby_phase"],
	[OcgDuelMode.NO_MAIN_PHASE_2, "no_main_phase_2"],
	[OcgDuelMode.THREE_COLUMNS_FIELD, "three_columns_field"],
	[OcgDuelMode.DRAW_UNTIL_5, "draw_until_5"],
	[OcgDuelMode.NO_HAND_LIMIT, "no_hand_limit"],
	[OcgDuelMode.UNLIMITED_SUMMONS, "unlimited_summons"],
	[OcgDuelMode.INVERTED_QUICK_PRIORITY, "inverted_quick_priority"],
	[OcgDuelMode.EQUIP_NOT_SENT_IF_MISSING_TARGET, "equip_not_sent_if_missing_target"],
	[OcgDuelMode.ZERO_ATK_DESTROYED, "zero_atk_destroyed"],
	[OcgDuelMode.STORE_ATTACK_REPLAYS, "store_attack_replays"],
	[OcgDuelMode.SINGLE_CHAIN_IN_DAMAGE_SUBSTEP, "single_chain_in_damage_substep"],
	[OcgDuelMode.CAN_REPOS_IF_NON_SUMPLAYER, "can_repos_if_non_sumplayer"],
	[OcgDuelMode.TCG_SEGOC_NONPUBLIC, "tcg_segoc_nonpublic"],
	[OcgDuelMode.TCG_SEGOC_FIRSTTRIGGER, "tcg_segoc_firsttrigger"],
	[OcgDuelMode.MODE_SPEED, "mode_speed"],
	[OcgDuelMode.MODE_RUSH, "mode_rush"],
	[OcgDuelMode.MODE_GOAT, "mode_goat"],
	[OcgDuelMode.MODE_MR2, "mode_mr2"],
	[OcgDuelMode.MODE_MR3, "mode_mr3"],
	[OcgDuelMode.MODE_MR4, "mode_mr4"],
	[OcgDuelMode.MODE_MR5, "mode_mr5"]
]);
/**
* Convert a {@link (OcgLogType:type)} to its string representation.
*/
const ocgLogTypeString = makeMap([
	[OcgLogType.ERROR, "error"],
	[OcgLogType.FROM_SCRIPT, "from_script"],
	[OcgLogType.FOR_DEBUG, "for_debug"],
	[OcgLogType.UNDEFINED, "undefined"]
]);
/**
* Convert a {@link (OcgPhase:type)} to its string representation.
*/
const ocgPhaseString = makeMap([
	[OcgPhase.DRAW, "draw"],
	[OcgPhase.STANDBY, "standby"],
	[OcgPhase.MAIN1, "main1"],
	[OcgPhase.BATTLE_START, "battle_start"],
	[OcgPhase.BATTLE_STEP, "battle_step"],
	[OcgPhase.DAMAGE, "damage"],
	[OcgPhase.DAMAGE_CAL, "damage_cal"],
	[OcgPhase.BATTLE, "battle"],
	[OcgPhase.MAIN2, "main2"],
	[OcgPhase.END, "end"]
]);
/**
* Convert a {@link (OcgHintType:type)} to its string representation.
*/
const ocgHintString = makeMap([
	[OcgHintType.EVENT, "event"],
	[OcgHintType.MESSAGE, "message"],
	[OcgHintType.SELECTMSG, "selectmsg"],
	[OcgHintType.OPSELECTED, "opselected"],
	[OcgHintType.EFFECT, "effect"],
	[OcgHintType.RACE, "race"],
	[OcgHintType.ATTRIB, "attrib"],
	[OcgHintType.CODE, "code"],
	[OcgHintType.NUMBER, "number"],
	[OcgHintType.CARD, "card"],
	[OcgHintType.ZONE, "zone"]
]);
/**
* Convert a {@link (OcgHintTiming:type)} to its string representation.
*/
const ocgHintTimingString = makeMap([
	[OcgHintTiming.DRAW_PHASE, "draw_phase"],
	[OcgHintTiming.STANDBY_PHASE, "standby_phase"],
	[OcgHintTiming.MAIN_END, "main_end"],
	[OcgHintTiming.BATTLE_START, "battle_start"],
	[OcgHintTiming.BATTLE_END, "battle_end"],
	[OcgHintTiming.END_PHASE, "end_phase"],
	[OcgHintTiming.SUMMON, "summon"],
	[OcgHintTiming.SPSUMMON, "spsummon"],
	[OcgHintTiming.FLIPSUMMON, "flipsummon"],
	[OcgHintTiming.MSET, "mset"],
	[OcgHintTiming.SSET, "sset"],
	[OcgHintTiming.POS_CHANGE, "pos_change"],
	[OcgHintTiming.ATTACK, "attack"],
	[OcgHintTiming.DAMAGE_STEP, "damage_step"],
	[OcgHintTiming.DAMAGE_CAL, "damage_cal"],
	[OcgHintTiming.CHAIN_END, "chain_end"],
	[OcgHintTiming.DRAW, "draw"],
	[OcgHintTiming.DAMAGE, "damage"],
	[OcgHintTiming.RECOVER, "recover"],
	[OcgHintTiming.DESTROY, "destroy"],
	[OcgHintTiming.REMOVE, "remove"],
	[OcgHintTiming.TOHAND, "tohand"],
	[OcgHintTiming.TODECK, "todeck"],
	[OcgHintTiming.TOGRAVE, "tograve"],
	[OcgHintTiming.BATTLE_PHASE, "battle_phase"],
	[OcgHintTiming.EQUIP, "equip"],
	[OcgHintTiming.BATTLE_STEP_END, "battle_step_end"],
	[OcgHintTiming.BATTLED, "battled"]
]);
//#endregion
//#region vendor/ocgcore/src/opcodes.ts
/** Available Opcodes, any value that isn't a Opcode is added to the stack. */
const OcgOpCode = {
	/** stack in: ... (A) (B); stack out: ... (A + B) */
	ADD: 4611686018427387904n,
	/** stack in: ... (A) (B); stack out: ... (A - B) */
	SUB: 4611686022722355200n,
	/** stack in: ... (A) (B); stack out: ... (A * B) */
	MUL: 4611686027017322496n,
	/** stack in: ... (A) (B); stack out: ... (A / B) */
	DIV: 4611686031312289792n,
	/** stack in: ... (A) (B); stack out: ... (A && B) */
	AND: 4611686035607257088n,
	/** stack in: ... (A) (B); stack out: ... (A || B) */
	OR: 4611686039902224384n,
	/** stack in: ... (A); stack out: ... (-A) */
	NEG: 4611686044197191680n,
	/** stack in: ... (A); stack out: ... (!A) */
	NOT: 4611686048492158976n,
	/** stack in: ... (A) (B); stack out: ... (A & B) */
	BAND: 4611686052787126272n,
	/** stack in: ... (A) (B); stack out: ... (A | B) */
	BOR: 4611686057082093568n,
	/** stack in: ... (A); stack out: ... (~A) */
	BNOT: 4611686087146864640n,
	/** stack in: ... (A) (B); stack out: ... (A ^ B) */
	BXOR: 4611686091441831936n,
	/** stack in: ... (A) (B); stack out: ... (A \<\< B) */
	LSHIFT: 4611686095736799232n,
	/** stack in: ... (A) (B); stack out: ... (A \>\> B) */
	RSHIFT: 4611686100031766528n,
	/** stack in: ...; stack out: ... */
	ALLOW_ALIASES: 4611686104326733824n,
	/** stack in: ...; stack out: ... */
	ALLOW_TOKENS: 4611686108621701120n,
	/** stack in: ... (A); stack out: ... (A == code) */
	ISCODE: 4611687117939015680n,
	/** stack in: ... (A); stack out: ... (setcodes includes A) */
	ISSETCARD: 4611687122233982976n,
	/** stack in: ... (A); stack out: ... (A == type) */
	ISTYPE: 4611687126528950272n,
	/** stack in: ... (A); stack out: ... (A == race) */
	ISRACE: 4611687130823917568n,
	/** stack in: ... (A); stack out: ... (A == attribute) */
	ISATTRIBUTE: 4611687135118884864n,
	/** stack in: ...; stack out: ... (code) */
	GETCODE: 4611687139413852160n,
	/** @deprecated Does nothing. */
	GETSETCARD: 4611687143708819456n,
	/** stack in: ...; stack out: ... (type) */
	GETTYPE: 4611687148003786752n,
	/** stack in: ...; stack out: ... (race) */
	GETRACE: 4611687152298754048n,
	/** stack in: ...; stack out: ... (attribute) */
	GETATTRIBUTE: 4611687156593721344n
};
/**
* Convert a {@link (OcgOpCode:type)} to its string representation.
*/
const ocgOpCodeString = makeMap([
	[OcgOpCode.ADD, "add"],
	[OcgOpCode.SUB, "sub"],
	[OcgOpCode.MUL, "mul"],
	[OcgOpCode.DIV, "div"],
	[OcgOpCode.AND, "and"],
	[OcgOpCode.OR, "or"],
	[OcgOpCode.NEG, "neg"],
	[OcgOpCode.NOT, "not"],
	[OcgOpCode.BAND, "band"],
	[OcgOpCode.BOR, "bor"],
	[OcgOpCode.BNOT, "bnot"],
	[OcgOpCode.BXOR, "bxor"],
	[OcgOpCode.LSHIFT, "lshift"],
	[OcgOpCode.RSHIFT, "rshift"],
	[OcgOpCode.ALLOW_ALIASES, "allow_aliases"],
	[OcgOpCode.ALLOW_TOKENS, "allow_tokens"],
	[OcgOpCode.ISCODE, "iscode"],
	[OcgOpCode.ISSETCARD, "issetcard"],
	[OcgOpCode.ISTYPE, "istype"],
	[OcgOpCode.ISRACE, "israce"],
	[OcgOpCode.ISATTRIBUTE, "isattribute"],
	[OcgOpCode.GETCODE, "getcode"],
	[OcgOpCode.GETSETCARD, "getsetcard"],
	[OcgOpCode.GETTYPE, "gettype"],
	[OcgOpCode.GETRACE, "getrace"],
	[OcgOpCode.GETATTRIBUTE, "getattribute"]
]);
/**
* Utility function to check if the specified card matches the opcode sequence.
* @param card - The card to check against
* @param opcodes - The opcode sequence
*/
function cardMatchesOpcode(card, opcodes) {
	const stack = [];
	let alias = false;
	let token = false;
	for (const opcode of opcodes) switch (opcode) {
		case OcgOpCode.ADD:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs + rhs));
			}
			break;
		case OcgOpCode.SUB:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs - rhs));
			}
			break;
		case OcgOpCode.MUL:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs * rhs));
			}
			break;
		case OcgOpCode.DIV:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs / rhs));
			}
			break;
		case OcgOpCode.AND:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(lhs != 0n && rhs != 0n ? 1n : 0n);
			}
			break;
		case OcgOpCode.OR:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(lhs != 0n || rhs != 0n ? 1n : 0n);
			}
			break;
		case OcgOpCode.NEG:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push(BigInt.asIntN(64, -val));
			}
			break;
		case OcgOpCode.NOT:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push(val != 0n ? 0n : 1n);
			}
			break;
		case OcgOpCode.BAND:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs & rhs));
			}
			break;
		case OcgOpCode.BOR:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs | rhs));
			}
			break;
		case OcgOpCode.BNOT:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push(BigInt.asIntN(64, ~val));
			}
			break;
		case OcgOpCode.BXOR:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs ^ rhs));
			}
			break;
		case OcgOpCode.LSHIFT:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs << rhs));
			}
			break;
		case OcgOpCode.RSHIFT:
			if (stack.length >= 2) {
				const rhs = stack.pop();
				const lhs = stack.pop();
				stack.push(BigInt.asIntN(64, lhs >> rhs));
			}
			break;
		case OcgOpCode.ALLOW_ALIASES:
			alias = true;
			break;
		case OcgOpCode.ALLOW_TOKENS:
			token = true;
			break;
		case OcgOpCode.ISCODE:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push(BigInt(card.code) == val ? 1n : 0n);
			}
			break;
		case OcgOpCode.ISSETCARD:
			if (stack.length >= 1) {
				const val = Number(stack.pop());
				const setType = val & 4095;
				const setSubType = val & 61440;
				let ret = 0n;
				for (const set of card.setcodes) if ((set & 4095) == setType && (set & 61440 & setSubType) == setSubType) {
					ret = 1n;
					break;
				}
				stack.push(ret);
			}
			break;
		case OcgOpCode.ISTYPE:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push((BigInt(card.type) & val) != 0n ? 1n : 0n);
			}
			break;
		case OcgOpCode.ISRACE:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push((card.race & val) != 0n ? 1n : 0n);
			}
			break;
		case OcgOpCode.ISATTRIBUTE:
			if (stack.length >= 1) {
				const val = stack.pop();
				stack.push((BigInt(card.attribute) & val) != 0n ? 1n : 0n);
			}
			break;
		case OcgOpCode.GETCODE:
			stack.push(BigInt(card.code));
			break;
		case OcgOpCode.GETTYPE:
			stack.push(BigInt(card.type));
			break;
		case OcgOpCode.GETRACE:
			stack.push(card.race);
			break;
		case OcgOpCode.GETATTRIBUTE:
			stack.push(BigInt(card.attribute));
			break;
		default: stack.push(opcode);
	}
	if (stack.length != 1 || stack[0] == 0n) return false;
	if (card.code == cardMarineDolphin || card.code == cardTwinkleMoss) return true;
	if (!alias && card.alias != 0) return false;
	if (!token) return (card.type & (OcgType.MONSTER | OcgType.TOKEN)) != (OcgType.MONSTER | OcgType.TOKEN);
	return true;
}
const cardMarineDolphin = 78734254;
const cardTwinkleMoss = 13857930;
//#endregion
//#region vendor/ocgcore/src/index.ts
/** Types de messages déjà signalés comme mal lus (un seul avertissement par type). */
const reportedShort = /* @__PURE__ */ new Set();
/**
* Instantiate the basic interface to use ocgcore.
* @param options - Options
*/
async function createCore(init) {
	if (!(init?.sync ?? false)) throw new Error("ocgcore : seule la variante synchrone est embarquée, appeler createCore({ sync: true })");
	return await createCoreSync(init ?? {});
}
function allocateSetCodes(m, setcodes) {
	const setCodesArr = new Uint16Array([...setcodes, 0]);
	const setCodes = m._malloc(setCodesArr.byteLength);
	copyArray(heapAt(m.HEAP8), setCodesArr, setCodes);
	return setCodes;
}
async function createCoreSync({ ...init }) {
	const shouldImportWasm = !init.wasmBinary && !init.locateFile;
	const [factory, wasmBinary] = await Promise.all([importFactorySync(), shouldImportWasm ? importWasmSync() : init.wasmBinary]);
	if (wasmBinary) init.wasmBinary = wasmBinary;
	let lastCallbackId = 0;
	const callbacks = /* @__PURE__ */ new Map();
	let m = void 0;
	const heap = (offset, length) => heapAt(m.HEAP8, offset, length);
	m = await factory({
		...createImportMethodsBase(callbacks),
		...init,
		handleDataReader(payload, code, data) {
			const { cardReader } = callbacks.get(payload);
			const cardData = cardReader(code);
			const setCodes = cardData?.setcodes.length ? allocateSetCodes(m, cardData.setcodes) : 0;
			writeCardData(heap(data), {
				ptrSize: 4,
				...cardData,
				setcodes: setCodes
			});
		},
		handleScriptReader(payload, duel, name) {
			const { scriptReader } = callbacks.get(payload);
			return scriptReader(name);
		}
	});
	return {
		...createMethodsBase(m),
		createDuel(options) {
			const callback = ++lastCallbackId;
			callbacks.set(callback, {
				cardReader: options.cardReader,
				errorHandler: options.errorHandler,
				scriptReader: options.scriptReader
			});
			const stack = m.stackSave();
			const duelPtr = m.stackAlloc(4);
			const buf = m.stackAlloc(104);
			writeDuelOptions(heap(buf), {
				...options,
				ptrSize: 4,
				cardReader: 0,
				cardReaderPayload: callback,
				cardReaderDone: 0,
				cardReaderDonePayload: 0,
				errorHandler: 0,
				errorHandlerPayload: callback,
				scriptReader: 0,
				scriptReaderPayload: callback,
				enableUnsafeLibraries: true
			});
			if (m._ocgapiCreateDuel(duelPtr, buf) != 0) return null;
			const duelHandle = m.getValue(duelPtr, "i32");
			m.stackRestore(stack);
			return { [DuelHandleSymbol]: duelHandle };
		},
		duelNewCard({ [DuelHandleSymbol]: handle }, cardInfo) {
			const stack = m.stackSave();
			const buf = m.stackAlloc(24);
			writeNewCardInfo(heap(buf), cardInfo);
			m._ocgapiDuelNewCard(handle, buf);
			m.stackRestore(stack);
		},
		startDuel({ [DuelHandleSymbol]: handle }) {
			m._ocgapiStartDuel(handle);
		},
		duelProcess({ [DuelHandleSymbol]: handle }) {
			return m._ocgapiDuelProcess(handle);
		},
		loadScript({ [DuelHandleSymbol]: handle }, name, content) {
			const stack = m.stackSave();
			const contentLength = m.lengthBytesUTF8(content);
			const contentPtr = m._malloc(contentLength + 1);
			m.stringToUTF8(content, contentPtr, contentLength + 1);
			const nameLength = m.lengthBytesUTF8(name);
			const namePtr = m.stackAlloc(nameLength + 1);
			m.stringToUTF8(name, namePtr, nameLength + 1);
			try {
				return m._ocgapiLoadScript(handle, contentPtr, contentLength, namePtr) == 1;
			} finally {
				m._free(contentPtr);
				m.stackRestore(stack);
			}
		}
	};
}
function createImportMethodsBase(callbacks) {
	return {
		print(str) {
			console.log(str);
		},
		printErr(str) {
			console.error(str);
		},
		handleLogHandler(payload, message, type) {
			const { errorHandler } = callbacks.get(payload);
			errorHandler?.(type, message);
		}
	};
}
function createMethodsBase(m) {
	const heap = (offset, length) => heapAt(m.HEAP8, offset, length);
	return {
		getVersion() {
			const stack = m.stackSave();
			const majorPtr = m.stackAlloc(4);
			const minorPtr = m.stackAlloc(4);
			m.getValue(majorPtr, "i32");
			try {
				m._ocgapiGetVersion(majorPtr, minorPtr);
				return [m.getValue(majorPtr, "i32"), m.getValue(minorPtr, "i32")];
			} finally {
				m.stackRestore(stack);
			}
		},
		destroyDuel({ [DuelHandleSymbol]: handle }) {
			m._ocgapiDestroyDuel(handle);
		},
		duelGetMessage({ [DuelHandleSymbol]: handle }) {
			const stack = m.stackSave();
			const lenPtr = m.stackAlloc(4);
			const buffer = m._ocgapiDuelGetMessage(handle, lenPtr);
			const bufferLength = m.getValue(lenPtr, "i32");
			m.stackRestore(stack);
			const reader = new BufferReader(new DataView(m.HEAP8.buffer, buffer, bufferLength));
			const messages = [];
			while (reader.avail > 0) {
				const length = reader.i32();
				const subReader = reader.sub(length);
				let message = null;
				subReader.reset();
				try {
					message = readMessage(subReader);
				} catch (err) {
					subReader.reset();
					const bytes = Array.from({ length: Math.min(length, 96) }, () => subReader.u8().toString(16).padStart(2, "0")).join(" ");
					console.warn(`[ocgcore] message illisible (${err.message}) : ${bytes}`);
					continue;
				}
				if (message && subReader.avail !== 0 && !reportedShort.has(message.type)) {
					reportedShort.add(message.type);
					const rest = subReader.avail;
					subReader.reset();
					const bytes = Array.from({ length: Math.min(length, 120) }, () => subReader.u8().toString(16).padStart(2, "0")).join(" ");
					console.warn(`[ocgcore] message ${message.type} : ${rest} octet(s) non lus sur ${length} : ${bytes}`);
				}
				if (!message) {
					console.warn(`failed to parse a message: ${subReader.u8()}`);
					continue;
				}
				messages.push(message);
			}
			return messages;
		},
		duelSetResponse({ [DuelHandleSymbol]: handle }, response) {
			const buffer = createResponse(response);
			const stack = m.stackSave();
			const bufferPtr = m.stackAlloc(buffer.length);
			m.HEAPU8.set(buffer, bufferPtr);
			try {
				m._ocgapiDuelSetResponse(handle, bufferPtr, buffer.length);
			} finally {
				m.stackRestore(stack);
			}
		},
		duelQueryCount({ [DuelHandleSymbol]: handle }, team, location) {
			return m._ocgapiDuelQueryCount(handle, team, location);
		},
		duelQuery({ [DuelHandleSymbol]: handle }, query) {
			const queryBuffer = new BufferWriter(24, true);
			queryBuffer.u32(query.flags);
			queryBuffer.u8(query.controller);
			queryBuffer.u32(query.location);
			queryBuffer.u32(query.sequence);
			queryBuffer.u32(query.overlaySequence ?? 0);
			const stack = m.stackSave();
			try {
				const queryData = queryBuffer.get(4);
				const queryPtr = m.stackAlloc(queryData.byteLength);
				m.HEAP8.set(queryData, queryPtr);
				const lenPtr = m.stackAlloc(4);
				const buffer = m._ocgapiDuelQuery(handle, lenPtr, queryPtr);
				const bufferLength = m.getValue(lenPtr, "i32");
				return readQuery(new BufferReader(heap(buffer, bufferLength)));
			} finally {
				m.stackRestore(stack);
			}
		},
		duelQueryLocation({ [DuelHandleSymbol]: handle }, query) {
			const queryBuffer = new BufferWriter(24, true);
			queryBuffer.u32(query.flags);
			queryBuffer.u8(query.controller);
			queryBuffer.u32(query.location);
			queryBuffer.u32(0);
			queryBuffer.u32(0);
			const stack = m.stackSave();
			try {
				const queryData = queryBuffer.get(4);
				const queryPtr = m.stackAlloc(queryData.byteLength);
				m.HEAP8.set(queryData, queryPtr);
				const lenPtr = m.stackAlloc(4);
				const buffer = m._ocgapiDuelQueryLocation(handle, lenPtr, queryPtr);
				const bufferLength = m.getValue(lenPtr, "i32");
				return readQueryLocation(new BufferReader(heap(buffer, bufferLength)));
			} finally {
				m.stackRestore(stack);
			}
		},
		duelQueryField({ [DuelHandleSymbol]: handle }) {
			const stack = m.stackSave();
			try {
				const lenPtr = m.stackAlloc(4);
				const buffer = m._ocgapiDuelQueryField(handle, lenPtr);
				const bufferLength = m.getValue(lenPtr, "i32");
				return readField(new BufferReader(heap(buffer, bufferLength)));
			} finally {
				m.stackRestore(stack);
			}
		}
	};
}
function heapAt(heap, offset = 0, length = -1) {
	return new DataView(heap.buffer, heap.byteOffset + offset, length < 0 ? heap.length - offset : length);
}
function copyArray(view, x, off) {
	if (x instanceof Uint16Array) x.forEach((v, i) => view.setUint16(off + i * 2, v, true));
	else if (x instanceof Uint32Array) x.forEach((v, i) => view.setUint32(off + i * 4, v, true));
	else if (x instanceof BigUint64Array) x.forEach((v, i) => view.setBigUint64(off + i * 4, v, true));
	else if (x instanceof Int16Array) x.forEach((v, i) => view.setInt16(off + i * 2, v, true));
	else if (x instanceof Int32Array) x.forEach((v, i) => view.setInt32(off + i * 4, v, true));
	else if (x instanceof BigInt64Array) x.forEach((v, i) => view.setBigInt64(off + i * 4, v, true));
}
async function importFactorySync() {
	return (await import("../lib/ocgcore.sync.mjs")).default;
}
async function importWasmSync() {
	const { readFile } = await import("node:fs/promises");
	const bin = await readFile(new URL("../lib/ocgcore.sync.wasm", import.meta.url));
	return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}
//#endregion
export { OcgAttribute, OcgCardHintType, OcgDuelMode, OcgEffectClientMode, OcgHintTiming, OcgHintType, OcgLinkMarker, OcgLocation, OcgLogType, OcgMessageType, OcgOpCode, OcgPhase, OcgPlayerHintType, OcgPosition, OcgProcessResult, OcgQueryFlags, OcgRPS, OcgRace, OcgResponseType, OcgScope, OcgType, SelectBattleCMDAction, SelectIdleCMDAction, cardMatchesOpcode, createCore as default, ocgAttributeParse, ocgAttributeString, ocgCardHintTypeStrings, ocgDuelModeParse, ocgDuelModeString, ocgEffectClientModeStrings, ocgHintString, ocgHintTimingParse, ocgHintTimingString, ocgLinkMarkerParse, ocgLinkMarkerString, ocgLocationString, ocgLogTypeString, ocgMessageTypeStrings, ocgOpCodeString, ocgPhaseString, ocgPlayerHintTypeStrings, ocgPositionParse, ocgPositionString, ocgProcessResultString, ocgQueryFlagsString, ocgRPSString, ocgRaceParse, ocgRaceString, ocgScopeString, ocgTypeParse, ocgTypeString, responseTypeStrings, selectBattleCMDActionStrings, selectIdleCMDActionStrings };
