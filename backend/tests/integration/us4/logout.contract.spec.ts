import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { startDb, type DbHarness } from '../_helpers/db.js';
import { buildAuthRouter } from '../../../src/auth/index.js';
import { errorMapper } from '../../../src/auth/middleware/error-mapper.js';
import { SystemClock } from '../../../src/auth/adapters/clock.port.js';
import { FakeEmailAdapter } from '../../unit/_helpers/fakes.js';
import type { AppConfig } from '../../../src/infra/config.js';

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

/**
 * @param emailAddr
 * @returns Set-Cookie tuple from a fresh login.
 */
async function loginFreshUser(emailAddr: string): Promise<{
  sessionCookie: string;
  csrfCookie: string;
  csrfValue: string;
}> {
  const hash = await bcrypt.hash(PWD, 4);
  await h.db
    .insertInto('auth.users')
    .values({ email: emailAddr, password_hash: hash, status: 'active', verified_at: new Date() })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const res = await request(app).post('/auth/login').send({ email: emailAddr, password: PWD });
  const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
  const sessionCookie = cookies.find((c) => c.startsWith('auth_session='))!.split(';')[0]!;
  const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='))!.split(';')[0]!;
  const csrfValue = csrfCookie.split('=')[1]!;
  return { sessionCookie, csrfCookie, csrfValue };
}

describe('POST /auth/logout — contract', () => {
  it('returns 401 when no session cookie present', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });

  it('returns 403 when CSRF header is missing despite valid session', async () => {
    const { sessionCookie, csrfCookie } = await loginFreshUser('logout-csrf-miss@example.com');
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie].join('; '));
    expect(res.status).toBe(403);
  });

  it('returns 204 with valid session + matching CSRF and revokes the session', async () => {
    const { sessionCookie, csrfCookie, csrfValue } = await loginFreshUser('logout-ok@example.com');
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie].join('; '))
      .set('x-csrf-token', csrfValue);
    expect(res.status).toBe(204);

    // Subsequent /auth/session must now be 401
    const probe = await request(app).get('/auth/session').set('Cookie', sessionCookie);
    expect(probe.status).toBe(401);
  });

  it('clears the auth_session and csrf_token cookies on success', async () => {
    const { sessionCookie, csrfCookie, csrfValue } = await loginFreshUser('logout-clear@example.com');
    const res = await request(app)
      .post('/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie].join('; '))
      .set('x-csrf-token', csrfValue);
    expect(res.status).toBe(204);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    // Cleared cookies are emitted with an Expires in the past or Max-Age=0.
    expect(setCookie.some((c) => c.startsWith('auth_session='))).toBe(true);
    expect(setCookie.some((c) => c.startsWith('csrf_token='))).toBe(true);
  });
});
