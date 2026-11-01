/**
 * Web session storage. Browsers have no hardware-backed keystore, so the Supabase session lives in localStorage (the
 * supabase-js default). It is scoped to this site's origin and cleared on sign-out. If storage is blocked, the session
 * is kept in memory for the page's lifetime only.
 */
const mem = new Map<string, string>();
const ls = (): Storage | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try { return ls()?.getItem(key) ?? mem.get(key) ?? null; } catch { return mem.get(key) ?? null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    mem.set(key, value);
    try { ls()?.setItem(key, value); } catch { /* quota / blocked: memory copy remains */ }
  },
  async removeItem(key: string): Promise<void> {
    mem.delete(key);
    try { ls()?.removeItem(key); } catch { /* nothing to remove */ }
  },
};
