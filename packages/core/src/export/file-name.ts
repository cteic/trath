import { PRODUCT_SLUG } from '../product';
import type { DayRange } from '../sessions/day';

export const EXPORT_FORMATS = ['md', 'csv'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** `trath-2026-11-18.md`, or `trath-2026-11-16_2026-11-18.csv` for a range. */
export function exportFileName(range: DayRange, format: ExportFormat): string {
  const span = range.from === range.to ? range.from : `${range.from}_${range.to}`;
  return `${PRODUCT_SLUG}-${span}.${format}`;
}
