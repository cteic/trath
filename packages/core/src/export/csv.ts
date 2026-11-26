import { dayKey, localIso, sessionsInRange, type DayRange } from '../sessions/day';
import type { Session } from '../sessions/session';

export const CSV_HEADER = [
  'date',
  'start',
  'end',
  'duration_seconds',
  'mode',
  'project',
  'note',
  'id',
];

/**
 * Quotes a field when it needs it. Text that a spreadsheet would run as a
 * formula gets a leading apostrophe, so an exported note cannot execute.
 */
export function csvField(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function row(session: Session): string {
  return [
    dayKey(session.startedAt),
    localIso(session.startedAt),
    localIso(session.endedAt),
    String(Math.round(session.durationMs / 1000)),
    session.mode,
    session.project ?? '',
    session.note ?? '',
    session.id,
  ]
    .map(csvField)
    .join(',');
}

/** Renders a day or a range of days as CSV with CRLF line ends (RFC 4180). */
export function renderCsv(sessions: readonly Session[], range: DayRange): string {
  const rows = sessionsInRange(sessions, range).map(row);
  return [CSV_HEADER.join(','), ...rows].map((line) => `${line}\r\n`).join('');
}
