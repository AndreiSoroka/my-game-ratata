import js from '@eslint/js'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const productionSizeRules = {
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

const testSizeRules = {
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

const highConfidenceSecurityRules = {
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
}

const sourceFiles = ['apps/backend/src/**/*.ts', 'contracts/src/**/*.ts']
const testFiles = [
    'apps/backend/tests/**/*.ts',
    'apps/backend/src/**/*.{test,spec}.ts',
]
const tsFiles = [...sourceFiles, ...testFiles]

export default tseslint.config(
    {
        ignores: [
            '**/coverage/**',
            '**/dist/**',
            '**/node_modules/**',
            '**/playwright-report/**',
            '**/test-results/**',
        ],
    },
    {
        files: tsFiles,
        extends: [
            js.configs.recommended,
            ...tseslint.configs.strictTypeChecked,
            ...tseslint.configs.stylisticTypeChecked,
        ],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.es2024,
                Bun: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                URL: 'readonly',
                console: 'readonly',
            },
        },
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
        rules: {
            ...highConfidenceSecurityRules,
            '@typescript-eslint/array-type': [
                'error',
                { default: 'array-simple' },
            ],
            '@typescript-eslint/consistent-type-definitions': [
                'error',
                'interface',
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    disallowTypeAnnotations: false,
                    fixStyle: 'inline-type-imports',
                    prefer: 'type-imports',
                },
            ],
            '@typescript-eslint/no-confusing-void-expression': [
                'error',
                { ignoreArrowShorthand: true, ignoreVoidOperator: true },
            ],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/strict-boolean-expressions': [
                'error',
                {
                    allowNullableBoolean: false,
                    allowNullableNumber: false,
                    allowNullableObject: false,
                    allowNullableString: false,
                    allowNumber: false,
                    allowString: false,
                },
            ],
            curly: ['error', 'all'],
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
            'no-else-return': 'error',
            'no-implicit-coercion': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSEnumDeclaration',
                    message:
                        'Use literal unions or const objects instead of TypeScript enums.',
                },
            ],
            'no-return-await': 'error',
            'no-undef': 'off',
            'object-shorthand': ['error', 'always'],
            'prefer-const': ['error', { destructuring: 'all' }],
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'sort-imports': [
                'error',
                {
                    ignoreCase: true,
                    ignoreDeclarationSort: true,
                },
            ],
            ...productionSizeRules,
        },
    },
    {
        files: testFiles,
        rules: {
            ...testSizeRules,
        },
    }
)
