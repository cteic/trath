import { formatMinutes } from '../format/duration';
import { MODE_SPECS, type TimerMode } from './modes';
import type { NoticeKind } from './timer';

export interface Notice {
  title: string;
  body: string;
}

export function noticeText(kind: NoticeKind, mode: TimerMode): Notice {
  const spec = MODE_SPECS[mode];
  switch (kind) {
    case 'work-done':
      return {
        title: `${spec.label} finished`,
        body:
          spec.breakMs === null
            ? 'Session saved.'
            : `Session saved. Take a ${formatMinutes(spec.breakMs)} break.`,
      };
    case 'break-done':
      return { title: 'Break over', body: 'Start the next session when you are ready.' };
    case 'eye-rest':
      return { title: 'Rest your eyes', body: 'Look at something 20 feet away for 20 seconds.' };
  }
}
