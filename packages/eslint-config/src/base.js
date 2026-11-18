import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

import { kebabCaseFilename } from './kebab-case-filename.js';

export const LINTED_FILES = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

export const DEFAULT_IGNORES = ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/target/**'];

export const ENUM_MESSAGE = 'Do not use enum. Use a const object or a union type.';

export const TOP_LEVEL_ARROW_MESSAGE =
  'Use a function declaration for a top-level function. Arrow functions are for callbacks only.';

/** @type {import('eslint').ESLint.Plugin} */
export const filenamesPlugin = {
  rules: {
    'kebab-case': kebabCaseFilename,
  },
};

/** @type {import('eslint').Linter.RulesRecord} */
export const banRules = {
  'no-restricted-syntax': [
    'error',
    { selector: 'TSEnumDeclaration', message: ENUM_MESSAGE },
    {
      selector: 'Program > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
      message: TOP_LEVEL_ARROW_MESSAGE,
    },
    {
      selector:
        'Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
      message: TOP_LEVEL_ARROW_MESSAGE,
    },
    {
      selector: 'Program > ExportDefaultDeclaration > ArrowFunctionExpression',
      message: TOP_LEVEL_ARROW_MESSAGE,
    },
  ],
  '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
  'filenames/kebab-case': 'error',
  'prefer-const': 'error',
  'no-nested-ternary': 'error',
};

/**
 * @typedef {object} EslintConfigOptions
 * @property {string[]} [ignores] Extra ignore globs, relative to the consuming package.
 */

/**
 * @param {EslintConfigOptions} [options]
 * @returns {import('eslint').Linter.Config[]}
 */
export function createEslintConfig(options = {}) {
  const { ignores = [] } = options;

  return defineConfig(
    { ignores: [...DEFAULT_IGNORES, ...ignores] },
    {
      files: LINTED_FILES,
      extends: [tseslint.configs.recommended],
      plugins: { filenames: filenamesPlugin },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: banRules,
    },
  );
}
