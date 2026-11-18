import { describe, expect, it } from 'vitest';

import { at, harness, MINUTE, SECOND } from '../test-support';
import { activeElapsedMs, cleanLine, IDLE, type RunningState } from './timer';

describe('start and stop', () => {
  it('saves a stopwatch session with its start, end, length and mode', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'STOP', at: at('09:42') });

    expect(timer.state).toBe(IDLE);
    expect(timer.saved()).toEqual([
      {
        id: 'a',
        startedAt: at('09:00'),
        endedAt: at('09:42'),
        durationMs: 42 * MINUTE,
        mode: 'stopwatch',
        note: null,
        project: null,
      },
    ]);
  });

  it('keeps the note and project, trimmed to one line', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'EDIT', note: '  Fix the\nretry test ', project: ' billing ' });
    timer.send({ type: 'STOP', at: at('09:10') });

    expect(timer.saved()[0]).toMatchObject({ note: 'Fix the retry test', project: 'billing' });
  });

  it('carries a note typed before the start', () => {
    const timer = harness();
    timer.send({
      type: 'START',
      at: at('09:00'),
      mode: 'stopwatch',
      id: 'a',
      note: 'Plan the day',
      project: 'admin',
    });
    timer.send({ type: 'STOP', at: at('09:10') });

    expect(timer.saved()[0]).toMatchObject({ note: 'Plan the day', project: 'admin' });
  });

  it('drops a session shorter than a second', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.send({ type: 'STOP', at: at('09:00') + 400 });

    expect(timer.state).toBe(IDLE);
    expect(timer.saved()).toEqual([]);
  });

  it('ignores a second start while a session runs', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    const before = timer.state;
    timer.send({ type: 'START', at: at('09:05'), mode: 'deep', id: 'b' });

    expect(timer.state).toBe(before);
  });

  it('ignores stop, pause, resume and ticks while idle', () => {
    const timer = harness();
    timer.send({ type: 'STOP', at: at('09:00') });
    timer.send({ type: 'PAUSE', at: at('09:00') });
    timer.send({ type: 'RESUME', at: at('09:00') });
    timer.send({ type: 'TICK', at: at('09:00') });

    expect(timer.state).toBe(IDLE);
    expect(timer.effects).toEqual([]);
  });
});

describe('pause and resume', () => {
  it('leaves paused time out of the length', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'PAUSE', at: at('09:10') });
    timer.send({ type: 'RESUME', at: at('09:25') });
    timer.send({ type: 'STOP', at: at('09:40') });

    expect(timer.saved()[0]).toMatchObject({
      startedAt: at('09:00'),
      endedAt: at('09:40'),
      durationMs: 25 * MINUTE,
    });
  });

  it('ends a session stopped while paused at the moment of the pause', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'PAUSE', at: at('09:10') });
    timer.send({ type: 'STOP', at: at('11:00') });

    expect(timer.saved()[0]).toMatchObject({ endedAt: at('09:10'), durationMs: 10 * MINUTE });
  });

  it('does not advance a paused countdown, however long the pause', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.send({ type: 'PAUSE', at: at('09:10') });
    timer.send({ type: 'TICK', at: at('13:00') });

    expect(timer.state.phase).toBe('running');
    expect(timer.saved()).toEqual([]);

    timer.send({ type: 'RESUME', at: at('13:00') });
    timer.tickUntil(at('13:00'), at('13:15'));

    expect(timer.saved()[0]).toMatchObject({ endedAt: at('13:15'), durationMs: 25 * MINUTE });
  });

  it('ignores a pause while paused and a resume while running', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    const runningState = timer.state;
    timer.send({ type: 'RESUME', at: at('09:01') });
    expect(timer.state).toBe(runningState);

    timer.send({ type: 'PAUSE', at: at('09:02') });
    const pausedState = timer.state;
    timer.send({ type: 'PAUSE', at: at('09:03') });
    expect(timer.state).toBe(pausedState);
  });
});

describe('pomodoro', () => {
  it('finishes after 25 minutes, saves the session and starts a 5-minute break', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:24:59'));
    expect(timer.state.phase).toBe('running');

    timer.send({ type: 'TICK', at: at('09:25') });

    expect(timer.state).toEqual({
      phase: 'break',
      mode: 'pomodoro',
      startedAt: at('09:25'),
      endsAt: at('09:30'),
    });
    expect(timer.saved()).toEqual([
      expect.objectContaining({ endedAt: at('09:25'), durationMs: 25 * MINUTE, mode: 'pomodoro' }),
    ]);
    expect(timer.effects).toContainEqual({ type: 'NOTIFY', kind: 'work-done', mode: 'pomodoro' });
  });

  it('ends the break after 5 minutes with one notice', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:30'));

    expect(timer.state).toBe(IDLE);
    expect(timer.effects.filter((effect) => effect.type === 'NOTIFY')).toEqual([
      { type: 'NOTIFY', kind: 'work-done', mode: 'pomodoro' },
      { type: 'NOTIFY', kind: 'break-done', mode: 'pomodoro' },
    ]);
  });

  it('lets a start skip the break, and a stop cancel it', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:26'));
    timer.send({ type: 'START', at: at('09:26'), mode: 'pomodoro', id: 'b' });
    expect(timer.state).toMatchObject({ phase: 'running', id: 'b', startedAt: at('09:26') });

    timer.tickUntil(at('09:26'), at('09:52'));
    expect(timer.state.phase).toBe('break');
    timer.send({ type: 'STOP', at: at('09:52') });
    expect(timer.state).toBe(IDLE);
    expect(timer.saved()).toHaveLength(2);
  });
});

describe('deep work', () => {
  it('finishes after 90 minutes and starts a 20-minute break', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'deep', id: 'a' });
    timer.tickUntil(at('09:00'), at('10:30'));

    expect(timer.state).toMatchObject({ phase: 'break', endsAt: at('10:50') });
    expect(timer.saved()[0]).toMatchObject({ durationMs: 90 * MINUTE, mode: 'deep' });
  });
});

describe('stopwatch', () => {
  it('runs until stopped, with no break', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.tickUntil(at('09:00'), at('12:00'));

    expect(timer.state.phase).toBe('running');
    expect(timer.effects).toEqual([]);
  });
});

describe('time comes from the clock, not from counting ticks', () => {
  it('gives the same length with one tick as with one a second', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'TICK', at: at('09:37') });
    timer.send({ type: 'STOP', at: at('09:37') });

    expect(timer.saved()[0]).toMatchObject({ durationMs: 37 * MINUTE });
  });

  it('closes a pomodoro at its 25-minute mark when the first tick comes late', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.send({ type: 'TICK', at: at('09:27') });

    expect(timer.saved()[0]).toMatchObject({ endedAt: at('09:25'), durationMs: 25 * MINUTE });
    expect(timer.state).toMatchObject({ phase: 'break', endsAt: at('09:30') });
  });

  it('after a long gap saves the session, skips the break and stays quiet', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.send({ type: 'TICK', at: at('14:00') });

    expect(timer.state).toBe(IDLE);
    expect(timer.saved()).toHaveLength(1);
    expect(timer.effects.filter((effect) => effect.type === 'NOTIFY')).toEqual([]);
  });

  it('survives a clock that steps backwards', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'TICK', at: at('08:59') });
    timer.send({ type: 'STOP', at: at('08:59') });

    expect(timer.state).toBe(IDLE);
    expect(timer.saved()).toEqual([]);
  });
});

describe('20-20-20 eye rest', () => {
  function eyeNotices(effects: readonly { type: string; kind?: string }[]): number {
    return effects.filter((effect) => effect.type === 'NOTIFY' && effect.kind === 'eye-rest')
      .length;
  }

  it('prompts every 20 minutes of stopwatch work, for 20 seconds', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:19:59'));
    expect(eyeNotices(timer.effects)).toBe(0);

    timer.send({ type: 'TICK', at: at('09:20') });
    expect(eyeNotices(timer.effects)).toBe(1);
    expect(timer.state).toMatchObject({ eyeRestUntil: at('09:20:20') });

    timer.tickUntil(at('09:20:01'), at('09:20:20'));
    expect(timer.state).toMatchObject({ eyeRestUntil: null });

    timer.tickUntil(at('09:20:21'), at('10:00'));
    expect(eyeNotices(timer.effects)).toBe(3);
  });

  it('stays silent when the toggle is off', () => {
    const timer = harness({ eyeBreaks: false });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.tickUntil(at('09:00'), at('10:00'));

    expect(timer.effects).toEqual([]);
  });

  it('counts work time only, so a pause delays the prompt', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'PAUSE', at: at('09:10') });
    timer.tickUntil(at('09:10'), at('09:30'));
    timer.send({ type: 'RESUME', at: at('09:30') });
    timer.tickUntil(at('09:30'), at('09:39:59'));
    expect(eyeNotices(timer.effects)).toBe(0);

    timer.send({ type: 'TICK', at: at('09:40') });
    expect(eyeNotices(timer.effects)).toBe(1);
  });

  it('skips the prompt that falls 5 minutes before a pomodoro break', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:25'));

    expect(eyeNotices(timer.effects)).toBe(0);
  });

  it('prompts four times in a 90-minute deep work period', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'deep', id: 'a' });
    timer.tickUntil(at('09:00'), at('10:30'));

    expect(eyeNotices(timer.effects)).toBe(4);
  });

  it('shows one prompt at most after a long gap, and none for a stale mark', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.send({ type: 'TICK', at: at('11:07') });
    expect(eyeNotices(timer.effects)).toBe(0);

    timer.tickUntil(at('11:07'), at('11:20'));
    expect(eyeNotices(timer.effects)).toBe(1);
  });

  it('clears a showing prompt on pause', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:20:05'));
    timer.send({ type: 'PAUSE', at: at('09:20:05') });

    expect(timer.state).toMatchObject({ eyeRestUntil: null });
  });
});

describe('a tick that changes nothing', () => {
  it('returns the same state object', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    const before = timer.state;
    timer.send({ type: 'TICK', at: at('09:00') + SECOND });

    expect(timer.state).toBe(before);
  });
});

describe('helpers', () => {
  it('works out active time from the clock and the pauses', () => {
    const state: RunningState = {
      phase: 'running',
      id: 'a',
      mode: 'stopwatch',
      startedAt: at('09:00'),
      pausedAt: null,
      pausedMs: 5 * MINUTE,
      note: '',
      project: '',
      eyeMarks: 0,
      eyeRestUntil: null,
    };

    expect(activeElapsedMs(state, at('09:30'))).toBe(25 * MINUTE);
    expect(activeElapsedMs({ ...state, pausedAt: at('09:20') }, at('09:30'))).toBe(15 * MINUTE);
  });

  it('cleans text to one trimmed line of a set length', () => {
    expect(cleanLine('  a\r\nb\tc  ', 100)).toBe('a b c');
    expect(cleanLine('abcdef', 3)).toBe('abc');
  });
});
