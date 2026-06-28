import { fileURLToPath } from 'node:url'

import pluginVitest from '@vitest/eslint-plugin'
import {
    configureVueProject,
    defineConfigWithVueTs,
    vueTsConfigs,
} from '@vue/eslint-config-typescript'
import type { Linter } from 'eslint'
import { globalIgnores } from 'eslint/config'
import skipFormatting from 'eslint-config-prettier/flat'
import pluginOxlint from 'eslint-plugin-oxlint'
import pluginPlaywright from 'eslint-plugin-playwright'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import pluginVue from 'eslint-plugin-vue'

const appRootDir = fileURLToPath(new URL('.', import.meta.url))

configureVueProject({ rootDir: appRootDir })

const productionSizeRules: Linter.RulesRecord = {
    'max-lines': [
        'error',
        {
            max: 300,
            skipBlankLines: true,
            skipComments: true,
        },
    ],
    'max-lines-per-function': [
        'error',
        {
            max: 80,
            skipBlankLines: true,
            skipComments: true,
            IIFEs: true,
        },
    ],
    complexity: [
        'error',
        {
            max: 12,
        },
    ],
}

const testSizeRules: Linter.RulesRecord = {
    'max-lines': [
        'error',
        {
            max: 500,
            skipBlankLines: true,
            skipComments: true,
        },
    ],
    'max-lines-per-function': [
        'error',
        {
            max: 120,
            skipBlankLines: true,
            skipComments: true,
            IIFEs: true,
        },
    ],
    complexity: [
        'error',
        {
            max: 20,
        },
    ],
}

const highConfidenceSecurityRules: Linter.RulesRecord = {
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
}

const sharedQualityRules: Linter.RulesRecord = {
    ...highConfidenceSecurityRules,
    curly: ['error', 'all'],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-else-return': 'error',
    'no-implicit-coercion': 'error',
    'no-return-await': 'error',
    'object-shorthand': ['error', 'always'],
    'prefer-const': ['error', { destructuring: 'all' }],
    'simple-import-sort/exports': 'error',
    'simple-import-sort/imports': 'error',
    'sort-imports': [
        'error',
        {
            ignoreCase: true,
            ignoreDeclarationSort: true,
        },
    ],
}

export default defineConfigWithVueTs(
    {
        name: 'frontend/files-to-lint',
        files: ['**/*.{vue,ts,mts,tsx}'],
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
        rules: {
            ...productionSizeRules,
            ...sharedQualityRules,
        },
    },

    globalIgnores([
        '**/coverage/**',
        '**/dist/**',
        '**/dist-ssr/**',
        '**/node_modules/**',
        '**/playwright-report/**',
        '**/storybook-static/**',
        '**/test-results/**',
    ]),

    ...pluginVue.configs['flat/essential'],
    vueTsConfigs.recommended,

    {
        name: 'frontend/parser-root',
        files: ['**/*.{vue,ts,mts,tsx}'],
        languageOptions: {
            parserOptions: {
                tsconfigRootDir: appRootDir,
            },
        },
    },

    {
        ...pluginPlaywright.configs['flat/recommended'],
        files: ['e2e/**/*.{test,spec}.{js,ts,jsx,tsx}'],
        rules: {
            ...pluginPlaywright.configs['flat/recommended'].rules,
            ...testSizeRules,
        },
    },

    {
        ...pluginVitest.configs.recommended,
        files: ['src/**/__tests__/*', 'src/**/*.{test,spec}.{ts,mts,tsx}'],
        rules: {
            ...pluginVitest.configs.recommended.rules,
            ...testSizeRules,
        },
    },

    ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

    skipFormatting
)
