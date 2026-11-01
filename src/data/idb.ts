import type { Change, Persistence, Snapshot, TableName } from './memoryBackend';

/**
 * IndexedDB persistence for the web build. One database, four object stores (entities, outbox, conflicts, kv) with
 * out-of-line string keys. A commit writes every changed key in ONE readwrite transaction, so it is all-or-nothing.
 * Other tabs are told about commits through a BroadcastChannel so they can reload.
 */
const STORES: TableName[] = ['entities', 'outbox', 'conflicts', 'kv'];

export type IdbOptions = { name?: string; factory?: IDBFactory; channel?: boolean };

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed')); });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function openIdbPersistence(opts: IdbOptions = {}): Promise<Persistence> {
  const name = opts.name ?? 'rhythm-web';
  const factory = opts.factory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  if (!factory) throw new Error('IndexedDB is not available in this browser.');

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(name, 1);
    open.onupgradeneeded = () => { for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Could not open IndexedDB.'));
    open.onblocked = () => reject(new Error('IndexedDB is blocked by another tab. Close other Rhythm tabs and reload.'));
  });
  // If another tab upgrades the schema in future, close so it is not blocked by us.
  db.onversionchange = () => db.close();

  // Ask the browser not to evict our data under storage pressure (best effort; ignored where unsupported).
  try { void (navigator as Navigator).storage?.persist?.(); } catch { /* optional */ }

  const channel = opts.channel !== false && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${name}:changes`) : null;

  const readAll = async (store: TableName): Promise<[string, unknown][]> => {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const [keys, values] = await Promise.all([request(os.getAllKeys()), request(os.getAll())]);
    await done(tx);
    return keys.map((k, i) => [String(k), values[i]] as [string, unknown]);
  };

  return {
    async load(): Promise<Snapshot> {
      const [entities, outbox, conflicts, kv] = await Promise.all(STORES.map(readAll));
      return { entities, outbox, conflicts, kv } as unknown as Snapshot;
    },
    async commit(changes: Change[]): Promise<void> {
      if (changes.length === 0) return;
      const tx = db.transaction(STORES, 'readwrite');
      for (const c of changes) {
        const os = tx.objectStore(c.table);
        if (c.value === undefined) os.delete(c.key); else os.put(c.value, c.key);
      }
      await done(tx);
    },
    subscribe(cb) {
      if (!channel) return () => undefined;
      const h = () => cb();
      channel.addEventListener('message', h);
      return () => channel.removeEventListener('message', h);
    },
    announce() { try { channel?.postMessage('changed'); } catch { /* channel closed */ } },
  };
}
