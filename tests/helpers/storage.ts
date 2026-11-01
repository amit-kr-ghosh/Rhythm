import { openMemoryDriver } from './nodeDriver';
import { MemoryBackend } from '../../src/data/memoryBackend';
import { SqliteBackend } from '../../src/data/sqliteBackend';
import { FakePersistence } from './fakePersistence';
import type { Backend } from '../../src/data/backend';

export type BackendName = 'sqlite' | 'web';
export const ACTIVE_BACKEND: BackendName = process.env.RHYTHM_BACKEND === 'web' ? 'web' : 'sqlite';

export function makeBackend(name: BackendName = ACTIVE_BACKEND, persistence: FakePersistence = new FakePersistence()): Backend {
  return name === 'web' ? new MemoryBackend(persistence) : new SqliteBackend(openMemoryDriver());
}
