import { describe, expect, it } from 'vitest';

import { at, harness } from '../test-support';
import { DEFAULT_SNAPSHOT, parseSnapshot, type Snapshot } from './snapshot';
import { IDLE, transition } from './timer';

function roundTrip(snapshot: Snapshot): Snapshot {
  const parsed: unknown = JSON.parse(JSON.stringify(snapshot));
  return parseSnapshot(parsed);
}

describe('snapshot', () => {
  it('round-trips a running session through JSON', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'deep', id: 'a' });
    timer.send({ type: 'EDIT', note: 'Spec review', project: 'docs' });
    timer.send({ type: 'PAUSE', at: at('09:10') });
    const snapshot: Snapshot = {
      version: 1,
      timer: timer.state,
      mode: 'deep',
      settings: { eyeBreaks: true },
    };

    expect(roundTrip(snapshot)).toEqual(snapshot);
  });

  it('round-trips a break', () => {
    const snapshot: Snapshot = {
      version: 1,
      timer: { phase: 'break', mode: 'pomodoro', startedAt: at('09:25'), endsAt: at('09:30') },
      mode: 'pomodoro',
      settings: { eyeBreaks: false },
    };

    expect(roundTrip(snapshot)).toEqual(snapshot);
  });

  it('lets a restored session carry on from the clock after a restart', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    const restored = roundTrip({
      version: 1,
      timer: timer.state,
      mode: 'stopwatch',
      settings: { eyeBreaks: false },
    });

    const result = transition(restored.timer, { type: 'STOP', at: at('10:15') }, restored.settings);

    expect(result.effects).toEqual([
      {
        type: 'SAVE_SESSION',
        session: expect.objectContaining({ startedAt: at('09:00'), durationMs: 75 * 60_000 }),
      },
    ]);
  });

  it.each([
    ['nothing', null],
    ['text', 'hello'],
    ['a list', []],
    ['another version', { ...DEFAULT_SNAPSHOT, version: 2 }],
  ])('falls back to the default for %s', (_name, value) => {
    expect(parseSnapshot(value)).toEqual(DEFAULT_SNAPSHOT);
  });

  it('keeps the settings when only the timer is damaged', () => {
    const parsed = parseSnapshot({
      version: 1,
      timer: { phase: 'running', id: 'a', mode: 'pomodoro', startedAt: 'yesterday' },
      mode: 'deep',
      settings: { eyeBreaks: true },
    });

    expect(parsed).toEqual({
      version: 1,
      timer: IDLE,
      mode: 'deep',
      settings: { eyeBreaks: true },
    });
  });

  it('rejects a running timer with an unknown mode or a negative time', () => {
    const good = {
      phase: 'running',
      id: 'a',
      mode: 'pomodoro',
      startedAt: 1,
      pausedAt: null,
      pausedMs: 0,
      note: '',
      project: '',
      eyeMarks: 0,
      eyeRestUntil: null,
    };
    const wrap = (timer: unknown): unknown => ({ ...DEFAULT_SNAPSHOT, timer });

    expect(parseSnapshot(wrap(good)).timer).toEqual(good);
    expect(parseSnapshot(wrap({ ...good, mode: 'sprint' })).timer).toBe(IDLE);
    expect(parseSnapshot(wrap({ ...good, startedAt: -5 })).timer).toBe(IDLE);
    expect(parseSnapshot(wrap({ ...good, id: '' })).timer).toBe(IDLE);
    expect(parseSnapshot(wrap({ phase: 'break', mode: 'deep', startedAt: 1 })).timer).toBe(IDLE);
  });
});
