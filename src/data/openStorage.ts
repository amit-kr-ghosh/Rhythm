import type { Backend } from './backend';
import { SqliteBackend } from './sqliteBackend';
import { openExpoDriver } from './expoDriver';

/** Android / iOS (and Expo Go): on-device SQLite via expo-sqlite. The web build uses openStorage.web.ts instead. */
export async function openStorage(): Promise<Backend> {
  return new SqliteBackend(await openExpoDriver());
}
