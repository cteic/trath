export const TIMER_MODES = ['pomodoro', 'deep', 'stopwatch'] as const;

export type TimerMode = (typeof TIMER_MODES)[number];

export interface ModeSpec {
  label: string;
  /** Length of one work period. `null` means the timer counts up until stopped. */
  workMs: number | null;
  /** Length of the break that follows a finished work period. */
  breakMs: number | null;
}

const MINUTE_MS = 60_000;

export const MODE_SPECS: Record<TimerMode, ModeSpec> = {
  pomodoro: { label: 'Pomodoro', workMs: 25 * MINUTE_MS, breakMs: 5 * MINUTE_MS },
  deep: { label: 'Deep work', workMs: 90 * MINUTE_MS, breakMs: 20 * MINUTE_MS },
  stopwatch: { label: 'Stopwatch', workMs: null, breakMs: null },
};

export function isTimerMode(value: unknown): value is TimerMode {
  return TIMER_MODES.some((mode) => mode === value);
}
