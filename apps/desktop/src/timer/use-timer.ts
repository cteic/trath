import {
  dayKey,
  DEFAULT_SNAPSHOT,
  noticeText,
  parseSnapshot,
  sortSessions,
  transition,
  type Session,
  type Snapshot,
  type TimerEffect,
  type TimerEvent,
  type TimerMode,
} from '@trath/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Backend } from '../platform/backend';

export interface Draft {
  note: string;
  project: string;
}

export interface TimerModel {
  /** False until the saved state and the log have loaded. */
  ready: boolean;
  snapshot: Snapshot;
  /** The clock reading the screen is drawn from. */
  now: number;
  sessions: Session[];
  /** Lines in the log file that could not be read. */
  skipped: number;
  draft: Draft;
  error: string | null;
  toggle(): void;
  stop(): void;
  setMode(mode: TimerMode): void;
  setEyeBreaks(on: boolean): void;
  setDraft(draft: Draft): void;
}

const EMPTY_DRAFT: Draft = { note: '', project: '' };

function message(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
}

/**
 * Runs the timer: feeds events to the pure state machine in `@trath/core`,
 * carries out the effects it asks for and keeps the saved state on disk in
 * step. All timing comes from `clock`. Ticks only say "look at the clock".
 */
export function useTimer(backend: Backend, clock: () => number, newId: () => string): TimerModel {
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(DEFAULT_SNAPSHOT);
  const [now, setNow] = useState(clock);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [draft, setDraftState] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const readyRef = useRef(false);
  const snapshotRef = useRef<Snapshot>(DEFAULT_SNAPSHOT);
  const draftRef = useRef<Draft>(EMPTY_DRAFT);
  const nowRef = useRef(now);
  // Writes run one at a time, in order: a session reaches the log before the
  // state that no longer holds it is saved.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const unsavedRef = useRef<Session[]>([]);

  const enqueue = useCallback((task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task).catch((caught: unknown) => {
      setError(message(caught));
    });
  }, []);

  const look = useCallback((at: number) => {
    nowRef.current = at;
    setNow(at);
  }, []);

  const saveSession = useCallback(
    (session: Session) => {
      enqueue(async () => {
        try {
          await backend.appendSession(session);
          unsavedRef.current = unsavedRef.current.filter((other) => other.id !== session.id);
          if (unsavedRef.current.length === 0) {
            setError(null);
          }
        } catch (caught) {
          if (!unsavedRef.current.some((other) => other.id === session.id)) {
            unsavedRef.current = [...unsavedRef.current, session];
          }
          setError(`Could not save the session. It will be tried again. (${message(caught)})`);
        }
      });
    },
    [backend, enqueue],
  );

  const commit = useCallback(
    (next: Snapshot) => {
      snapshotRef.current = next;
      setSnapshot(next);
      enqueue(() => backend.saveState(next));
    },
    [backend, enqueue],
  );

  const applyDraft = useCallback((next: Draft) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const runEffect = useCallback(
    (effect: TimerEffect) => {
      if (effect.type === 'SAVE_SESSION') {
        setSessions((current) =>
          current.some((other) => other.id === effect.session.id)
            ? current
            : sortSessions([...current, effect.session]),
        );
        saveSession(effect.session);
        // The note belonged to that session. The project likely carries on.
        applyDraft({ note: '', project: draftRef.current.project });
        return;
      }
      enqueue(() => backend.notify(noticeText(effect.kind, effect.mode)));
    },
    [applyDraft, backend, enqueue, saveSession],
  );

  const send = useCallback(
    (event: TimerEvent) => {
      const current = snapshotRef.current;
      const result = transition(current.timer, event, current.settings);
      // Effects first, so a finished session is queued ahead of the new state.
      result.effects.forEach(runEffect);
      if (result.state !== current.timer) {
        commit({ ...current, timer: result.state });
      }
    },
    [commit, runEffect],
  );

  const sendDraft = useCallback(() => {
    send({ type: 'EDIT', note: draftRef.current.note, project: draftRef.current.project });
  }, [send]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([backend.loadState(), backend.listSessions()])
      .then(([saved, log]) => {
        if (cancelled) {
          return;
        }
        const loaded = parseSnapshot(saved);
        snapshotRef.current = loaded;
        setSnapshot(loaded);
        setSessions(log.sessions);
        setSkipped(log.skipped);
        if (loaded.timer.phase === 'running') {
          applyDraft({ note: loaded.timer.note, project: loaded.timer.project });
        }
        readyRef.current = true;
        setReady(true);
        // Catch up on whatever happened while the app was closed.
        const at = clock();
        look(at);
        send({ type: 'TICK', at });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(`Could not load saved data. (${message(caught)})`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyDraft, backend, clock, look, send]);

  useEffect(() => {
    return backend.onTick(() => {
      if (!readyRef.current) {
        return;
      }
      const at = clock();
      unsavedRef.current.forEach(saveSession);
      if (snapshotRef.current.timer.phase === 'idle') {
        // Nothing is counting. Redraw only when the day turns over.
        if (dayKey(at) !== dayKey(nowRef.current)) {
          look(at);
        }
        return;
      }
      look(at);
      sendDraft();
      send({ type: 'TICK', at });
    });
  }, [backend, clock, look, saveSession, send, sendDraft]);

  const toggle = useCallback(() => {
    if (!readyRef.current) {
      return;
    }
    const at = clock();
    look(at);
    const { timer, mode } = snapshotRef.current;
    if (timer.phase === 'running') {
      send({ type: timer.pausedAt === null ? 'PAUSE' : 'RESUME', at });
      return;
    }
    send({ type: 'START', at, mode, id: newId(), ...draftRef.current });
  }, [clock, look, newId, send]);

  const stop = useCallback(() => {
    if (!readyRef.current) {
      return;
    }
    const at = clock();
    look(at);
    sendDraft();
    send({ type: 'STOP', at });
  }, [clock, look, send, sendDraft]);

  const setMode = useCallback(
    (mode: TimerMode) => {
      const current = snapshotRef.current;
      if (readyRef.current && current.timer.phase !== 'running' && current.mode !== mode) {
        commit({ ...current, mode });
      }
    },
    [commit],
  );

  const setEyeBreaks = useCallback(
    (on: boolean) => {
      const current = snapshotRef.current;
      if (readyRef.current && current.settings.eyeBreaks !== on) {
        commit({ ...current, settings: { ...current.settings, eyeBreaks: on } });
      }
    },
    [commit],
  );

  return {
    ready,
    snapshot,
    now,
    sessions,
    skipped,
    draft,
    error,
    toggle,
    stop,
    setMode,
    setEyeBreaks,
    setDraft: applyDraft,
  };
}
