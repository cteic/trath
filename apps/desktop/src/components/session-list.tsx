import {
  activeElapsedMs,
  formatDuration,
  MODE_SPECS,
  sessionsOnDay,
  timeOfDay,
  totalDurationMs,
  type Session,
  type TimerState,
} from '@trath/core';

export interface SessionListProps {
  sessions: readonly Session[];
  /** The local day to show, as `2026-11-18`. */
  today: string;
  timer: TimerState;
  now: number;
  /** Lines in the log file that could not be read. */
  skipped: number;
}

function runningNote(timer: TimerState, now: number): string {
  if (timer.phase !== 'running') {
    return '';
  }
  return ` + ${formatDuration(activeElapsedMs(timer, now))} running`;
}

export function SessionList({ sessions, today, timer, now, skipped }: SessionListProps) {
  const todays = sessionsOnDay(sessions, today);
  const newestFirst = [...todays].reverse();

  return (
    <section className="today" aria-label="Today">
      <header className="section-head">
        <h2>Today</h2>
        <p className="total">
          <strong>{formatDuration(totalDurationMs(todays))}</strong>
          {runningNote(timer, now)}
        </p>
      </header>
      {newestFirst.length === 0 ? (
        <p className="empty">No sessions yet today.</p>
      ) : (
        <ul className="sessions">
          {newestFirst.map((session) => (
            <li key={session.id} className="session">
              <span className="session-time">
                {timeOfDay(session.startedAt)} to {timeOfDay(session.endedAt)}
              </span>
              <span className="session-length">{formatDuration(session.durationMs)}</span>
              <span className="session-detail">
                <span className="tag">{MODE_SPECS[session.mode].label}</span>
                {session.project !== null && (
                  <span className="tag tag-project">{session.project}</span>
                )}
                {session.note !== null && <span className="session-note">{session.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {skipped > 0 && (
        <p className="hint" role="status">
          {skipped === 1 ? '1 line' : `${skipped} lines`} in the log file could not be read and{' '}
          {skipped === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </section>
  );
}
