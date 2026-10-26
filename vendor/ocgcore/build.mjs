// Reconstruit dist/ à partir de src/ : un bundle ESM pour Node + les déclarations de types.
//   npm run build:ocgcore
// dist/ est versionné : inutile de reconstruire tant que src/ ne change pas.
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { build } from 'rolldown'

const here = import.meta.dirname
rmSync(path.join(here, 'dist'), { recursive: true, force: true })

await build({
  input: path.join(here, 'src/index.ts'),
  platform: 'node',
  // La glue Emscripten et le binaire wasm restent dans lib/, chargés à l'exécution.
  external: [/ocgcore\.sync\.mjs$/],
  output: { file: path.join(here, 'dist/index.js'), format: 'esm' },
})

execFileSync(process.execPath, [path.resolve(here, '../../node_modules/typescript/bin/tsc'), '-p', here], { stdio: 'inherit' })
console.log('vendor/ocgcore/dist reconstruit.')
