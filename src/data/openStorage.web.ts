import type { Backend } from './backend';
import { MemoryBackend } from './memoryBackend';
import { openIdbPersistence } from './idb';

/**
 * Web: IndexedDB. If the browser refuses it (some private-browsing modes), fall back to memory so the app still works for
 * the session — `backend.persistent === false` lets the UI warn that nothing will be saved on this device.
 */
export async function openStorage(): Promise<Backend> {
  try {
    return new MemoryBackend(await openIdbPersistence());
  } catch {
    return new MemoryBackend(null);
  }
}
