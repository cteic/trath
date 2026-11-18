import { describe, expect, it } from 'vitest';

import { at, MINUTE, session } from '../test-support';
import { csvField, renderCsv } from './csv';
import { exportFileName } from './file-name';
import { renderMarkdown } from './markdown';

const morning = session({ id: 'a', note: 'Write retry tests', project: 'billing' });
const afternoon = session({
  id: 'b',
  startedAt: at('14:00'),
  endedAt: at('15:40'),
  durationMs: 90 * MINUTE,
  mode: 'deep',
});
const tuesday = session({
  id: 'c',
  startedAt: at('10:00', '2026-11-17'),
  endedAt: at('10:12', '2026-11-17'),
  durationMs: 12 * MINUTE,
  mode: 'stopwatch',
  note: 'a | b',
});
const all = [afternoon, tuesday, morning];
const today = { from: '2026-11-18', to: '2026-11-18' };
const twoDays = { from: '2026-11-17', to: '2026-11-18' };

describe('renderMarkdown', () => {
  it('renders one day with a total and a table', () => {
    expect(renderMarkdown(all, today)).toBe(
      [
        '# Work log: 2026-11-18 (Wednesday)',
        '',
        'Total: 1h 55m in 2 sessions.',
        '',
        '| Start | End | Length | Mode | Project | Note |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 09:00 | 09:25 | 25m | Pomodoro | billing | Write retry tests |',
        '| 14:00 | 15:40 | 1h 30m | Deep work |  |  |',
        '',
      ].join('\n'),
    );
  });

  it('renders a range with a section per day and escapes pipes', () => {
    expect(renderMarkdown(all, twoDays)).toBe(
      [
        '# Work log: 2026-11-17 to 2026-11-18',
        '',
        'Total: 2h 07m in 3 sessions.',
        '',
        '## 2026-11-17 (Tuesday)',
        '',
        'Total: 12m in 1 session.',
        '',
        '| Start | End | Length | Mode | Project | Note |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 10:00 | 10:12 | 12m | Stopwatch |  | a \\| b |',
        '',
        '## 2026-11-18 (Wednesday)',
        '',
        'Total: 1h 55m in 2 sessions.',
        '',
        '| Start | End | Length | Mode | Project | Note |',
        '| --- | --- | --- | --- | --- | --- |',
        '| 09:00 | 09:25 | 25m | Pomodoro | billing | Write retry tests |',
        '| 14:00 | 15:40 | 1h 30m | Deep work |  |  |',
        '',
      ].join('\n'),
    );
  });

  it('says so when a day or a range has no sessions', () => {
    expect(renderMarkdown([], today)).toBe('# Work log: 2026-11-18 (Wednesday)\n\nNo sessions.\n');
    expect(renderMarkdown([], twoDays)).toBe(
      '# Work log: 2026-11-17 to 2026-11-18\n\nNo sessions.\n',
    );
  });

  it('gives the same text whatever order the sessions arrive in', () => {
    expect(renderMarkdown([morning, afternoon, tuesday], twoDays)).toBe(
      renderMarkdown(all, twoDays),
    );
  });
});

describe('renderCsv', () => {
  it('renders a header and one row per session, oldest first', () => {
    expect(renderCsv(all, twoDays)).toBe(
      [
        'date,start,end,duration_seconds,mode,project,note,id',
        '2026-11-17,2026-11-17T10:00:00+00:00,2026-11-17T10:12:00+00:00,720,stopwatch,,a | b,c',
        '2026-11-18,2026-11-18T09:00:00+00:00,2026-11-18T09:25:00+00:00,1500,pomodoro,billing,Write retry tests,a',
        '2026-11-18,2026-11-18T14:00:00+00:00,2026-11-18T15:40:00+00:00,5400,deep,,,b',
        '',
      ].join('\r\n'),
    );
  });

  it('renders the header alone for an empty range', () => {
    expect(renderCsv([], today)).toBe('date,start,end,duration_seconds,mode,project,note,id\r\n');
  });
});

describe('csvField', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvField('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvField('+1')).toBe("'+1");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@cmd')).toBe("'@cmd");
  });
});

describe('exportFileName', () => {
  it('names a day and a range', () => {
    expect(exportFileName(today, 'md')).toBe('trath-2026-11-18.md');
    expect(exportFileName(twoDays, 'csv')).toBe('trath-2026-11-17_2026-11-18.csv');
  });
});
