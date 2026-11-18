import type { Session } from './sessions/session';
import {
  IDLE,
  transition,
  type TimerEffect,
  type TimerEvent,
  type TimerSettings,
  type TimerState,
} from './timer/timer';

export const MINUTE = 60_000;
export const SECOND = 1_000;

/** Local time on 18 November 2026, as epoch milliseconds. */
export function at(time: string, day = '2026-11-18'): number {
  return new Date(`${day}T${time.length === 5 ? `${time}:00` : time}`).getTime();
}

export interface Harness {
  state: TimerState;
  effects: TimerEffect[];
  send(event: TimerEvent): TimerEffect[];
  /** Sends one tick a second, as the host does, up to and including `until`. */
  tickUntil(from: number, until: number): void;
  saved(): Session[];
}

export function harness(settings: TimerSettings = { eyeBreaks: false }): Harness {
  const self: Harness = {
    state: IDLE,
    effects: [],
    send(event) {
      const result = transition(self.state, event, settings);
      self.state = result.state;
      self.effects.push(...result.effects);
      return result.effects;
    },
    tickUntil(from, until) {
      for (let now = from; now <= until; now += SECOND) {
        self.send({ type: 'TICK', at: now });
      }
    },
    saved() {
      return self.effects.flatMap((effect) =>
        effect.type === 'SAVE_SESSION' ? [effect.session] : [],
      );
    },
  };
  return self;
}

export function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    startedAt: at('09:00'),
    endedAt: at('09:25'),
    durationMs: 25 * MINUTE,
    mode: 'pomodoro',
    note: null,
    project: null,
    ...overrides,
  };
}
