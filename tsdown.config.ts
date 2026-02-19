import {defineConfig} from 'tsdown'

export default defineConfig({
    entry: ['src/index.ts'],
    sourcemap: true,
    dts: true,
    clean: true,
    format: ['cjs', 'esm'],
    target: false,
    external: ['@smithy/types']
})