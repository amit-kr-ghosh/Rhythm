import { openIdbPersistence } from '../../src/data/idb';
import { MemoryBackend } from '../../src/data/memoryBackend';
import { Repo } from '../../src/data/repo';
import { SyncEngine } from '../../src/data/syncEngine';
(window as unknown as { R: unknown }).R = { openIdbPersistence, MemoryBackend, Repo, SyncEngine };
