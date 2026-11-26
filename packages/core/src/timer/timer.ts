import type { Session } from '../sessions/session';
import { MODE_SPECS, type TimerMode } from './modes';

/** The 20-20-20 rule: every 20 minutes of work, look far away for 20 seconds. */
export const EYE_INTERVAL_MS = 20 * 60_000;
export const EYE_REST_MS = 20_000;
/** No eye prompt when the work period ends this soon after it. The break covers it. */
export const EYE_SUPPRESS_MS = 5 * 60_000;
/** A moment that passed longer ago than this gets no notification, for example after a restart. */
export const STALE_NOTICE_MS = 60_000;
/** A session shorter than this is dropped on stop, so a stray key press logs nothing. */
export const MIN_SESSION_MS = 1_000;

export const NOTE_MAX_LENGTH = 280;
export const PROJECT_MAX_LENGTH = 64;

export interface IdleState {
  phase: 'idle';
}

export interface RunningState {
  phase: 'running';
  id: string;
  mode: TimerMode;
  /** Epoch milliseconds. Elapsed time is always worked out from this and the clock. */
  startedAt: number;
  /** Set while paused. */
  pausedAt: number | null;
  /** Total of all finished pauses. */
  pausedMs: number;
  note: string;
  project: string;
  /** How many 20-minute marks have been handled, shown or not. */
  eyeMarks: number;
  /** Set while an eye rest prompt is showing. */
  eyeRestUntil: number | null;
}

export interface BreakState {
  phase: 'break';
  mode: TimerMode;
  startedAt: number;
  endsAt: number;
}

export type TimerState = IdleState | RunningState | BreakState;

export interface TimerSettings {
  eyeBreaks: boolean;
}

export type TimerEvent =
  | { type: 'START'; at: number; mode: TimerMode; id: string; note?: string; project?: string }
  | { type: 'PAUSE'; at: number }
  | { type: 'RESUME'; at: number }
  | { type: 'STOP'; at: number }
  | { type: 'EDIT'; note: string; project: string }
  | { type: 'TICK'; at: number };

export type NoticeKind = 'work-done' | 'break-done' | 'eye-rest';

export type TimerEffect =
  | { type: 'SAVE_SESSION'; session: Session }
  | { type: 'NOTIFY'; kind: NoticeKind; mode: TimerMode };

export interface TimerResult {
  state: TimerState;
  effects: TimerEffect[];
}

export const IDLE: IdleState = { phase: 'idle' };

export function cleanLine(text: string, maxLength: number): string {
  const oneLine = text.replace(/\p{Cc}+/gu, ' ');
  return Array.from(oneLine).slice(0, maxLength).join('').trim();
}

/** Work time so far: clock time since the start, less every pause. */
export function activeElapsedMs(state: RunningState, at: number): number {
  const until = state.pausedAt ?? at;
  return Math.max(0, until - state.startedAt - state.pausedMs);
}

function unchanged(state: TimerState): TimerResult {
  return { state, effects: [] };
}

function toSession(state: RunningState, endedAt: number, durationMs: number): Session {
  const note = cleanLine(state.note, NOTE_MAX_LENGTH);
  const project = cleanLine(state.project, PROJECT_MAX_LENGTH);
  return {
    id: state.id,
    startedAt: state.startedAt,
    endedAt,
    durationMs,
    mode: state.mode,
    note: note === '' ? null : note,
    project: project === '' ? null : project,
  };
}

function start(event: Extract<TimerEvent, { type: 'START' }>): TimerResult {
  return {
    state: {
      phase: 'running',
      id: event.id,
      mode: event.mode,
      startedAt: event.at,
      pausedAt: null,
      pausedMs: 0,
      note: event.note ?? '',
      project: event.project ?? '',
      eyeMarks: 0,
      eyeRestUntil: null,
    },
    effects: [],
  };
}

function stop(state: RunningState, at: number): TimerResult {
  const endedAt = Math.max(state.startedAt, state.pausedAt ?? at);
  const durationMs = activeElapsedMs(state, at);
  if (durationMs < MIN_SESSION_MS) {
    return { state: IDLE, effects: [] };
  }
  return {
    state: IDLE,
    effects: [{ type: 'SAVE_SESSION', session: toSession(state, endedAt, durationMs) }],
  };
}

function tickBreak(state: BreakState, at: number): TimerResult {
  if (at < state.endsAt) {
    return unchanged(state);
  }
  const stale = at - state.endsAt > STALE_NOTICE_MS;
  return {
    state: IDLE,
    effects: stale ? [] : [{ type: 'NOTIFY', kind: 'break-done', mode: state.mode }],
  };
}

function finishWork(state: RunningState, at: number, workMs: number): TimerResult {
  // The clock moment the work period filled up. Later than `at` never, earlier after a restart.
  const endedAt = state.startedAt + state.pausedMs + workMs;
  const effects: TimerEffect[] = [
    { type: 'SAVE_SESSION', session: toSession(state, endedAt, workMs) },
  ];
  const breakMs = MODE_SPECS[state.mode].breakMs;
  if (breakMs === null) {
    return { state: IDLE, effects };
  }
  if (at - endedAt <= STALE_NOTICE_MS) {
    effects.push({ type: 'NOTIFY', kind: 'work-done', mode: state.mode });
  }
  const onBreak: BreakState = {
    phase: 'break',
    mode: state.mode,
    startedAt: endedAt,
    endsAt: endedAt + breakMs,
  };
  const afterBreak = tickBreak(onBreak, at);
  return { state: afterBreak.state, effects: [...effects, ...afterBreak.effects] };
}

function tickEye(
  state: RunningState,
  at: number,
  active: number,
  workMs: number | null,
  settings: TimerSettings
): TimerResult {
  const marks = Math.floor(active / EYE_INTERVAL_MS);
  if (marks > state.eyeMarks) {
    const markActive = marks * EYE_INTERVAL_MS;
    const late = active - markActive;
    const nearBreak = workMs !== null && workMs - markActive <= EYE_SUPPRESS_MS;
    const show = settings.eyeBreaks && !nearBreak && late <= STALE_NOTICE_MS;
    if (!show) {
      return unchanged({ ...state, eyeMarks: marks });
    }
    return {
      state: { ...state, eyeMarks: marks, eyeRestUntil: at - late + EYE_REST_MS },
      effects: [{ type: 'NOTIFY', kind: 'eye-rest', mode: state.mode }],
    };
  }
  if (state.eyeRestUntil !== null && (at >= state.eyeRestUntil || !settings.eyeBreaks)) {
    return unchanged({ ...state, eyeRestUntil: null });
  }
  return unchanged(state);
}

function tickRunning(state: RunningState, at: number, settings: TimerSettings): TimerResult {
  if (state.pausedAt !== null) {
    return unchanged(state);
  }
  const active = activeElapsedMs(state, at);
  const workMs = MODE_SPECS[state.mode].workMs;
  if (workMs !== null && active >= workMs) {
    return finishWork(state, at, workMs);
  }
  return tickEye(state, at, active, workMs, settings);
}

function transitionRunning(
  state: RunningState,
  event: TimerEvent,
  settings: TimerSettings
): TimerResult {
  switch (event.type) {
    case 'PAUSE':
      if (state.pausedAt !== null) {
        return unchanged(state);
      }
      return unchanged({
        ...state,
        pausedAt: Math.max(event.at, state.startedAt),
        eyeRestUntil: null,
      });
    case 'RESUME':
      if (state.pausedAt === null) {
        return unchanged(state);
      }
      return unchanged({
        ...state,
        pausedAt: null,
        pausedMs: state.pausedMs + Math.max(0, event.at - state.pausedAt),
      });
    case 'STOP':
      return stop(state, event.at);
    case 'EDIT':
      if (event.note === state.note && event.project === state.project) {
        return unchanged(state);
      }
      return unchanged({ ...state, note: event.note, project: event.project });
    case 'TICK':
      return tickRunning(state, event.at, settings);
    case 'START':
      return unchanged(state);
  }
}

/**
 * The whole timer. A pure function: it holds no timers and reads no clock.
 * Every timed event carries its own `at`. When nothing changes it returns the
 * same state object, so a caller can compare by identity.
 */
export function transition(
  state: TimerState,
  event: TimerEvent,
  settings: TimerSettings
): TimerResult {
  switch (state.phase) {
    case 'idle':
      return event.type === 'START' ? start(event) : unchanged(state);
    case 'break':
      if (event.type === 'START') {
        return start(event);
      }
      if (event.type === 'STOP') {
        return unchanged(IDLE);
      }
      return event.type === 'TICK' ? tickBreak(state, event.at) : unchanged(state);
    case 'running':
      return transitionRunning(state, event, settings);
  }
}
