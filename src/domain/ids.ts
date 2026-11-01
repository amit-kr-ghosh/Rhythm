/** Random UUID v4 (uses crypto.randomUUID when available, falls back to Math.random). */
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function fnv(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic UUID-shaped id from a string. Same input → same id on every device (idempotent upserts). Not cryptographic. */
export function deterministicUuid(input: string): string {
  const parts = [2166136261, 3339675911, 2654435761, 1013904223].map((s) => fnv(input, s));
  const hex = parts.map((p) => p.toString(16).padStart(8, '0')).join('');
  const v = hex.split('');
  v[12] = '5'; // version nibble
  v[16] = ['8', '9', 'a', 'b'][parseInt(v[16] ?? '0', 16) % 4] as string;
  const s = v.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export const nowIso = (now: Date = new Date()): string => now.toISOString();
