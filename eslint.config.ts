import { GLOB_MARKDOWN_CODE, GLOB_TESTS } from '@antfu/eslint-config'
import { defineConfig } from '@importantimport/eslint-config'

export default defineConfig({
  vue: true,
}, [{
  rules: {
    '@masknet/no-builtin-base64': 'off',
    '@masknet/no-default-error': 'off',
    '@masknet/no-then': 'off',
    'antfu/import-dedupe': 'error',
    'func-style': 'off',
    'import/order': 'off',
    'perfectionist/sort-imports': [
      'error',
      {
        groups: [
          'type-builtin',
          'type-import',
          'value-builtin',
          'value-external',
          'type-internal',
          ['type-parent', 'type-sibling', 'type-index'],
          'value-internal',
          ['value-parent', 'value-sibling', 'value-index'],
          ['wildcard-value-parent', 'wildcard-value-sibling', 'wildcard-value-index'],
          'side-effect',
          'style',
        ],
        newlinesBetween: 'always',
      },
    ],
    'pnpm/json-enforce-catalog': 'off',
    'sonarjs/fixme-tag': 'warn',
    'sonarjs/todo-tag': 'warn',
    'style/padding-line-between-statements': 'error',
  },
}, {
  files: [...GLOB_TESTS, GLOB_MARKDOWN_CODE],
  rules: {
    '@masknet/no-top-level': 'off',
    '@masknet/unicode-specific-set': 'off',
  },
}, {
  files: [GLOB_MARKDOWN_CODE],
  rules: {
    'sonarjs/no-dead-store': 'off',
    'sonarjs/no-unused-vars': 'off',
  },
}, {
  files: ['playground/**'],
  rules: {
    'no-alert': 'off',
  },
}, {
  ignores: [
    'cspell.config.yaml',
    'cspell.config.yml',
  ],
}])
