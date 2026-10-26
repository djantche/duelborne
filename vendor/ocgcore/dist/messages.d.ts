import { BufferReader } from "./internal/buffer";
import { OcgLocPos, OcgMessage } from "./type_message";
export declare function parseInfoLocation(reader: BufferReader): OcgLocPos;
export declare function isInfoLocationEmpty(loc: OcgLocPos): false;
export declare function readMessage(reader: BufferReader): OcgMessage | null;
