import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage backed by the Android Keystore (expo-secure-store).
 * SecureStore values are limited in size, so a session JSON is split into chunks.
 */
const CHUNK = 1800;
const k = (key: string, i: number) => `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.${i}`;
const countKey = (key: string) => k(key, -1);

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const n = Number(await SecureStore.getItemAsync(countKey(key)));
      if (!Number.isFinite(n) || n <= 0) return null;
      let out = '';
      for (let i = 0; i < n; i++) {
        const part = await SecureStore.getItemAsync(k(key, i));
        if (part === null) return null; // partial write → treat as signed out rather than parse garbage
        out += part;
      }
      return out;
    } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [];
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(k(key, i), parts[i] as string);
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
  },
  async removeItem(key: string): Promise<void> {
    try {
      const n = Number(await SecureStore.getItemAsync(countKey(key)));
      for (let i = 0; i < (Number.isFinite(n) ? n : 0); i++) await SecureStore.deleteItemAsync(k(key, i));
      await SecureStore.deleteItemAsync(countKey(key));
    } catch { /* nothing stored */ }
  },
};
