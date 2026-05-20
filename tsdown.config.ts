import {defineConfig} from 'tsdown'

export default defineConfig({
    entry: ['src/index.ts'],
    sourcemap: true,
    dts: true,
    clean: true,
    minify: false,
    format: ['cjs', 'esm'],
    target: false,
    exports: true,
    deps: { neverBundle: ['@smithy/types'] }
})