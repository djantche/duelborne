import { OcgCardData } from "./types";
/** Opcode for the stack based card announcing process, used in {@link OcgMessageAnnounceCard}. */
export type OcgOpCode = (typeof OcgOpCode)[keyof typeof OcgOpCode];
/** Available Opcodes, any value that isn't a Opcode is added to the stack. */
export declare const OcgOpCode: {
    /** stack in: ... (A) (B); stack out: ... (A + B) */
    ADD: bigint;
    /** stack in: ... (A) (B); stack out: ... (A - B) */
    SUB: bigint;
    /** stack in: ... (A) (B); stack out: ... (A * B) */
    MUL: bigint;
    /** stack in: ... (A) (B); stack out: ... (A / B) */
    DIV: bigint;
    /** stack in: ... (A) (B); stack out: ... (A && B) */
    AND: bigint;
    /** stack in: ... (A) (B); stack out: ... (A || B) */
    OR: bigint;
    /** stack in: ... (A); stack out: ... (-A) */
    NEG: bigint;
    /** stack in: ... (A); stack out: ... (!A) */
    NOT: bigint;
    /** stack in: ... (A) (B); stack out: ... (A & B) */
    BAND: bigint;
    /** stack in: ... (A) (B); stack out: ... (A | B) */
    BOR: bigint;
    /** stack in: ... (A); stack out: ... (~A) */
    BNOT: bigint;
    /** stack in: ... (A) (B); stack out: ... (A ^ B) */
    BXOR: bigint;
    /** stack in: ... (A) (B); stack out: ... (A \<\< B) */
    LSHIFT: bigint;
    /** stack in: ... (A) (B); stack out: ... (A \>\> B) */
    RSHIFT: bigint;
    /** stack in: ...; stack out: ... */
    ALLOW_ALIASES: bigint;
    /** stack in: ...; stack out: ... */
    ALLOW_TOKENS: bigint;
    /** stack in: ... (A); stack out: ... (A == code) */
    ISCODE: bigint;
    /** stack in: ... (A); stack out: ... (setcodes includes A) */
    ISSETCARD: bigint;
    /** stack in: ... (A); stack out: ... (A == type) */
    ISTYPE: bigint;
    /** stack in: ... (A); stack out: ... (A == race) */
    ISRACE: bigint;
    /** stack in: ... (A); stack out: ... (A == attribute) */
    ISATTRIBUTE: bigint;
    /** stack in: ...; stack out: ... (code) */
    GETCODE: bigint;
    /** @deprecated Does nothing. */
    GETSETCARD: bigint;
    /** stack in: ...; stack out: ... (type) */
    GETTYPE: bigint;
    /** stack in: ...; stack out: ... (race) */
    GETRACE: bigint;
    /** stack in: ...; stack out: ... (attribute) */
    GETATTRIBUTE: bigint;
};
/**
 * Convert a {@link (OcgOpCode:type)} to its string representation.
 */
export declare const ocgOpCodeString: import(".").InternalMappedMap<readonly [readonly [bigint, "add"], readonly [bigint, "sub"], readonly [bigint, "mul"], readonly [bigint, "div"], readonly [bigint, "and"], readonly [bigint, "or"], readonly [bigint, "neg"], readonly [bigint, "not"], readonly [bigint, "band"], readonly [bigint, "bor"], readonly [bigint, "bnot"], readonly [bigint, "bxor"], readonly [bigint, "lshift"], readonly [bigint, "rshift"], readonly [bigint, "allow_aliases"], readonly [bigint, "allow_tokens"], readonly [bigint, "iscode"], readonly [bigint, "issetcard"], readonly [bigint, "istype"], readonly [bigint, "israce"], readonly [bigint, "isattribute"], readonly [bigint, "getcode"], readonly [bigint, "getsetcard"], readonly [bigint, "gettype"], readonly [bigint, "getrace"], readonly [bigint, "getattribute"]]>;
/**
 * Utility function to check if the specified card matches the opcode sequence.
 * @param card - The card to check against
 * @param opcodes - The opcode sequence
 */
export declare function cardMatchesOpcode(card: OcgCardData, opcodes: OcgOpCode[]): boolean;
