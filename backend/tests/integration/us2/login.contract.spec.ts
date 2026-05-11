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
  await h?.stop();
});

/** @returns Email of the freshly-created verified user. */
async function seedActiveUser(email: string): Promise<void> {
  const hash = await bcrypt.hash(PWD, 4);
  await h.db
    .insertInto('auth.users')
    .values({ email, password_hash: hash, status: 'active', verified_at: new Date() })
    .execute();
}

describe('POST /auth/login — contract', () => {
  it('returns 200 + sets session + csrf cookies on success', async () => {
    await seedActiveUser('login-ok@example.com');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login-ok@example.com', password: PWD });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: expect.any(String),
      sessionId: expect.any(String),
      expiresAt: expect.any(String),
    });
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    const session = cookies.find((c) => c.startsWith('auth_session='));
    const csrf = cookies.find((c) => c.startsWith('csrf_token='));
    expect(session).toBeDefined();
    expect(csrf).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('returns 401 with INVALID_CREDENTIALS for unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: PWD });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ reasonCode: 'invalid_credentials' });
  });

  it('returns 401 with the SAME shape for wrong password', async () => {
    await seedActiveUser('login-wrong@example.com');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login-wrong@example.com', password: 'NotItXXXXXXXX!' });
    expect(res.status).toBe(401);
    expect(res.body.reasonCode).toBe('invalid_credentials');
  });

  it('returns 403 with account_pending for unverified accounts', async () => {
    const hash = await bcrypt.hash(PWD, 4);
    await h.db
      .insertInto('auth.users')
      .values({ email: 'pending-login@example.com', password_hash: hash, status: 'pending' })
      .execute();
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'pending-login@example.com', password: PWD });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ reasonCode: 'account_pending' });
  });

  it('returns 400 for malformed body', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'no-pwd@example.com' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/session', () => {
  it('returns 401 when no cookie present', async () => {
    const res = await request(app).get('/auth/session');
    expect(res.status).toBe(401);
  });

  it('returns 200 with session info when authenticated', async () => {
    await seedActiveUser('session-get@example.com');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'session-get@example.com', password: PWD });
    const cookies = (login.headers['set-cookie'] as unknown as string[]) ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith('auth_session='))!;
    const res = await request(app).get('/auth/session').set('Cookie', sessionCookie.split(';')[0]!);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      userId: expect.any(String),
      sessionId: expect.any(String),
      expiresAt: expect.any(String),
    });
  });
});
