import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration, formatMinutes } from './duration';

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [61_000, '01:01'],
    [25 * 60_000, '25:00'],
    [3_600_000, '1:00:00'],
    [5_400_000 + 7_000, '1:30:07'],
    [-50, '00:00'],
  ])('%d ms is %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [25 * 60_000, '25m'],
    [65 * 60_000, '1h 05m'],
    [10 * 3_600_000, '10h 00m'],
  ])('%d ms is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('formatMinutes', () => {
  it('reads as an adjective', () => {
    expect(formatMinutes(5 * 60_000)).toBe('5-minute');
  });
});
