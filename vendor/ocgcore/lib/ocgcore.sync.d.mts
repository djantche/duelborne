// Glue Emscripten du moteur ocgcore compilé en WebAssembly (fichier généré). Typage minimal :
// seulement ce dont src/index.ts a besoin.
export interface OcgCoreModule {
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  stackSave(): number;
  stackRestore(ptr: number): void;
  stackAlloc(size: number): number;
  getValue<T extends string>(ptr: number, type: T): any;
  stringToUTF8(str: string, ptr: number, maxBytes: number): void;
  lengthBytesUTF8(str: string): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  [api: `_ocgapi${string}`]: (...args: any[]) => any;
}
declare const factory: (init: any) => Promise<OcgCoreModule>;
export default factory;
