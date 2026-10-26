import { BufferReader } from "./internal/buffer";
import { OcgCardQueryInfo, OcgFieldState } from "./types";
export declare function readQuery(reader: BufferReader): Partial<OcgCardQueryInfo> | null;
export declare function readQueryLocation(reader: BufferReader): (Partial<OcgCardQueryInfo> | null)[];
export declare function readField(reader: BufferReader): OcgFieldState;
