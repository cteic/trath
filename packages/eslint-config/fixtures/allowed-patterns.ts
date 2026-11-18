export interface Settings {
  label: string;
}

export type Mode = 'work' | 'break';

export const MODES = ['work', 'break'] as const;

export function labels(settings: Settings[]): string[] {
  return settings.map((entry) => entry.label);
}
