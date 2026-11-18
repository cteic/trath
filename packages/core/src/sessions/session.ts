import { isRecord, isWholeNumber } from '../guards';
import { isTimerMode, type TimerMode } from '../timer/modes';

/** One finished stretch of work. Times are epoch milliseconds. */
export interface Session {
  id: string;
  startedAt: number;
  endedAt: number;
  /** Work time. Less than `endedAt - startedAt` when the session was paused. */
  durationMs: number;
  mode: TimerMode;
  note: string | null;
  project: string | null;
}

export function isSession(value: unknown): value is Session {
  if (!isRecord(value)) {
    return false;
  }
  const { id, startedAt, endedAt, durationMs, mode, note, project } = value;
  return (
    typeof id === 'string' &&
    id !== '' &&
    isWholeNumber(startedAt) &&
    isWholeNumber(endedAt) &&
    endedAt >= startedAt &&
    isWholeNumber(durationMs) &&
    isTimerMode(mode) &&
    (note === null || typeof note === 'string') &&
    (project === null || typeof project === 'string')
  );
}

/** Keeps the valid sessions from untrusted input, oldest first. */
export function parseSessions(value: unknown): Session[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return sortSessions(value.filter(isSession));
}

export function sortSessions(sessions: readonly Session[]): Session[] {
  return [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt || a.endedAt - b.endedAt || a.id.localeCompare(b.id),
  );
}

export function totalDurationMs(sessions: readonly Session[]): number {
  return sessions.reduce((total, session) => total + session.durationMs, 0);
}
