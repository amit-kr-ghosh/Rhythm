import type { Change, Persistence, Snapshot } from '../../src/data/memoryBackend';

/** A durable store stand-in with the same contract as IndexedDB persistence: atomic commit, load returns what was committed. */
export class FakePersistence implements Persistence {
  entities = new Map<string, unknown>(); outbox = new Map<string, unknown>(); conflicts = new Map<string, unknown>(); kv = new Map<string, unknown>();
  failNextCommit = false;
  commits = 0;
  private listeners = new Set<() => void>();
  peers = new Set<FakePersistence>();

  async load(): Promise<Snapshot> {
    const clone = <T>(m: Map<string, unknown>) => [...m.entries()].map(([k, v]) => [k, structuredClone(v)] as [string, T]);
    return { entities: clone(this.entities), outbox: clone(this.outbox), conflicts: clone(this.conflicts), kv: clone(this.kv) } as unknown as Snapshot;
  }
  async commit(changes: Change[]): Promise<void> {
    if (this.failNextCommit) { this.failNextCommit = false; throw new Error('disk full'); }
    this.commits++;
    for (const c of changes) {
      const m = this[c.table] as Map<string, unknown>;
      if (c.value === undefined) m.delete(c.key); else m.set(c.key, structuredClone(c.value));
    }
  }
  subscribe(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  announce() { for (const p of this.peers) p.listeners.forEach((l) => l()); }
}
