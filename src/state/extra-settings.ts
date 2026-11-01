import type { SyncState, SyncStatus } from '../data/syncEngine';

/** Minutes → { h, m } and back, for hour/minute target inputs. */
export const minToHM = (min: number): { h: number; m: number } => ({ h: Math.floor(min / 60), m: min % 60 });
export const hmToMin = (h: number | null, m: number | null): number => (h ?? 0) * 60 + (m ?? 0);

export function syncStateLabel(state: SyncState): string {
  switch (state) {
    case 'signed_out': return 'Not signed in (local only)';
    case 'idle': return 'Up to date';
    case 'syncing': return 'Syncing…';
    case 'offline': return 'Offline — changes are saved on this device';
    case 'error': return 'Some changes could not sync';
  }
}

export function syncSummary(s: SyncStatus): string {
  if (s.state === 'signed_out') return 'Local only';
  if (s.failed > 0) return `${s.failed} failed`;
  if (s.pending > 0) return `${s.pending} waiting to sync`;
  return syncStateLabel(s.state);
}

export function formatLastSync(ts: number | null, now: number = Date.now()): string {
  if (ts === null) return 'Never';
  const min = Math.round((now - ts) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleString();
}

/** The user must type this to enable the destructive "Delete my data" button. */
export const DELETE_PHRASE = 'DELETE';
export const isDeletePhrase = (s: string): boolean => s.trim() === DELETE_PHRASE;
