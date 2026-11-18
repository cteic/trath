import { describe, expect, it } from 'vitest';

import { at, session } from '../test-support';
import {
  dayKey,
  groupByDay,
  isDayKey,
  localIso,
  normaliseRange,
  sessionsInRange,
  sessionsOnDay,
  timeOfDay,
  weekdayName,
} from './day';

// These tests run in Europe/Dublin (see vitest.config.ts): UTC+0 in winter, UTC+1 in summer.

describe('dayKey', () => {
  it('uses the local day, not the UTC day', () => {
    expect(dayKey(Date.UTC(2026, 10, 18, 12, 0))).toBe('2026-11-18');
    // 23:30 UTC on 30 June is 00:30 on 1 July in Dublin.
    expect(dayKey(Date.UTC(2026, 5, 30, 23, 30))).toBe('2026-07-01');
  });
});

describe('isDayKey and normaliseRange', () => {
  it('accepts real dates only', () => {
    expect(isDayKey('2026-11-18')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('18/11/2026')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });

  it('puts the two ends in order', () => {
    expect(normaliseRange('2026-11-18', '2026-11-16')).toEqual({
      from: '2026-11-16',
      to: '2026-11-18',
    });
    expect(normaliseRange('2026-11-18', 'soon')).toBeNull();
  });
});

describe('sessionsInRange', () => {
  const monday = session({
    id: 'mon',
    startedAt: at('09:00', '2026-11-16'),
    endedAt: at('09:25', '2026-11-16'),
  });
  const lateTuesday = session({
    id: 'tue',
    startedAt: at('23:50', '2026-11-17'),
    endedAt: at('00:15', '2026-11-18'),
  });
  const wednesday = session({ id: 'wed' });
  const all = [wednesday, lateTuesday, monday];

  it('includes both end days and sorts oldest first', () => {
    expect(sessionsInRange(all, { from: '2026-11-16', to: '2026-11-17' })).toEqual([
      monday,
      lateTuesday,
    ]);
  });

  it('files a session that crosses midnight under the day it started', () => {
    expect(sessionsOnDay(all, '2026-11-17')).toEqual([lateTuesday]);
    expect(sessionsOnDay(all, '2026-11-18')).toEqual([wednesday]);
  });

  it('covers a 25-hour day when the clocks go back', () => {
    // Clocks go back on 25 October 2026 at 02:00 Irish time.
    const lastHour = session({
      id: 'late',
      startedAt: at('23:30', '2026-10-25'),
      endedAt: at('23:55', '2026-10-25'),
    });

    expect(sessionsOnDay([lastHour], '2026-10-25')).toEqual([lastHour]);
    expect(sessionsOnDay([lastHour], '2026-10-26')).toEqual([]);
  });

  it('returns nothing for a bad range', () => {
    expect(sessionsInRange(all, { from: 'x', to: '2026-11-18' })).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('groups by start day, days oldest first', () => {
    const first = session({ id: 'a' });
    const second = session({ id: 'b', startedAt: at('14:00'), endedAt: at('14:25') });
    const earlier = session({
      id: 'c',
      startedAt: at('10:00', '2026-11-17'),
      endedAt: at('10:25', '2026-11-17'),
    });

    expect(groupByDay([second, earlier, first])).toEqual([
      { day: '2026-11-17', sessions: [earlier] },
      { day: '2026-11-18', sessions: [first, second] },
    ]);
  });
});

describe('labels', () => {
  it('names the weekday', () => {
    expect(weekdayName('2026-11-18')).toBe('Wednesday');
    expect(weekdayName('nope')).toBe('');
  });

  it('prints 24-hour local time', () => {
    expect(timeOfDay(at('09:05'))).toBe('09:05');
    expect(timeOfDay(at('17:40'))).toBe('17:40');
  });

  it('prints local ISO time with the offset for the season', () => {
    expect(localIso(at('09:05:07'))).toBe('2026-11-18T09:05:07+00:00');
    expect(localIso(at('09:05:07', '2026-07-01'))).toBe('2026-07-01T09:05:07+01:00');
  });
});
