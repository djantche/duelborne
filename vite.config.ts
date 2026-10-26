import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/client'),
  build: { outDir: path.resolve(import.meta.dirname, 'dist/client'), emptyOutDir: true },
})
