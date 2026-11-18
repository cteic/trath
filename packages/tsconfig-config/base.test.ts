import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const fixturesDir = path.join(import.meta.dirname, 'fixtures');

function loadCompilerOptions(configName: string): ts.CompilerOptions {
  const configPath = path.join(fixturesDir, configName);
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, fixturesDir);
  const firstError = parsed.errors.find((error) => error.category === ts.DiagnosticCategory.Error);
  if (firstError !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(firstError.messageText, '\n'));
  }
  return parsed.options;
}

function compileFixture(fileName: string, overrides: ts.CompilerOptions = {}): number[] {
  const options = { ...loadCompilerOptions('tsconfig.json'), ...overrides };
  const program = ts.createProgram([path.join(fixturesDir, fileName)], options);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
}

describe('base tsconfig', () => {
  it('resolves by package name and sets the four required flags', () => {
    const options = loadCompilerOptions('tsconfig.json');

    expect(options.strict).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.verbatimModuleSyntax).toBe(true);
  });

  it('keeps DOM types out of the base lib', () => {
    const options = loadCompilerOptions('tsconfig.json');

    expect(options.lib).toEqual(['lib.es2024.d.ts']);
  });

  it.each([
    {
      flag: 'strict',
      file: 'breaks-strict.ts',
      code: 7006,
      off: { strict: false, exactOptionalPropertyTypes: false },
    },
    {
      flag: 'exactOptionalPropertyTypes',
      file: 'breaks-exact-optional-property-types.ts',
      code: 2375,
      off: { exactOptionalPropertyTypes: false },
    },
    {
      flag: 'noUncheckedIndexedAccess',
      file: 'breaks-no-unchecked-indexed-access.ts',
      code: 2322,
      off: { noUncheckedIndexedAccess: false },
    },
  ])('$flag rejects $file with TS$code', ({ file, code, off }) => {
    expect(compileFixture(file)).toEqual([code]);
    expect(compileFixture(file, off)).toEqual([]);
  });
});

describe('react tsconfig', () => {
  it('extends the base flags and adds JSX and DOM', () => {
    const options = loadCompilerOptions('tsconfig.react.json');

    expect(options.strict).toBe(true);
    expect(options.exactOptionalPropertyTypes).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.verbatimModuleSyntax).toBe(true);
    expect(options.jsx).toBe(ts.JsxEmit.ReactJSX);
    expect(options.lib).toContain('lib.dom.d.ts');
  });
});
