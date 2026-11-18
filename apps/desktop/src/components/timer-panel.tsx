import {
  MODE_SPECS,
  NOTE_MAX_LENGTH,
  PROJECT_MAX_LENGTH,
  TIMER_MODES,
  timeOfDay,
  type TimerMode,
  type TimerState,
  type TimerView,
} from '@trath/core';

import type { Draft } from '../timer/use-timer';

export interface TimerPanelProps {
  view: TimerView;
  timer: TimerState;
  mode: TimerMode;
  eyeBreaks: boolean;
  draft: Draft;
  disabled: boolean;
  onToggle: () => void;
  onStop: () => void;
  onMode: (mode: TimerMode) => void;
  onEyeBreaks: (on: boolean) => void;
  onDraft: (draft: Draft) => void;
}

const TOGGLE_LABELS: Record<TimerView['status'], string> = {
  idle: 'Start',
  running: 'Pause',
  paused: 'Resume',
  break: 'Skip break',
};

function caption(view: TimerView, timer: TimerState, mode: TimerMode): string {
  if (timer.phase === 'break') {
    return `Break until ${timeOfDay(timer.endsAt)}`;
  }
  if (timer.phase === 'running') {
    const label = MODE_SPECS[timer.mode].label;
    const since = `since ${timeOfDay(timer.startedAt)}`;
    return view.status === 'paused' ? `${label} paused, ${since}` : `${label}, ${since}`;
  }
  const spec = MODE_SPECS[mode];
  if (spec.workMs === null || spec.breakMs === null) {
    return 'Runs until you stop it';
  }
  return `${spec.workMs / 60_000} minutes of work, then a ${spec.breakMs / 60_000}-minute break`;
}

export function TimerPanel({
  view,
  timer,
  mode,
  eyeBreaks,
  draft,
  disabled,
  onToggle,
  onStop,
  onMode,
  onEyeBreaks,
  onDraft,
}: TimerPanelProps) {
  const shownMode = timer.phase === 'idle' ? mode : timer.mode;
  const modeLocked = disabled || timer.phase === 'running';

  return (
    <section className="timer" aria-label="Timer" data-status={view.status}>
      <div className="modes" role="radiogroup" aria-label="Mode">
        {TIMER_MODES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === shownMode}
            className="mode"
            disabled={modeLocked}
            onClick={() => {
              onMode(option);
            }}
          >
            {MODE_SPECS[option].label}
          </button>
        ))}
      </div>

      <p className="clock" role="timer" aria-label="Time">
        {view.clock}
      </p>
      <p className="caption">{caption(view, timer, mode)}</p>

      {view.eyeRestSeconds !== null && (
        <p className="banner banner-eye" role="status">
          Rest your eyes. Look 20 feet away for {view.eyeRestSeconds} s.
        </p>
      )}

      <div className="actions">
        <button type="button" className="button primary" disabled={disabled} onClick={onToggle}>
          {TOGGLE_LABELS[view.status]}
          {view.status !== 'break' && <kbd>Space</kbd>}
        </button>
        <button
          type="button"
          className="button"
          disabled={disabled || timer.phase === 'idle'}
          onClick={onStop}
        >
          {timer.phase === 'break' ? 'End break' : 'Stop and save'}
          <kbd>⌘↵</kbd>
        </button>
      </div>

      <div className="fields">
        <label className="field field-note">
          <span>Note</span>
          <input
            type="text"
            value={draft.note}
            maxLength={NOTE_MAX_LENGTH}
            placeholder="What is this session for?"
            disabled={disabled}
            onChange={(event) => {
              onDraft({ ...draft, note: event.target.value });
            }}
          />
        </label>
        <label className="field field-project">
          <span>Project</span>
          <input
            type="text"
            value={draft.project}
            maxLength={PROJECT_MAX_LENGTH}
            placeholder="Optional"
            disabled={disabled}
            onChange={(event) => {
              onDraft({ ...draft, project: event.target.value });
            }}
          />
        </label>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={eyeBreaks}
          disabled={disabled}
          onChange={(event) => {
            onEyeBreaks(event.target.checked);
          }}
        />
        <span>20-20-20 eye breaks</span>
        <small>A 20-second reminder for every 20 minutes of work.</small>
      </label>
    </section>
  );
}
