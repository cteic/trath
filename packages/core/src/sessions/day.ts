import { sortSessions, type Session } from './session';

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar day a moment falls on, as `2026-11-18`. */
export function dayKey(at: number): string {
  const date = new Date(at);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMidnight(key: string, addDays: number): number | null {
  const match = DAY_KEY.exec(key);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return new Date(year, month - 1, day + addDays).getTime();
}

export function isDayKey(key: string): boolean {
  return localMidnight(key, 0) !== null;
}

export interface DayRange {
  /** First day, inclusive. */
  from: string;
  /** Last day, inclusive. */
  to: string;
}

/** Orders the two ends. Returns `null` when either is not a real date. */
export function normaliseRange(from: string, to: string): DayRange | null {
  if (!isDayKey(from) || !isDayKey(to)) {
    return null;
  }
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Sessions that started on a day in the range, oldest first. */
export function sessionsInRange(sessions: readonly Session[], range: DayRange): Session[] {
  const start = localMidnight(range.from, 0);
  const end = localMidnight(range.to, 1);
  if (start === null || end === null) {
    return [];
  }
  return sortSessions(
    sessions.filter((session) => session.startedAt >= start && session.startedAt < end)
  );
}

export function sessionsOnDay(sessions: readonly Session[], key: string): Session[] {
  return sessionsInRange(sessions, { from: key, to: key });
}

export interface DayGroup {
  day: string;
  sessions: Session[];
}

/** Groups by the local day each session started on. Days and sessions run oldest first. */
export function groupByDay(sessions: readonly Session[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const session of sortSessions(sessions)) {
    const day = dayKey(session.startedAt);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.sessions.push(session);
    } else {
      groups.push({ day, sessions: [session] });
    }
  }
  return groups;
}

export function weekdayName(key: string): string {
  const start = localMidnight(key, 0);
  if (start === null) {
    return '';
  }
  return WEEKDAYS[new Date(start).getDay()] ?? '';
}

/** Local wall-clock time, 24-hour: `09:05`. */
export function timeOfDay(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Local time with its UTC offset: `2026-11-18T09:05:00+00:00`. */
export function localIso(at: number): string {
  const date = new Date(at);
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const absolute = Math.abs(offset);
  return (
    `${dayKey(at)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}
