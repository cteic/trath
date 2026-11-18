import type { Notice, Session, Snapshot } from '@trath/core';

export interface SessionLog {
  sessions: Session[];
  /** Lines in the log file that could not be read. */
  skipped: number;
}

/**
 * Everything the window needs from the outside world. The app talks to this
 * and never to Tauri directly, so tests can pass a fake.
 */
export interface Backend {
  /** The saved timer state, unchecked, or `null` on a first run. */
  loadState(): Promise<unknown>;
  saveState(snapshot: Snapshot): Promise<void>;
  /** Safe to call twice with the same session: the id is written once. */
  appendSession(session: Session): Promise<void>;
  listSessions(): Promise<SessionLog>;
  /** Asks where to save, then writes. Resolves to the path, or `null` on cancel. */
  saveExport(fileName: string, contents: string): Promise<string | null>;
  notify(notice: Notice): Promise<void>;
  /** Text beside the menu-bar icon. `null` clears it. */
  setTrayTitle(title: string | null): Promise<void>;
  /** Calls back about once a second, hidden window or not. Returns a stop function. */
  onTick(listener: () => void): () => void;
}
