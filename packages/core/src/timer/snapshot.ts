import { isRecord, isWholeNumber } from '../guards';
import { isTimerMode, type TimerMode } from './modes';
import { IDLE, type TimerSettings, type TimerState } from './timer';

export const SNAPSHOT_VERSION = 1;

/** What is written to disk so a running session survives a restart. */
export interface Snapshot {
  version: typeof SNAPSHOT_VERSION;
  timer: TimerState;
  mode: TimerMode;
  settings: TimerSettings;
}

export const DEFAULT_SNAPSHOT: Snapshot = {
  version: SNAPSHOT_VERSION,
  timer: IDLE,
  mode: 'pomodoro',
  settings: { eyeBreaks: false },
};

function parseTimer(value: unknown): TimerState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.phase === 'idle') {
    return IDLE;
  }
  if (value.phase === 'break') {
    const { mode, startedAt, endsAt } = value;
    if (!isTimerMode(mode) || !isWholeNumber(startedAt) || !isWholeNumber(endsAt)) {
      return null;
    }
    return { phase: 'break', mode, startedAt, endsAt };
  }
  if (value.phase !== 'running') {
    return null;
  }
  const { id, mode, startedAt, pausedAt, pausedMs, note, project, eyeMarks, eyeRestUntil } = value;
  if (
    typeof id !== 'string' ||
    id === '' ||
    !isTimerMode(mode) ||
    !isWholeNumber(startedAt) ||
    !(pausedAt === null || isWholeNumber(pausedAt)) ||
    !isWholeNumber(pausedMs) ||
    typeof note !== 'string' ||
    typeof project !== 'string' ||
    !isWholeNumber(eyeMarks) ||
    !(eyeRestUntil === null || isWholeNumber(eyeRestUntil))
  ) {
    return null;
  }
  return {
    phase: 'running',
    id,
    mode,
    startedAt,
    pausedAt,
    pausedMs,
    note,
    project,
    eyeMarks,
    eyeRestUntil,
  };
}

/**
 * Reads a snapshot that came off disk. Anything unreadable falls back to the
 * default piece by piece, so a damaged file never stops the app from opening.
 */
export function parseSnapshot(value: unknown): Snapshot {
  if (!isRecord(value) || value.version !== SNAPSHOT_VERSION) {
    return DEFAULT_SNAPSHOT;
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  return {
    version: SNAPSHOT_VERSION,
    timer: parseTimer(value.timer) ?? IDLE,
    mode: isTimerMode(value.mode) ? value.mode : DEFAULT_SNAPSHOT.mode,
    settings: {
      eyeBreaks:
        typeof settings.eyeBreaks === 'boolean'
          ? settings.eyeBreaks
          : DEFAULT_SNAPSHOT.settings.eyeBreaks,
    },
  };
}
