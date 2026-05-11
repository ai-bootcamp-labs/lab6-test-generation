import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DB } from '../../../src/auth/repositories/db-types.js';

/**
 * Stateful test harness that boots an ephemeral Postgres container, runs the
 * `backend/migrations/*.sql` files in lexical order, and exposes a Kysely
 * client bound to the live container.
 */
export interface DbHarness {
  db: Kysely<DB>;
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
  /** Apply all migrations in `backend/migrations/` in lexical order. */
  migrate(): Promise<void>;
  /** Stop the container and release the pool. */
  stop(): Promise<void>;
}

/**
 * Boot a Postgres testcontainer and return a {@link DbHarness}. Call
 * {@link DbHarness.migrate} after creation, then run tests, then
 * {@link DbHarness.stop} in `afterAll`.
 * @returns Started harness ready for migration.
 */
export async function startDb(): Promise<DbHarness> {
  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('authdb')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

  /** Apply all SQL migrations in order. */
  async function migrate(): Promise<void> {
    const dir = resolve(__dirname, '..', '..', '..', 'migrations');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      const sql = await readFile(join(dir, f), 'utf8');
      await pool.query(sql);
    }
  }

  /** Tear down container + pool. `db.destroy()` already ends the underlying pg pool. */
  async function stop(): Promise<void> {
    await db.destroy();
    await container.stop();
  }

  return { db, container, pool, migrate, stop };
}

/**
 * Convenience wrapper that boots and migrates a harness, runs the supplied
 * test body, and tears down regardless of outcome.
 * @param body - Test body to execute against the harness.
 * @returns Whatever `body` returns.
 */
export async function withDb<T>(body: (h: DbHarness) => Promise<T>): Promise<T> {
  const h = await startDb();
  await h.migrate();
  try {
    return await body(h);
  } finally {
    await h.stop();
  }
}
