export declare class BufferReader {
    view: DataView;
    off: number;
    static from(b: ArrayBuffer): BufferReader;
    constructor(view: DataView, off?: number);
    get avail(): number;
    reset(): void;
    sub(length: number): BufferReader;
    bytes(length: number): Uint8Array<ArrayBuffer | SharedArrayBuffer>;
    u8(): number;
    i8(): number;
    u16(): number;
    i16(): number;
    u32(): number;
    i32(): number;
    u64(): bigint;
    i64(): bigint;
}
export declare class BufferWriter {
    buffer: Uint8Array;
    view: DataView;
    off: number;
    aligned: boolean;
    constructor(length?: number, aligned?: boolean);
    get(alignment?: number): Uint8Array<ArrayBuffer>;
    align(size: number): void;
    grow(toAdd: number): void;
    bytes(bytes: ArrayLike<number> | ArrayBuffer): void;
    u8(value: number): this;
    i8(value: number): this;
    u16(value: number): this;
    i16(value: number): this;
    u32(value: number): this;
    i32(value: number): this;
    u64(value: bigint): this;
    i64(value: bigint): this;
}
