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
const NEW_PWD = 'NewStr0ng!Passw0rd-ABC';

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
  await h.stop();
});

/**
 * Register + verify a user through the public flow. @param addr - Email.
 * @param addr
 */
async function registerAndVerify(addr: string): Promise<void> {
  await request(app).post('/auth/register').send({ email: addr, password: PWD });
  const cap = email.sent.filter((m) => m.to === addr).slice(-1)[0]!;
  await request(app).post('/auth/verify-email').send({ token: cap.token });
}

describe('Story 3: Password reset (E2E)', () => {
  it('Scenario 1 — reset path invalidates the prior session and rotates password', async () => {
    await registerAndVerify('us3-1@example.com');
    const login = await request(app).post('/auth/login').send({ email: 'us3-1@example.com', password: PWD });
    const cookies = (login.headers['set-cookie'] as unknown as string[]) ?? [];
    const sessionCookie = cookies.find((c) => c.startsWith('auth_session='))!.split(';')[0]!;

    await request(app).post('/auth/password-reset/request').send({ email: 'us3-1@example.com' });
    const cap = email.sent.filter((m) => m.kind === 'password_reset' && m.to === 'us3-1@example.com').slice(-1)[0]!;
    const confirm = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: cap.token, password: NEW_PWD });
    expect(confirm.status).toBe(204);

    // Old session is now revoked
    const probe = await request(app).get('/auth/session').set('Cookie', sessionCookie);
    expect(probe.status).toBe(401);

    // Old password fails
    const oldLogin = await request(app).post('/auth/login').send({ email: 'us3-1@example.com', password: PWD });
    expect(oldLogin.status).toBe(401);

    // New password succeeds
    const newLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'us3-1@example.com', password: NEW_PWD });
    expect(newLogin.status).toBe(200);
  });

  it('Scenario 2 — request with unknown email returns 202 + accepted (no email sent)', async () => {
    email.reset();
    const res = await request(app)
      .post('/auth/password-reset/request')
      .send({ email: 'us3-nobody@example.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(email.sent.filter((m) => m.kind === 'password_reset' && m.to === 'us3-nobody@example.com')).toHaveLength(0);
  });

  it('Scenario 3 — pending account that completes a reset becomes active (edge case)', async () => {
    await request(app).post('/auth/register').send({ email: 'us3-pending@example.com', password: PWD });
    // do NOT verify
    await request(app).post('/auth/password-reset/request').send({ email: 'us3-pending@example.com' });
    const cap = email.sent
      .filter((m) => m.kind === 'password_reset' && m.to === 'us3-pending@example.com')
      .slice(-1)[0]!;
    const confirm = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: cap.token, password: NEW_PWD });
    expect(confirm.status).toBe(204);

    const row = await h.db
      .selectFrom('auth.users')
      .select(['status', 'verified_at'])
      .where('email', '=', 'us3-pending@example.com')
      .executeTakeFirst();
    expect(row?.status).toBe('active');
    expect(row?.verified_at).not.toBeNull();
  });

  it('Scenario 4 — reused/expired token returns 410', async () => {
    await registerAndVerify('us3-reuse@example.com');
    await request(app).post('/auth/password-reset/request').send({ email: 'us3-reuse@example.com' });
    const cap = email.sent
      .filter((m) => m.kind === 'password_reset' && m.to === 'us3-reuse@example.com')
      .slice(-1)[0]!;
    await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: cap.token, password: NEW_PWD });
    const second = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: cap.token, password: 'YetAnother!Strong-12' });
    expect(second.status).toBe(410);
  });
});
