import { DatabaseSync } from 'node:sqlite';
import { createDriver, type SqlDriver, type SqlParam } from '../../src/data/driver';

/** Real SQLite (Node's built-in engine) behind the same driver interface the app uses with expo-sqlite. */
export function openMemoryDriver(): SqlDriver {
  const db = new DatabaseSync(':memory:');
  return createDriver({
    exec: async (sql) => { db.exec(sql); },
    run: async (sql, params: SqlParam[]) => { db.prepare(sql).run(...params); },
    all: async <T>(sql: string, params: SqlParam[]) => db.prepare(sql).all(...params) as T[],
  });
}
