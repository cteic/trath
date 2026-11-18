import { describe, expect, it } from 'vitest';

import { at, harness } from '../test-support';
import { noticeText } from './notices';
import { IDLE } from './timer';
import { timerView } from './view';

describe('timer view', () => {
  it('shows the full work length while idle', () => {
    expect(timerView(IDLE, at('09:00'), 'pomodoro')).toEqual({
      status: 'idle',
      clock: '25:00',
      eyeRestSeconds: null,
    });
    expect(timerView(IDLE, at('09:00'), 'deep').clock).toBe('1:30:00');
    expect(timerView(IDLE, at('09:00'), 'stopwatch').clock).toBe('00:00');
  });

  it('counts a pomodoro down and a stopwatch up', () => {
    const pomodoro = harness();
    pomodoro.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    expect(timerView(pomodoro.state, at('09:00:01'), 'pomodoro').clock).toBe('24:59');
    expect(timerView(pomodoro.state, at('09:00:01') + 300, 'pomodoro').clock).toBe('24:59');

    const stopwatch = harness();
    stopwatch.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'b' });
    expect(timerView(stopwatch.state, at('10:02:03'), 'pomodoro').clock).toBe('1:02:03');
  });

  it('freezes while paused', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.send({ type: 'PAUSE', at: at('09:10') });

    expect(timerView(timer.state, at('11:00'), 'pomodoro')).toMatchObject({
      status: 'paused',
      clock: '15:00',
    });
  });

  it('counts the break down', () => {
    const timer = harness();
    timer.send({ type: 'START', at: at('09:00'), mode: 'pomodoro', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:26'));

    expect(timerView(timer.state, at('09:26'), 'pomodoro')).toMatchObject({
      status: 'break',
      clock: '04:00',
    });
  });

  it('counts the eye rest down in seconds', () => {
    const timer = harness({ eyeBreaks: true });
    timer.send({ type: 'START', at: at('09:00'), mode: 'stopwatch', id: 'a' });
    timer.tickUntil(at('09:00'), at('09:20:05'));

    expect(timerView(timer.state, at('09:20:05'), 'stopwatch').eyeRestSeconds).toBe(15);
  });
});

describe('notice text', () => {
  it('names the mode and its break', () => {
    expect(noticeText('work-done', 'pomodoro')).toEqual({
      title: 'Pomodoro finished',
      body: 'Session saved. Take a 5-minute break.',
    });
    expect(noticeText('work-done', 'deep').body).toBe('Session saved. Take a 20-minute break.');
    expect(noticeText('work-done', 'stopwatch').body).toBe('Session saved.');
    expect(noticeText('break-done', 'deep').title).toBe('Break over');
    expect(noticeText('eye-rest', 'deep').body).toContain('20 seconds');
  });
});
