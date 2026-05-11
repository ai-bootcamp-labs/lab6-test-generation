import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { startDb, type DbHarness } from '../integration/_helpers/db.js';
import { buildAuthRouter } from '../../src/auth/index.js';
import { errorMapper } from '../../src/auth/middleware/error-mapper.js';
import { SystemClock } from '../../src/auth/adapters/clock.port.js';
import { FakeEmailAdapter } from '../unit/_helpers/fakes.js';
import type { AppConfig } from '../../src/infra/config.js';

let h: DbHarness;
let email: FakeEmailAdapter;
let app: express.Express;
const PWD = 'Str0ng!Passw0rd-XYZ';

beforeAll(async () => {
  h = await startDb();
  await h.migrate();
  email = new FakeEmailAdapter();
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
  app.use('/auth', buildAuthRouter({ config, db: h.db, clock: new SystemClock(), email }));
  app.use(errorMapper);
}, 120_000);

afterAll(async () => {
  await h?.stop();
});

/** Register + verify a fresh user, returning the email used. */
async function registerAndVerify(addr: string): Promise<void> {
  await request(app).post('/auth/register').send({ email: addr, password: PWD });
  const cap = email.sent.filter((m) => m.to === addr).slice(-1)[0]!;
  await request(app).post('/auth/verify-email').send({ token: cap.token });
}

describe('Story 2: Login + session (E2E)', () => {
  it('Scenario 1 — login with verified credentials issues cookies and a readable session', async () => {
    await registerAndVerify('us2-happy@example.com');
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'us2-happy@example.com', password: PWD });
    expect(login.status).toBe(200);
    const cookies = (login.headers['set-cookie'] as unknown as string[]) ?? [];
    const session = cookies.find((c) => c.startsWith('auth_session='))!;
    const csrf = cookies.find((c) => c.startsWith('csrf_token='))!;
    expect(session).toMatch(/HttpOnly/);

    const probe = await request(app)
      .get('/auth/session')
      .set('Cookie', [session.split(';')[0]!, csrf.split(';')[0]!].join('; '));
    expect(probe.status).toBe(200);
    expect(probe.body.userId).toBe(login.body.userId);
  });

  it('Scenario 2 — login with wrong password returns generic 401 (no enumeration)', async () => {
    await registerAndVerify('us2-wrong@example.com');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'us2-wrong@example.com', password: 'NotItXXXXXXXX!' });
    expect(res.status).toBe(401);
    expect(res.body.reasonCode).toBe('invalid_credentials');
  });

  it('Scenario 3 — pending account cannot log in even with the correct password', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'us2-pending@example.com', password: PWD });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'us2-pending@example.com', password: PWD });
    expect(res.status).toBe(403);
    expect(res.body.reasonCode).toBe('account_pending');
  });

  it('Scenario 4 — account locks after 5 failed attempts and stays locked even with right password', async () => {
    await registerAndVerify('us2-lockout@example.com');
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/auth/login')
        .send({ email: 'us2-lockout@example.com', password: 'wrong-' + String(i) + 'XXXXXX' });
    }
    const blocked = await request(app)
      .post('/auth/login')
      .send({ email: 'us2-lockout@example.com', password: PWD });
    expect(blocked.status).toBe(423);
    expect(blocked.body.reasonCode).toBe('account_locked');
  });
});
