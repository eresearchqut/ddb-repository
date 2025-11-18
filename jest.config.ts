import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    collectCoverage: false, // Set to true by default if you want coverage on every run
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/*.interface.ts',
        '!src/**/index.ts', // Typically just exports, can be excluded
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text',           // Console output
        'text-summary',   // Summary in console
        'html',          // HTML report in coverage/
        'lcov',          // For CI/CD tools
        'json',          // JSON format
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    verbose: true,
    testTimeout: 60000
};

export default config;