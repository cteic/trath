import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isRecord, parseSessions } from '@trath/core';

import type { Backend, SessionLog } from './backend';

const TICK_EVENT = 'clock:tick';

function toSessionLog(value: unknown): SessionLog {
  if (!isRecord(value)) {
    return { sessions: [], skipped: 0 };
  }
  const all = Array.isArray(value.sessions) ? value.sessions : [];
  const sessions = parseSessions(all);
  const skipped = typeof value.skipped === 'number' ? value.skipped : 0;
  return { sessions, skipped: skipped + (all.length - sessions.length) };
}

export function createTauriBackend(): Backend {
  return {
    loadState() {
      return invoke<unknown>('state_load');
    },
    async saveState(snapshot) {
      await invoke('state_save', { state: snapshot });
    },
    async appendSession(session) {
      await invoke('sessions_append', { session });
    },
    async listSessions() {
      return toSessionLog(await invoke<unknown>('sessions_list'));
    },
    async saveExport(fileName, contents) {
      const path = await invoke<unknown>('export_save', { fileName, contents });
      return typeof path === 'string' ? path : null;
    },
    async notify(notice) {
      await invoke('notify', { title: notice.title, body: notice.body });
    },
    async setTrayTitle(title) {
      await invoke('tray_set_title', { title });
    },
    onTick(listener) {
      let stopped = false;
      let unlisten: (() => void) | null = null;
      void listen(TICK_EVENT, () => {
        listener();
      }).then((stop) => {
        if (stopped) {
          stop();
        } else {
          unlisten = stop;
        }
      });
      return () => {
        stopped = true;
        unlisten?.();
      };
    },
  };
}
