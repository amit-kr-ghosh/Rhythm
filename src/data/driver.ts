/**
 * Minimal async SQL abstraction. The app implements it with expo-sqlite (expoDriver.ts); tests implement it with
 * Node's built-in SQLite so the repository and sync engine are exercised against a real SQL engine.
 */
export type SqlParam = string | number | null;

export interface SqlRunner {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

export interface SqlDriver extends SqlRunner {
  /** Runs `fn` atomically. All statements inside must go through the provided `tx` runner. */
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

/** The raw, un-serialised operations a concrete engine must provide. */
export interface RawEngine {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlParam[]): Promise<void>;
  all<T>(sql: string, params: SqlParam[]): Promise<T[]>;
}

/**
 * Wraps a raw engine so that every statement — and every transaction — runs strictly one at a time.
 * This avoids interleaved transactions (BEGIN inside BEGIN) when several async callers hit the database.
 */
export function createDriver(raw: RawEngine): SqlDriver {
  let tail: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const next = tail.then(job, job);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
  const runner: SqlRunner = {
    exec: (sql) => raw.exec(sql),
    run: (sql, params = []) => raw.run(sql, params),
    all: <T>(sql: string, params: SqlParam[] = []) => raw.all<T>(sql, params),
  };
  return {
    exec: (sql) => enqueue(() => runner.exec(sql)),
    run: (sql, params) => enqueue(() => runner.run(sql, params)),
    all: <T>(sql: string, params?: SqlParam[]) => enqueue(() => runner.all<T>(sql, params)),
    transaction: <T>(fn: (tx: SqlRunner) => Promise<T>) =>
      enqueue(async () => {
        await raw.exec('BEGIN IMMEDIATE');
        try {
          const out = await fn(runner);
          await raw.exec('COMMIT');
          return out;
        } catch (e) {
          try { await raw.exec('ROLLBACK'); } catch { /* connection already rolled back */ }
          throw e;
        }
      }),
  };
}
