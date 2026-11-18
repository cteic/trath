import { formatClock } from '../format/duration';
import { MODE_SPECS } from './modes';
import { activeElapsedMs, type TimerState } from './timer';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'break';

export interface TimerView {
  status: TimerStatus;
  /** The big number: time left for a countdown, time so far for the stopwatch. */
  clock: string;
  /** Whole seconds left of an eye rest prompt, or `null` when none is showing. */
  eyeRestSeconds: number | null;
}

function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

export function timerView(
  state: TimerState,
  at: number,
  idleMode: keyof typeof MODE_SPECS,
): TimerView {
  if (state.phase === 'idle') {
    const workMs = MODE_SPECS[idleMode].workMs;
    return { status: 'idle', clock: formatClock(workMs ?? 0), eyeRestSeconds: null };
  }
  if (state.phase === 'break') {
    const left = secondsLeft(state.endsAt - at) * 1000;
    return { status: 'break', clock: formatClock(left), eyeRestSeconds: null };
  }
  const active = activeElapsedMs(state, at);
  const workMs = MODE_SPECS[state.mode].workMs;
  const shown = workMs === null ? active : secondsLeft(workMs - active) * 1000;
  const eyeLeft = state.eyeRestUntil === null ? 0 : secondsLeft(state.eyeRestUntil - at);
  return {
    status: state.pausedAt === null ? 'running' : 'paused',
    clock: formatClock(shown),
    eyeRestSeconds: eyeLeft > 0 ? eyeLeft : null,
  };
}
