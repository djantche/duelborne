import { OcgAttribute, OcgLocation, OcgPosition, OcgRace } from "./type_core";
/** Response type enum. */
export declare enum OcgResponseType {
    SELECT_BATTLECMD = 0,
    SELECT_IDLECMD = 1,
    SELECT_EFFECTYN = 2,
    SELECT_YESNO = 3,
    SELECT_OPTION = 4,
    SELECT_CARD = 5,
    SELECT_CARD_CODES = 6,
    SELECT_UNSELECT_CARD = 7,
    SELECT_CHAIN = 8,
    SELECT_DISFIELD = 9,
    SELECT_PLACE = 10,
    SELECT_POSITION = 11,
    SELECT_TRIBUTE = 12,
    SELECT_COUNTER = 13,
    SELECT_SUM = 14,
    SORT_CARD = 15,
    ANNOUNCE_RACE = 16,
    ANNOUNCE_ATTRIB = 17,
    ANNOUNCE_CARD = 18,
    ANNOUNCE_NUMBER = 19,
    ROCK_PAPER_SCISSORS = 20
}
/** Battle command enum, used in {@link OcgResponseSelectBattleCMD}. */
export declare enum SelectBattleCMDAction {
    SELECT_CHAIN = 0,
    SELECT_BATTLE = 1,
    TO_M2 = 2,
    TO_EP = 3
}
export type OcgResponseSelectBattleCMD = {
    type: OcgResponseType.SELECT_BATTLECMD;
    action: SelectBattleCMDAction;
    index: number | null;
};
/** Idle command enum, used in {@link OcgResponseSelectIdleCMD}. */
export declare enum SelectIdleCMDAction {
    SELECT_SUMMON = 0,
    SELECT_SPECIAL_SUMMON = 1,
    SELECT_POS_CHANGE = 2,
    SELECT_MONSTER_SET = 3,
    SELECT_SPELL_SET = 4,
    SELECT_ACTIVATE = 5,
    TO_BP = 6,
    TO_EP = 7,
    SHUFFLE = 8
}
export type OcgResponseSelectIdleCMD = {
    type: OcgResponseType.SELECT_IDLECMD;
    action: SelectIdleCMDAction;
    index: number | null;
};
export type OcgResponseSelectEffectYN = {
    type: OcgResponseType.SELECT_EFFECTYN;
    yes: boolean;
};
export type OcgResponseSelectYesNo = {
    type: OcgResponseType.SELECT_YESNO;
    yes: boolean;
};
export type OcgResponseSelectOption = {
    type: OcgResponseType.SELECT_OPTION;
    index: number;
};
export type OcgResponseSelectCard = {
    type: OcgResponseType.SELECT_CARD;
    indicies: number[] | null;
};
export type OcgResponseSelectCardCodes = {
    type: OcgResponseType.SELECT_CARD_CODES;
    codes: number[] | null;
};
export type OcgResponseSelectUnselectCard = {
    type: OcgResponseType.SELECT_UNSELECT_CARD;
    /**
     * If index is null: cancel the selection. If index is less then the length of
     * {@link OcgMessageSelectUnselectCard#select_cards}: select the card at the
     * specified index. Otherwise unselect a card of
     * {@link OcgMessageSelectUnselectCard#unselect_cards} at index -
     * {@link OcgMessageSelectUnselectCard#select_cards}.length
     */
    index: number | null;
};
export type SelectFieldPlace = {
    player: number;
    location: OcgLocation;
    sequence: number;
};
export type OcgResponseSelectChain = {
    type: OcgResponseType.SELECT_CHAIN;
    /**
     * If the index is null: cancel the selection. Otherwise chain the card
     * at that index from {@link OcgMessageSelectChain#selects}.
     */
    index: number | null;
};
export type OcgResponseSelectDisfield = {
    type: OcgResponseType.SELECT_DISFIELD;
    places: SelectFieldPlace[];
};
export type OcgResponseSelectPlace = {
    type: OcgResponseType.SELECT_PLACE;
    places: SelectFieldPlace[];
};
export type OcgResponseSelectPosition = {
    type: OcgResponseType.SELECT_POSITION;
    position: OcgPosition;
};
export type OcgResponseSelectTribute = {
    type: OcgResponseType.SELECT_TRIBUTE;
    indicies: number[] | null;
};
export type OcgResponseSelectCounter = {
    type: OcgResponseType.SELECT_COUNTER;
    counters: number[];
};
export type OcgResponseSelectSum = {
    type: OcgResponseType.SELECT_SUM;
    indicies: number[];
};
export type OcgResponseSortCard = {
    type: OcgResponseType.SORT_CARD;
    order: number[] | null;
};
export type OcgResponseAnnounceRace = {
    type: OcgResponseType.ANNOUNCE_RACE;
    races: OcgRace[];
};
export type OcgResponseAnnounceAttrib = {
    type: OcgResponseType.ANNOUNCE_ATTRIB;
    attributes: OcgAttribute[];
};
export type OcgResponseAnnounceCard = {
    type: OcgResponseType.ANNOUNCE_CARD;
    card: number;
};
export type OcgResponseAnnounceNumber = {
    type: OcgResponseType.ANNOUNCE_NUMBER;
    value: number;
};
export type OcgResponseRockPaperScissors = {
    type: OcgResponseType.ROCK_PAPER_SCISSORS;
    value: 1 | 2 | 3;
};
export type OcgResponse = OcgResponseSelectBattleCMD | OcgResponseSelectIdleCMD | OcgResponseSelectEffectYN | OcgResponseSelectYesNo | OcgResponseSelectOption | OcgResponseSelectCard | OcgResponseSelectCardCodes | OcgResponseSelectUnselectCard | OcgResponseSelectChain | OcgResponseSelectDisfield | OcgResponseSelectPlace | OcgResponseSelectPosition | OcgResponseSelectCounter | OcgResponseSelectSum | OcgResponseSelectTribute | OcgResponseSortCard | OcgResponseAnnounceRace | OcgResponseAnnounceAttrib | OcgResponseAnnounceCard | OcgResponseAnnounceNumber | OcgResponseRockPaperScissors;
