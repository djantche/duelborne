import { OcgCardData, OcgDuelOptions, OcgNewCardInfo } from "./types";
type OcgCardDataPointers = {
    ptrSize: 8;
    setcodes?: bigint;
} | {
    ptrSize: 4;
    setcodes?: number;
};
export declare function writeCardData(view: DataView, data: Partial<Omit<OcgCardData, "setcodes">> & OcgCardDataPointers): void;
type OcgDuelCallbackOptions = {
    ptrSize: 8;
    cardReader: bigint;
    cardReaderPayload: bigint;
    scriptReader: bigint;
    scriptReaderPayload: bigint;
    errorHandler: bigint;
    errorHandlerPayload: bigint;
    cardReaderDone: bigint;
    cardReaderDonePayload: bigint;
} | {
    ptrSize: 4;
    cardReader: number;
    cardReaderPayload: number;
    scriptReader: number;
    scriptReaderPayload: number;
    errorHandler: number;
    errorHandlerPayload: number;
    cardReaderDone: number;
    cardReaderDonePayload: number;
};
export declare function writeDuelOptions(view: DataView, options: Omit<OcgDuelOptions, "cardReader" | "scriptReader" | "errorHandler"> & {
    enableUnsafeLibraries: boolean;
} & OcgDuelCallbackOptions): void;
export declare function writeNewCardInfo(view: DataView, data: OcgNewCardInfo): void;
export {};
