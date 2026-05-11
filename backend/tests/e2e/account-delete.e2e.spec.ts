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

let h: DbHarness;
let app: express.Express;
const PWD = 'Str0ng!Passw0rd-XYZ';

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
}, 120_000);

afterAll(async () => {
  await h.stop();
});

/** @param addr - Email. @returns Login cookies. */
async function seedAndLogin(addr: string): Promise<{
  sessionCookie: string;
  csrfCookie: string;
  csrfValue: string;
}> {
  const hash = await bcrypt.hash(PWD, 4);
  await h.db
    .insertInto('auth.users')
    .values({ email: addr, password_hash: hash, status: 'active', verified_at: new Date() })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const res = await request(app).post('/auth/login').send({ email: addr, password: PWD });
  const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
  const sessionCookie = cookies.find((c) => c.startsWith('auth_session='))!.split(';')[0]!;
  const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='))!.split(';')[0]!;
  const csrfValue = csrfCookie.split('=')[1]!;
  return { sessionCookie, csrfCookie, csrfValue };
}

describe('DELETE /auth/account — E2E', () => {
  it('soft-deletes the account, revokes the session, and clears cookies', async () => {
    const { sessionCookie, csrfCookie, csrfValue } = await seedAndLogin('delete-me@example.com');
    const res = await request(app)
      .delete('/auth/account')
      .set('Cookie', [sessionCookie, csrfCookie].join('; '))
      .set('x-csrf-token', csrfValue);
    expect(res.status).toBe(204);

    const probe = await request(app).get('/auth/session').set('Cookie', sessionCookie);
    expect(probe.status).toBe(401);

    const row = await h.db
      .selectFrom('auth.users')
      .select(['status', 'deleted_at'])
      .where('email', '=', 'delete-me@example.com')
      .executeTakeFirst();
    expect(row?.status).toBe('disabled');
    expect(row?.deleted_at).not.toBeNull();

    const ev = await h.db
      .selectFrom('auth.security_events')
      .select(['event_type', 'outcome'])
      .where('event_type', '=', 'account_delete')
      .execute();
    expect(ev.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 without a session cookie', async () => {
    const res = await request(app).delete('/auth/account');
    expect(res.status).toBe(401);
  });

  it('returns 403 without a CSRF header', async () => {
    const { sessionCookie, csrfCookie } = await seedAndLogin('delete-csrf@example.com');
    const res = await request(app)
      .delete('/auth/account')
      .set('Cookie', [sessionCookie, csrfCookie].join('; '));
    expect(res.status).toBe(403);
  });
});
