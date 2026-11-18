import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

import defaultConfig, { createPrettierConfig, prettierConfig } from './base.js';

describe('prettier base config', () => {
  it('exports the shared settings as the default export', () => {
    expect(defaultConfig).toBe(prettierConfig);
    expect(prettierConfig).toEqual({ printWidth: 100, singleQuote: true, trailingComma: 'all' });
  });

  it('formats TypeScript with single quotes, semicolons and trailing commas', async () => {
    const source = 'const name = "work"\nexport const list = [\n  name\n]\n';
    const output = await format(source, { ...prettierConfig, parser: 'typescript' });

    expect(output).toBe("const name = 'work';\nexport const list = [name];\n");
  });

  it('lets a consumer override one setting without mutating the base', () => {
    const config = createPrettierConfig({ printWidth: 80 });

    expect(config.printWidth).toBe(80);
    expect(config.singleQuote).toBe(true);
    expect(prettierConfig.printWidth).toBe(100);
  });
});
