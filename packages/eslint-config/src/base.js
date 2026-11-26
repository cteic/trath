import { defineConfig } from 'eslint/config';

import { createConfig } from '@cteic/eslint-config';

import { kebabCaseFilename } from './kebab-case-filename.js';

export const LINTED_FILES = ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'];

/** The foundry config loads the TypeScript rules for these files only. */
export const TYPESCRIPT_FILES = ['**/*.{ts,tsx,mts,cts}'];

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
 * The cteic foundry config, plus the rules Tráth adds on top: kebab-case file
 * names, function declarations at the top level and interfaces for shapes.
 *
 * @param {EslintConfigOptions} [options]
 * @returns {import('eslint').Linter.Config[]}
 */
export function createEslintConfig(options = {}) {
  const { ignores = [] } = options;

  return defineConfig(
    ...createConfig({ ignores: [...DEFAULT_IGNORES, ...ignores] }),
    {
      files: LINTED_FILES,
      plugins: { filenames: filenamesPlugin },
      rules: Object.fromEntries(
        Object.entries(banRules).filter(([name]) => !name.startsWith('@typescript-eslint/'))
      ),
    },
    { files: TYPESCRIPT_FILES, rules: banRules }
  );
}
