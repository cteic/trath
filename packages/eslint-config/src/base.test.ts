import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { banRules, createEslintConfig, ENUM_MESSAGE, TOP_LEVEL_ARROW_MESSAGE } from './base.js';

const packageDir = path.join(import.meta.dirname, '..');
const fixturesDir = path.join(packageDir, 'fixtures');

const ERROR_SEVERITY = 2;

function lintFixture(fileName: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({
    cwd: packageDir,
    overrideConfigFile: true,
    overrideConfig: createEslintConfig(),
  });
  return eslint.lintFiles([path.join(fixturesDir, fileName)]);
}

async function lintMessages(fileName: string): Promise<Linter.LintMessage[]> {
  const results = await lintFixture(fileName);
  return results.flatMap((result) => result.messages);
}

function severityOf(entry: Linter.RuleEntry): Linter.RuleSeverity {
  return Array.isArray(entry) ? entry[0] : entry;
}

describe('bans', () => {
  it.each([
    { ban: 'an enum', file: 'enum.ts', ruleId: 'no-restricted-syntax', message: ENUM_MESSAGE },
    {
      ban: 'an as cast',
      file: 'as-cast.ts',
      ruleId: '@typescript-eslint/consistent-type-assertions',
    },
    {
      ban: 'a non-null assertion',
      file: 'non-null-assertion.ts',
      ruleId: '@typescript-eslint/no-non-null-assertion',
    },
    {
      ban: 'an explicit any',
      file: 'explicit-any.ts',
      ruleId: '@typescript-eslint/no-explicit-any',
    },
    {
      ban: 'a type alias for an object shape',
      file: 'type-alias-object.ts',
      ruleId: '@typescript-eslint/consistent-type-definitions',
    },
    {
      ban: 'an exported top-level arrow function',
      file: 'top-level-arrow.ts',
      ruleId: 'no-restricted-syntax',
      message: TOP_LEVEL_ARROW_MESSAGE,
    },
    {
      ban: 'an unexported top-level arrow function',
      file: 'top-level-arrow-unexported.ts',
      ruleId: 'no-restricted-syntax',
      message: TOP_LEVEL_ARROW_MESSAGE,
    },
    {
      ban: 'a non-kebab-case file name',
      file: 'NotKebabCase.ts',
      ruleId: 'filenames/kebab-case',
    },
  ])('fails at error level on $ban', async ({ file, ruleId, message }) => {
    const messages = await lintMessages(file);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.ruleId).toBe(ruleId);
    expect(messages[0]?.severity).toBe(ERROR_SEVERITY);
    if (message !== undefined) {
      expect(messages[0]?.message).toBe(message);
    }
  });

  it('allows as const', async () => {
    expect(await lintMessages('as-const.ts')).toEqual([]);
  });

  it('allows interfaces, union aliases, function declarations and arrow callbacks', async () => {
    expect(await lintMessages('allowed-patterns.ts')).toEqual([]);
  });
});

describe('shared config', () => {
  it('sets no rule to warn', () => {
    const entries = createEslintConfig().flatMap((config) => Object.entries(config.rules ?? {}));
    const warned = entries
      .filter(([, entry]) => entry !== undefined && ['warn', 1].includes(severityOf(entry)))
      .map(([ruleId]) => ruleId);

    expect(entries.length).toBeGreaterThan(Object.keys(banRules).length);
    expect(warned).toEqual([]);
  });

  it('sets every ban to error', () => {
    const severities = Object.values(banRules).map((entry) => severityOf(entry));

    expect(severities).toEqual(severities.map(() => 'error'));
  });

  it('adds caller ignores to the defaults', () => {
    const [first] = createEslintConfig({ ignores: ['fixtures/**'] });

    expect(first?.ignores).toContain('fixtures/**');
    expect(first?.ignores).toContain('**/dist/**');
  });
});

describe('installed typescript-eslint', () => {
  it('is the pinned version', () => {
    const require = createRequire(import.meta.url);
    const manifest: unknown = require('typescript-eslint/package.json');

    expect(manifest).toMatchObject({ version: '8.72.2' });
  });

  it('ships every @typescript-eslint rule the bans name', () => {
    const prefix = '@typescript-eslint/';
    const named = Object.keys(banRules)
      .filter((ruleId) => ruleId.startsWith(prefix))
      .map((ruleId) => ruleId.slice(prefix.length));
    const plugin: unknown = tseslint.plugin;
    const shipped =
      typeof plugin === 'object' && plugin !== null && 'rules' in plugin
        ? Object.keys(plugin.rules ?? {})
        : [];

    expect(named).toHaveLength(4);
    expect(shipped).toEqual(expect.arrayContaining(named));
  });

  it('accepts the rule options against the installed rule schemas', async () => {
    const eslint = new ESLint({
      cwd: packageDir,
      overrideConfigFile: true,
      overrideConfig: createEslintConfig(),
    });
    const config: unknown = await eslint.calculateConfigForFile(
      path.join(fixturesDir, 'allowed-patterns.ts')
    );

    expect(config).toMatchObject({
      rules: {
        '@typescript-eslint/consistent-type-assertions': [
          ERROR_SEVERITY,
          { assertionStyle: 'never' },
        ],
        '@typescript-eslint/consistent-type-definitions': [ERROR_SEVERITY, 'interface'],
      },
    });
  });
});
