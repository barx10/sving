/** Human-readable ride time, e.g. "4 t 15 min". */
export function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  return hours > 0 ? `${hours} t ${safeMinutes % 60} min` : `${safeMinutes} min`;
}

/** Short Norwegian date, e.g. "14. juni 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('no-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Clock time in 24-hour Norwegian format, e.g. "09:30". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
}
