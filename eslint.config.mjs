import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import jestPlugin from 'eslint-plugin-jest';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores([
        "node_modules/*",
        "dist/*",
    ])],
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ['test/**/*.ts', 'src/**/*.test.ts'],
        ...jestPlugin.configs['flat/recommended'],
        rules: {
            ...jestPlugin.configs['flat/recommended'].rules,
            'jest/no-conditional-expect': 'warn',
        },
    },
);