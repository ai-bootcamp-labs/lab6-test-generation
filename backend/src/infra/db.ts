import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { AppConfig } from './config.js';
import type { DB } from '../auth/repositories/db-types.js';

/**
 * Singleton holder for the active Kysely instance. Constructed lazily by
 * {@link buildDb} so tests can compose alternative pools.
 */
let instance: Kysely<DB> | null = null;

/**
 * Build (or return the existing) Kysely instance bound to a `pg.Pool`
 * configured from the supplied {@link AppConfig}.
 * @param config - Application configuration containing `DATABASE_URL`.
 * @returns A typed Kysely instance for the `auth` schema database.
 */
export function buildDb(config: Pick<AppConfig, 'DATABASE_URL'>): Kysely<DB> {
  if (instance) return instance;
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  instance = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
  return instance;
}

/**
 * Reset the singleton. Intended for test teardown only.
 * @returns A promise that resolves once the underlying pool is closed.
 */
export async function destroyDb(): Promise<void> {
  if (!instance) return;
  await instance.destroy();
  instance = null;
}
