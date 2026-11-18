import { dayKey, PRODUCT_NAME, timerView, type TimerView } from '@trath/core';
import { useEffect } from 'react';

import { ExportPanel } from './components/export-panel';
import { SessionList } from './components/session-list';
import { TimerPanel } from './components/timer-panel';
import type { Backend } from './platform/backend';
import { shortcutFor } from './timer/shortcuts';
import { useTimer } from './timer/use-timer';

export interface AppProps {
  backend: Backend;
  /** Epoch milliseconds. Tests pass a fake. */
  clock?: () => number;
  newId?: () => string;
}

function systemClock(): number {
  return Date.now();
}

function randomId(): string {
  return crypto.randomUUID();
}

/** The text beside the menu-bar icon, so the time shows with the window closed. */
export function trayTitle(view: TimerView): string | null {
  switch (view.status) {
    case 'idle':
      return null;
    case 'running':
      return view.clock;
    case 'paused':
      return `Paused ${view.clock}`;
    case 'break':
      return `Break ${view.clock}`;
  }
}

export function App({ backend, clock = systemClock, newId = randomId }: AppProps) {
  const timer = useTimer(backend, clock, newId);
  const { ready, snapshot, now, toggle, stop } = timer;
  const view = timerView(snapshot.timer, now, snapshot.mode);
  const title = ready ? trayTitle(view) : null;

  useEffect(() => {
    backend.setTrayTitle(title).catch(() => {
      // The menu-bar text is a nicety. The window still shows the time.
    });
  }, [backend, title]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const shortcut = shortcutFor(event);
      if (shortcut === null) {
        return;
      }
      event.preventDefault();
      if (shortcut === 'toggle') {
        toggle();
      } else {
        stop();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [toggle, stop]);

  return (
    <main className="app" aria-busy={!ready}>
      <h1 className="visually-hidden">{PRODUCT_NAME}</h1>
      {timer.error !== null && (
        <p className="banner banner-error" role="alert">
          {timer.error}
        </p>
      )}
      <TimerPanel
        view={view}
        timer={snapshot.timer}
        mode={snapshot.mode}
        eyeBreaks={snapshot.settings.eyeBreaks}
        draft={timer.draft}
        disabled={!ready}
        onToggle={toggle}
        onStop={stop}
        onMode={timer.setMode}
        onEyeBreaks={timer.setEyeBreaks}
        onDraft={timer.setDraft}
      />
      <SessionList
        sessions={timer.sessions}
        today={dayKey(now)}
        timer={snapshot.timer}
        now={now}
        skipped={timer.skipped}
      />
      <ExportPanel backend={backend} sessions={timer.sessions} today={dayKey(now)} />
    </main>
  );
}
