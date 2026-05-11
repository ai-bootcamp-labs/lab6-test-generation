import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { startDb, type DbHarness } from '../integration/_helpers/db.js';
import { buildAuthRouter } from '../../src/auth/index.js';
import { errorMapper } from '../../src/auth/middleware/error-mapper.js';
import { SystemClock } from '../../src/auth/adapters/clock.port.js';
import { FakeEmailAdapter } from '../unit/_helpers/fakes.js';
import type { AppConfig } from '../../src/infra/config.js';

const PWD = 'Str0ng!Passw0rd-XYZ';
const SAMPLE_SIZE = 25;

let h: DbHarness;
let app: express.Express;

beforeAll(async () => {
  h = await startDb();
  await h.migrate();
  const config: AppConfig = {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: h.container.getConnectionUri(),
    JWT_SECRET: 'x'.repeat(64),
    COOKIE_DOMAIN: 'localhost',
    SMTP_URL: 'smtp://localhost:1025',
    PASSWORD_BCRYPT_COST: 4,
  };
  app = express();
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(
    '/auth',
    buildAuthRouter({ config, db: h.db, clock: new SystemClock(), email: new FakeEmailAdapter() }),
  );
  app.use(errorMapper);

  // Seed one active user for the login-wrong-password sample.
  const hash = await bcrypt.hash(PWD, 4);
  await h.db
    .insertInto('auth.users')
    .values({ email: 'timing@example.com', password_hash: hash, status: 'active', verified_at: new Date() })
    .onConflict((oc) => oc.doNothing())
    .execute();
}, 180_000);

afterAll(async () => {
  await h?.stop();
});

/** @returns Sorted ascending array (a copy of `xs`). */
function sortAsc(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

/** @returns p95 (interpolation) of the supplied samples. */
function p95(xs: number[]): number {
  const s = sortAsc(xs);
  if (s.length === 0) return 0;
  const idx = Math.min(s.length - 1, Math.floor(0.95 * s.length));
  return s[idx]!;
}

/** Run `fn()` `n` times and return the durations in milliseconds. */
async function sampleMs(n: number, fn: () => Promise<unknown>): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const start = Date.now();
    await fn();
    out.push(Date.now() - start);
  }
  return out;
}

describe('Timing parity (SC-002, SC-003) — p95 within ±150ms', () => {
  it('register-existing vs register-fresh', async () => {
    // Pre-seed one user so the "existing" branch hits the duplicate path.
    const hash = await bcrypt.hash(PWD, 4);
    await h.db
      .insertInto('auth.users')
      .values({ email: 'existing@example.com', password_hash: hash, status: 'active', verified_at: new Date() })
      .onConflict((oc) => oc.doNothing())
      .execute();

    const existing = await sampleMs(SAMPLE_SIZE, () =>
      request(app).post('/auth/register').send({ email: 'existing@example.com', password: PWD }),
    );
    const fresh = await sampleMs(SAMPLE_SIZE, () =>
      request(app).post('/auth/register').send({ email: `fresh-${Date.now()}-${Math.random()}@example.com`, password: PWD }),
    );

    expect(Math.abs(p95(existing) - p95(fresh))).toBeLessThanOrEqual(150);
  }, 60_000);

  it('login-unknown-user vs login-wrong-password', async () => {
    const unknown = await sampleMs(SAMPLE_SIZE, () =>
      request(app).post('/auth/login').send({ email: `nobody-${Math.random()}@example.com`, password: PWD }),
    );
    const wrong = await sampleMs(SAMPLE_SIZE, () =>
      request(app).post('/auth/login').send({ email: 'timing@example.com', password: 'wrong-password-xyz' }),
    );

    expect(Math.abs(p95(unknown) - p95(wrong))).toBeLessThanOrEqual(150);
  }, 60_000);
});
