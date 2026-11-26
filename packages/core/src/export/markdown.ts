import { formatDuration } from '../format/duration';
import {
  groupByDay,
  sessionsInRange,
  timeOfDay,
  weekdayName,
  type DayRange,
} from '../sessions/day';
import { totalDurationMs, type Session } from '../sessions/session';
import { MODE_SPECS } from '../timer/modes';

function cell(text: string | null): string {
  return (text ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function countLabel(count: number): string {
  return count === 1 ? '1 session' : `${String(count)} sessions`;
}

function totalLine(sessions: readonly Session[]): string {
  return `Total: ${formatDuration(totalDurationMs(sessions))} in ${countLabel(sessions.length)}.`;
}

function table(sessions: readonly Session[]): string[] {
  return [
    '| Start | End | Length | Mode | Project | Note |',
    '| --- | --- | --- | --- | --- | --- |',
    ...sessions.map(
      (session) =>
        `| ${timeOfDay(session.startedAt)} | ${timeOfDay(session.endedAt)} | ` +
        `${formatDuration(session.durationMs)} | ${MODE_SPECS[session.mode].label} | ` +
        `${cell(session.project)} | ${cell(session.note)} |`
    ),
  ];
}

function dayHeading(day: string): string {
  return `${day} (${weekdayName(day)})`;
}

/**
 * Renders a day or a range of days as Markdown. The same sessions always give
 * the same text, so exports diff cleanly.
 */
export function renderMarkdown(sessions: readonly Session[], range: DayRange): string {
  const inRange = sessionsInRange(sessions, range);
  const lines: string[] = [];
  if (range.from === range.to) {
    lines.push(`# Work log: ${dayHeading(range.from)}`, '');
    if (inRange.length === 0) {
      lines.push('No sessions.');
    } else {
      lines.push(totalLine(inRange), '', ...table(inRange));
    }
    return `${lines.join('\n')}\n`;
  }
  lines.push(`# Work log: ${range.from} to ${range.to}`, '');
  if (inRange.length === 0) {
    lines.push('No sessions.');
    return `${lines.join('\n')}\n`;
  }
  lines.push(totalLine(inRange));
  for (const group of groupByDay(inRange)) {
    lines.push('', `## ${dayHeading(group.day)}`, '', totalLine(group.sessions), '');
    lines.push(...table(group.sessions));
  }
  return `${lines.join('\n')}\n`;
}
