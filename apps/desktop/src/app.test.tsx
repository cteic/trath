import type { Session, Snapshot } from '@trath/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app';
import { createFakeBackend, type FakeBackend } from './platform/fake-backend';

const MINUTE = 60_000;
const SECOND = 1_000;

function at(time: string, day = '2026-11-18'): number {
  return new Date(`${day}T${time.length === 5 ? `${time}:00` : time}`).getTime();
}

interface Rig {
  backend: FakeBackend;
  /** Moves the clock on and fires one tick, as the app would see after a gap. */
  advance(ms: number): Promise<void>;
  /** Moves the clock on a second at a time, with a tick each second. */
  run(ms: number): Promise<void>;
  setClock(time: number): void;
}

async function mount(start: number, backend = createFakeBackend()): Promise<Rig> {
  let now = start;
  let ids = 0;
  function clock(): number {
    return now;
  }
  function newId(): string {
    ids += 1;
    return `id-${ids}`;
  }
  render(<App backend={backend} clock={clock} newId={newId} />);
  await waitFor(() => {
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('false');
  });

  async function advance(ms: number): Promise<void> {
    now += ms;
    await act(async () => {
      backend.tick();
      await Promise.resolve();
    });
  }

  return {
    backend,
    advance,
    async run(ms) {
      for (let passed = 0; passed < ms; passed += SECOND) {
        await advance(SECOND);
      }
    },
    setClock(time) {
      now = time;
    },
  };
}

function clockText(): string {
  return screen.getByRole('timer').textContent;
}

function button(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

function press(key: string, init: KeyboardEventInit = {}, target: Element = document.body): void {
  fireEvent.keyDown(target, { key, ...init });
}

function runningSnapshot(startedAt: number, overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    timer: {
      phase: 'running',
      id: 'restored',
      mode: 'pomodoro',
      startedAt,
      pausedAt: null,
      pausedMs: 0,
      note: 'Carry on',
      project: 'web',
      eyeMarks: 0,
      eyeRestUntil: null,
    },
    mode: 'pomodoro',
    settings: { eyeBreaks: false },
    ...overrides,
  };
}

function savedSession(overrides: Partial<Session>): Session {
  return {
    id: 'old',
    startedAt: at('08:00'),
    endedAt: at('08:25'),
    durationMs: 25 * MINUTE,
    mode: 'pomodoro',
    note: null,
    project: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('start, pause, resume, stop', () => {
  it('saves a stopwatch session with its note and project and lists it under Today', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(screen.getByRole('radio', { name: 'Stopwatch' }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Fix retry test' } });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'billing' } });
    fireEvent.click(button(/^Start/));
    await rig.advance(40 * MINUTE);
    expect(clockText()).toBe('40:00');

    fireEvent.click(button(/^Stop and save/));

    await waitFor(() => {
      expect(rig.backend.log).toEqual([
        {
          id: 'id-1',
          startedAt: at('09:00'),
          endedAt: at('09:40'),
          durationMs: 40 * MINUTE,
          mode: 'stopwatch',
          note: 'Fix retry test',
          project: 'billing',
        },
      ]);
    });
    const today = within(screen.getByRole('region', { name: 'Today' }));
    expect(today.getByText('09:00 to 09:40')).toBeTruthy();
    expect(today.getByText('Fix retry test')).toBeTruthy();
    expect(today.getByText('billing')).toBeTruthy();
    expect(today.getAllByText('40m')).toHaveLength(2);
  });

  it('pauses and resumes, and leaves the pause out of the saved length', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(screen.getByRole('radio', { name: 'Stopwatch' }));
    fireEvent.click(button(/^Start/));
    await rig.advance(10 * MINUTE);
    fireEvent.click(button(/^Pause/));
    await rig.advance(30 * MINUTE);
    expect(clockText()).toBe('10:00');

    fireEvent.click(button(/^Resume/));
    await rig.advance(5 * MINUTE);
    fireEvent.click(button(/^Stop and save/));

    await waitFor(() => {
      expect(rig.backend.log).toHaveLength(1);
    });
    expect(rig.backend.log[0]).toMatchObject({ endedAt: at('09:45'), durationMs: 15 * MINUTE });
  });

  it('writes the session to the log before it saves the idle state', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(button(/^Start/));
    await rig.advance(MINUTE);
    fireEvent.click(button(/^Stop and save/));

    await waitFor(() => {
      expect(rig.backend.writes.at(-1)).toBe('state:idle');
    });
    expect(rig.backend.writes).toEqual(['state:running', 'session:id-1', 'state:idle']);
  });
});

describe('keyboard', () => {
  it('starts, pauses and resumes on Space and stops on Cmd+Enter', async () => {
    const rig = await mount(at('09:00'));
    press(' ');
    expect(button(/^Pause/)).toBeTruthy();
    await rig.advance(5 * MINUTE);

    press(' ');
    expect(button(/^Resume/)).toBeTruthy();
    press(' ');
    expect(button(/^Pause/)).toBeTruthy();

    await rig.advance(5 * MINUTE);
    press('Enter', { metaKey: true });

    await waitFor(() => {
      expect(rig.backend.log).toHaveLength(1);
    });
    expect(rig.backend.log[0]).toMatchObject({ durationMs: 10 * MINUTE, mode: 'pomodoro' });
    expect(button(/^Start/)).toBeTruthy();
  });

  it('lets Space type in the note field, and still stops from there on Cmd+Enter', async () => {
    const rig = await mount(at('09:00'));
    const note = screen.getByLabelText('Note');

    press(' ', {}, note);
    expect(button(/^Start/)).toBeTruthy();

    fireEvent.click(button(/^Start/));
    await rig.advance(MINUTE);
    fireEvent.change(note, { target: { value: 'Typed mid-session' } });
    press('Enter', { metaKey: true }, note);

    await waitFor(() => {
      expect(rig.backend.log).toHaveLength(1);
    });
    expect(rig.backend.log[0]).toMatchObject({ note: 'Typed mid-session' });
  });

  it('ignores Space on a button, a held key, and Enter without Cmd', async () => {
    const rig = await mount(at('09:00'));
    press(' ', {}, button(/^Start/));
    press(' ', { repeat: true });
    expect(button(/^Start/)).toBeTruthy();

    press(' ');
    await rig.advance(MINUTE);
    press('Enter');
    expect(button(/^Pause/)).toBeTruthy();
    expect(rig.backend.log).toEqual([]);
  });
});

describe('modes', () => {
  it('finishes a pomodoro at 25 minutes, saves it, notifies and counts the break down', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(button(/^Start/));
    expect(clockText()).toBe('25:00');
    await rig.advance(24 * MINUTE);
    expect(clockText()).toBe('01:00');
    await rig.run(MINUTE);

    await waitFor(() => {
      expect(rig.backend.log).toHaveLength(1);
    });
    expect(rig.backend.log[0]).toMatchObject({ endedAt: at('09:25'), durationMs: 25 * MINUTE });
    expect(rig.backend.notices).toEqual([
      { title: 'Pomodoro finished', body: 'Session saved. Take a 5-minute break.' },
    ]);
    expect(clockText()).toBe('05:00');
    expect(screen.getByText('Break until 09:30')).toBeTruthy();

    await rig.run(5 * MINUTE);
    expect(button(/^Start/)).toBeTruthy();
    expect(rig.backend.notices.at(-1)).toMatchObject({ title: 'Break over' });
  });

  it('counts deep work down from 90 minutes', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(screen.getByRole('radio', { name: 'Deep work' }));
    expect(clockText()).toBe('1:30:00');
    fireEvent.click(button(/^Start/));
    await rig.advance(30 * MINUTE);

    expect(clockText()).toBe('1:00:00');
    expect(rig.backend.savedState()).toMatchObject({ mode: 'deep' });
  });

  it('locks the mode while a session runs', async () => {
    await mount(at('09:00'));
    fireEvent.click(button(/^Start/));

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.hasAttribute('disabled')).toBe(true);
    }
  });
});

describe('20-20-20 eye breaks', () => {
  it('notifies after 20 minutes of work and shows a 20-second prompt, once switched on', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(screen.getByRole('radio', { name: 'Stopwatch' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /20-20-20 eye breaks/ }));
    fireEvent.click(button(/^Start/));
    await rig.advance(19 * MINUTE + 59 * SECOND);
    expect(rig.backend.notices).toEqual([]);

    await rig.advance(SECOND);
    await waitFor(() => {
      expect(rig.backend.notices).toEqual([
        { title: 'Rest your eyes', body: 'Look at something 20 feet away for 20 seconds.' },
      ]);
    });
    expect(screen.getByText(/Look 20 feet away for 20 s/)).toBeTruthy();

    await rig.run(20 * SECOND);
    expect(screen.queryByText(/Look 20 feet away/)).toBeNull();
    expect(rig.backend.savedState()).toMatchObject({ settings: { eyeBreaks: true } });
  });

  it('stays quiet when switched off', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(screen.getByRole('radio', { name: 'Stopwatch' }));
    fireEvent.click(button(/^Start/));
    await rig.run(21 * MINUTE);

    expect(rig.backend.notices).toEqual([]);
  });
});

describe('surviving a close and a restart', () => {
  it('saves the start time the moment a session starts', async () => {
    const rig = await mount(at('09:00'));
    fireEvent.click(button(/^Start/));

    await waitFor(() => {
      expect(rig.backend.savedState()).toMatchObject({
        timer: { phase: 'running', id: 'id-1', startedAt: at('09:00') },
      });
    });
  });

  it('picks a running session back up and works out the time from the clock', async () => {
    const backend = createFakeBackend();
    backend.state = runningSnapshot(at('09:00'));
    const rig = await mount(at('09:10'), backend);

    expect(clockText()).toBe('15:00');
    expect(button(/^Pause/)).toBeTruthy();
    expect(screen.getByLabelText('Note')).toHaveProperty('value', 'Carry on');

    await rig.advance(5 * MINUTE);
    fireEvent.click(button(/^Stop and save/));
    await waitFor(() => {
      expect(backend.log).toHaveLength(1);
    });
    expect(backend.log[0]).toMatchObject({
      id: 'restored',
      startedAt: at('09:00'),
      durationMs: 15 * MINUTE,
      note: 'Carry on',
      project: 'web',
    });
  });

  it('saves a pomodoro that ran out while the app was closed, on the next launch', async () => {
    const backend = createFakeBackend();
    backend.state = runningSnapshot(at('09:00'));
    await mount(at('12:00'), backend);

    await waitFor(() => {
      expect(backend.log).toHaveLength(1);
    });
    expect(backend.log[0]).toMatchObject({ endedAt: at('09:25'), durationMs: 25 * MINUTE });
    expect(backend.notices).toEqual([]);
    expect(button(/^Start/)).toBeTruthy();
    expect(backend.savedState()).toMatchObject({ timer: { phase: 'idle' } });
  });

  it('keeps a paused session paused across a restart', async () => {
    const backend = createFakeBackend();
    const snapshot = runningSnapshot(at('09:00'));
    backend.state = {
      ...snapshot,
      timer: { ...snapshot.timer, pausedAt: at('09:05') },
    };
    await mount(at('15:00'), backend);

    expect(clockText()).toBe('20:00');
    expect(button(/^Resume/)).toBeTruthy();
  });

  it('opens idle on a damaged state file', async () => {
    const backend = createFakeBackend();
    backend.state = { version: 1, timer: { phase: 'running', startedAt: 'soon' } };
    await mount(at('09:00'), backend);

    expect(button(/^Start/)).toBeTruthy();
    expect(clockText()).toBe('25:00');
  });
});

describe('Today', () => {
  it('lists the saved sessions for the local day with a total, newest first', async () => {
    const backend = createFakeBackend();
    backend.log = [
      savedSession({
        id: 'yesterday',
        startedAt: at('10:00', '2026-11-17'),
        endedAt: at('10:25', '2026-11-17'),
      }),
      savedSession({ id: 'first' }),
      savedSession({
        id: 'second',
        startedAt: at('10:00'),
        endedAt: at('11:30'),
        durationMs: 90 * MINUTE,
        mode: 'deep',
        note: 'Spec review',
      }),
    ];
    await mount(at('12:00'), backend);

    const today = within(screen.getByRole('region', { name: 'Today' }));
    const rows = today.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('10:00 to 11:30');
    expect(rows[1]?.textContent).toContain('08:00 to 08:25');
    expect(today.getByText('1h 55m')).toBeTruthy();
  });

  it('shows the running time beside the total', async () => {
    const backend = createFakeBackend();
    backend.log = [savedSession({ id: 'first' })];
    const rig = await mount(at('12:00'), backend);
    fireEvent.click(button(/^Start/));
    await rig.advance(12 * MINUTE);

    const today = screen.getByRole('region', { name: 'Today' });
    expect(today.textContent).toContain('25m + 12m running');
  });

  it('says so when there is nothing yet, and when log lines were unreadable', async () => {
    const backend = createFakeBackend();
    backend.skipped = 2;
    await mount(at('09:00'), backend);

    expect(screen.getByText('No sessions yet today.')).toBeTruthy();
    expect(screen.getByText(/2 lines in the log file could not be read/)).toBeTruthy();
  });

  it('moves to the new day at midnight', async () => {
    const backend = createFakeBackend();
    backend.log = [savedSession({ id: 'first', startedAt: at('23:00'), endedAt: at('23:25') })];
    const rig = await mount(at('23:59:30'), backend);
    expect(screen.getByText('23:00 to 23:25')).toBeTruthy();

    await rig.advance(MINUTE);
    expect(screen.getByText('No sessions yet today.')).toBeTruthy();
  });
});

describe('export', () => {
  it('saves today as Markdown and reports where it went', async () => {
    const backend = createFakeBackend();
    backend.log = [savedSession({ id: 'first', note: 'Plan' })];
    backend.exportPath = '/Users/me/Desktop/trath-2026-11-18.md';
    await mount(at('12:00'), backend);

    fireEvent.click(button(/^Markdown/));

    await waitFor(() => {
      expect(screen.getByText('Saved to /Users/me/Desktop/trath-2026-11-18.md')).toBeTruthy();
    });
    expect(backend.exports).toEqual([
      {
        fileName: 'trath-2026-11-18.md',
        contents: [
          '# Work log: 2026-11-18 (Wednesday)',
          '',
          'Total: 25m in 1 session.',
          '',
          '| Start | End | Length | Mode | Project | Note |',
          '| --- | --- | --- | --- | --- | --- |',
          '| 08:00 | 08:25 | 25m | Pomodoro |  | Plan |',
          '',
        ].join('\n'),
      },
    ]);
  });

  it('saves a date range as CSV', async () => {
    const backend = createFakeBackend();
    backend.log = [
      savedSession({
        id: 'mon',
        startedAt: at('10:00', '2026-11-16'),
        endedAt: at('10:25', '2026-11-16'),
      }),
      savedSession({ id: 'wed' }),
    ];
    await mount(at('12:00'), backend);
    const panel = within(screen.getByRole('region', { name: 'Export' }));
    expect(panel.getByText('1 session')).toBeTruthy();

    fireEvent.change(panel.getByLabelText('From'), { target: { value: '2026-11-16' } });
    expect(panel.getByText('2 sessions')).toBeTruthy();
    fireEvent.click(button(/^CSV/));

    await waitFor(() => {
      expect(backend.exports).toHaveLength(1);
    });
    expect(backend.exports[0]?.fileName).toBe('trath-2026-11-16_2026-11-18.csv');
    expect(backend.exports[0]?.contents.split('\r\n')).toEqual([
      'date,start,end,duration_seconds,mode,project,note,id',
      '2026-11-16,2026-11-16T10:00:00+00:00,2026-11-16T10:25:00+00:00,1500,pomodoro,,,mon',
      '2026-11-18,2026-11-18T08:00:00+00:00,2026-11-18T08:25:00+00:00,1500,pomodoro,,,wed',
      '',
    ]);
  });

  it('says nothing when the save dialog is cancelled', async () => {
    const backend = createFakeBackend();
    backend.exportPath = null;
    await mount(at('12:00'), backend);

    fireEvent.click(button(/^Markdown/));

    await waitFor(() => {
      expect(backend.exports).toHaveLength(1);
    });
    expect(screen.queryByText(/Saved to/)).toBeNull();
  });
});

describe('menu-bar text', () => {
  it('shows the countdown while running, marks a pause and clears when idle', async () => {
    const rig = await mount(at('09:00'));
    expect(rig.backend.trayTitles.at(-1)).toBeNull();

    fireEvent.click(button(/^Start/));
    await rig.advance(MINUTE);
    await waitFor(() => {
      expect(rig.backend.trayTitles.at(-1)).toBe('24:00');
    });

    fireEvent.click(button(/^Pause/));
    await waitFor(() => {
      expect(rig.backend.trayTitles.at(-1)).toBe('Paused 24:00');
    });

    fireEvent.click(button(/^Stop and save/));
    await waitFor(() => {
      expect(rig.backend.trayTitles.at(-1)).toBeNull();
    });
  });
});

describe('a failed save', () => {
  it('warns, keeps the session on screen and tries again on the next tick', async () => {
    const rig = await mount(at('09:00'));
    rig.backend.failAppends = 1;
    fireEvent.click(button(/^Start/));
    await rig.advance(10 * MINUTE);
    fireEvent.click(button(/^Stop and save/));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Could not save the session');
    });
    expect(rig.backend.log).toEqual([]);
    expect(screen.getByText('09:00 to 09:10')).toBeTruthy();

    await rig.advance(SECOND);
    await waitFor(() => {
      expect(rig.backend.log).toHaveLength(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
