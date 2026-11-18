import { describe, expect, it } from 'vitest';

import { at, MINUTE, session } from '../test-support';
import { isSession, parseSessions, totalDurationMs } from './session';

describe('isSession', () => {
  it('accepts a full record, with or without note and project', () => {
    expect(isSession(session())).toBe(true);
    expect(isSession(session({ note: 'Review', project: 'web' }))).toBe(true);
  });

  it.each([
    ['a missing id', { ...session(), id: '' }],
    ['an end before the start', session({ endedAt: at('08:00') })],
    ['an unknown mode', { ...session(), mode: 'sprint' }],
    ['a fractional time', { ...session(), startedAt: 1.5 }],
    ['a number for a note', { ...session(), note: 4 }],
    ['a missing project', { ...session(), project: undefined }],
    ['a list', []],
    ['nothing', null],
  ])('rejects %s', (_name, value) => {
    expect(isSession(value)).toBe(false);
  });
});

describe('parseSessions', () => {
  it('drops bad rows and sorts the rest by start', () => {
    const later = session({ id: 'b', startedAt: at('11:00'), endedAt: at('11:25') });
    const earlier = session({ id: 'a' });

    expect(parseSessions([later, { id: 'x' }, earlier])).toEqual([earlier, later]);
    expect(parseSessions('nope')).toEqual([]);
  });
});

describe('totalDurationMs', () => {
  it('adds work time, not clock time', () => {
    const paused = session({ endedAt: at('10:00'), durationMs: 40 * MINUTE });

    expect(totalDurationMs([paused, session({ id: 'b' })])).toBe(65 * MINUTE);
    expect(totalDurationMs([])).toBe(0);
  });
});
