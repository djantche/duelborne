import { OcgCore, OcgCoreSync } from "./types";
/**
 * The initializer to create a core. If both {@link Initializer.locateFile} and
 * {@link Initializer.wasmBinary} are missing then it will be imported
 * automatically.
 */
export interface Initializer {
    /** Override the stdout print */
    print?(str: string): void;
    /** Override the stderr print */
    printErr?(str: string): void;
    /** {@link https://emscripten.org/docs/api_reference/module.html#Module.locateFile} */
    locateFile?(url: string, scriptDirectory: string): string;
    /** The binary of the wasm module */
    wasmBinary?: ArrayBuffer;
    /** Whether to use the sync interface or not. Defaults to false (async). */
    sync?: boolean;
}
/** Initializer for the async version */
export type InitializerAsync = Omit<Initializer, "sync"> & {
    sync?: false;
};
/** Initializer for the sync version */
export type InitializerSync = Omit<Initializer, "sync"> & {
    sync: true;
};
/**
 * Instantiate the basic interface to use ocgcore.
 * @param options - Options.
 */
export default function createCore(options?: InitializerAsync): Promise<OcgCore>;
export default function createCore(options: InitializerSync): Promise<OcgCoreSync>;
export * from "./opcodes";
export * from "./types";
export type { InternalMappedMap, InternalDepromisifyFunction, } from "./internal/utils";
