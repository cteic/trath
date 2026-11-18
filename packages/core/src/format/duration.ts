function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `25:00`, or `1:30:00` from one hour up. Rounds down to the second. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** `1h 05m`, `25m`, or `40s` for anything under a minute. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`;
  }
  return `${minutes}m`;
}

/** `5-minute`, for use in a sentence. */
export function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60_000)}-minute`;
}
