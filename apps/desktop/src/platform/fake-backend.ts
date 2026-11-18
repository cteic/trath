import type { Notice, Session, Snapshot } from '@trath/core';

import type { Backend } from './backend';

export interface FakeBackend extends Backend {
  /** What a real backend would have on disk. */
  state: unknown;
  log: Session[];
  skipped: number;
  notices: Notice[];
  trayTitles: (string | null)[];
  exports: { fileName: string; contents: string }[];
  /** Every write, in the order it reached the backend. */
  writes: string[];
  /** The next this-many session saves fail. */
  failAppends: number;
  /** Path the save dialog returns. `null` acts as a cancel. */
  exportPath: string | null;
  /** Fires the once-a-second tick. */
  tick(): void;
  savedState(): Snapshot | null;
}

function isSnapshot(value: unknown): value is Snapshot {
  return typeof value === 'object' && value !== null && 'timer' in value;
}

/** An in-memory stand-in for the Tauri side, for tests. */
export function createFakeBackend(): FakeBackend {
  const listeners = new Set<() => void>();
  const self: FakeBackend = {
    state: null,
    log: [],
    skipped: 0,
    notices: [],
    trayTitles: [],
    exports: [],
    writes: [],
    failAppends: 0,
    exportPath: '/tmp/export',
    loadState() {
      return Promise.resolve(self.state);
    },
    saveState(snapshot) {
      self.state = structuredClone(snapshot);
      self.writes.push(`state:${snapshot.timer.phase}`);
      return Promise.resolve();
    },
    appendSession(session) {
      if (self.failAppends > 0) {
        self.failAppends -= 1;
        return Promise.reject(new Error('disk full'));
      }
      if (!self.log.some((other) => other.id === session.id)) {
        self.log.push(session);
      }
      self.writes.push(`session:${session.id}`);
      return Promise.resolve();
    },
    listSessions() {
      return Promise.resolve({ sessions: [...self.log], skipped: self.skipped });
    },
    saveExport(fileName, contents) {
      self.exports.push({ fileName, contents });
      return Promise.resolve(self.exportPath);
    },
    notify(notice) {
      self.notices.push(notice);
      return Promise.resolve();
    },
    setTrayTitle(title) {
      self.trayTitles.push(title);
      return Promise.resolve();
    },
    onTick(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tick() {
      listeners.forEach((listener) => {
        listener();
      });
    },
    savedState() {
      return isSnapshot(self.state) ? self.state : null;
    },
  };
  return self;
}
