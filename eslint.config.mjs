// @ts-check
import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import * as importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default defineConfig({
    files: ['src/**/*.ts', '*.mjs'],
    languageOptions: {
        ecmaVersion: 2022,
        parserOptions: {
            projectService: {
                allowDefaultProject: ['*.mjs'],
            },
        },
    },
    plugins: {
        '@stylistic': stylistic,
        '@typescript-eslint': tseslint.plugin,
        'import': importPlugin,
    },
    extends: [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        eslint.configs.recommended,
        stylistic.configs.customize({
            braceStyle: '1tbs',
            indent: 4,
            semi: true,
        }),
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
        '@stylistic/array-bracket-newline': ['error', { multiline: true }],
        '@stylistic/comma-dangle': [
            'error',
            {
                arrays: 'always-multiline',
                objects: 'always-multiline',
                imports: 'always-multiline',
                exports: 'always-multiline',
                functions: 'never',
            },
        ],
        '@stylistic/function-call-argument-newline': ['error', 'consistent'],
        '@stylistic/function-paren-newline': ['error', 'multiline-arguments'],
        '@stylistic/implicit-arrow-linebreak': ['error', 'beside'],
        '@stylistic/lines-around-comment': ['error', { beforeLineComment: true, allowBlockStart: true }],
        '@stylistic/max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
        '@stylistic/spaced-comment': ['error', 'always', { exceptions: ['-'] }],
        '@stylistic/no-mixed-operators': [
            'error',
            {
                groups: [
                    ['%', '**'],
                    ['%', '+'],
                    ['%', '-'],
                    ['%', '*'],
                    ['%', '/'],
                    ['**', '+'],
                    ['**', '-'],
                    ['**', '*'],
                    ['**', '/'],
                    ['&', '|', '^', '~', '<<', '>>', '>>>'],
                    ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
                    ['&&', '||'],
                    ['in', 'instanceof'],
                ],
                allowSamePrecedence: false,
            },
        ],
        '@stylistic/operator-linebreak': [
            'error',
            'before',
            {
                overrides: {
                    '=': 'none',
                },
            },
        ],
        '@stylistic/padding-line-between-statements': [
            'error',
            { blankLine: 'always', prev: '*', next: ['class', 'function', 'export'] },
            { blankLine: 'never', prev: 'singleline-export', next: 'singleline-export' },
            { blankLine: 'always', prev: 'multiline-block-like', next: '*' },
        ],
        'import/order': [
            'error',
            {
                'groups': ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index'],
                'newlines-between': 'always',
                'alphabetize': {
                    order: 'asc',
                    caseInsensitive: true,
                },
                'pathGroups': [
                    {
                        pattern: 'vscode',
                        group: 'internal',
                        position: 'before',
                    },
                ],
                'pathGroupsExcludedImportTypes': ['vscode'],
            },
        ],
        'import/no-duplicates': 'error',
        'sort-imports': [
            'error',
            {
                ignoreCase: true,
                ignoreDeclarationSort: true,
                ignoreMemberSort: false,
                memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
            },
        ],
    },
});
