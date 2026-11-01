import * as SQLite from 'expo-sqlite';
import { createDriver, type SqlDriver } from './driver';

/** Opens (or creates) the on-device database and returns a serialised driver. */
export async function openExpoDriver(name = 'rhythm.db'): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return createDriver({
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params) => { await db.runAsync(sql, params); },
    all: <T>(sql: string, params: (string | number | null)[]) => db.getAllAsync<T>(sql, params),
  });
}
