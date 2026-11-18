/** @type {import('prettier').Config} */
export const prettierConfig = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all',
};

/**
 * @param {import('prettier').Config} [overrides]
 * @returns {import('prettier').Config}
 */
export function createPrettierConfig(overrides = {}) {
  return { ...prettierConfig, ...overrides };
}

export default prettierConfig;
