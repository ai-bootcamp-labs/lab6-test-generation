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

/** @param e - Email. */
async function seedActive(e: string): Promise<void> {
  const hash = await bcrypt.hash(PWD, 4);
  await h.db
    .insertInto('auth.users')
    .values({ email: e, password_hash: hash, status: 'active', verified_at: new Date() })
    .execute();
}

describe('POST /auth/password-reset/request — contract', () => {
  it('returns 202 + accepted for known email', async () => {
    await seedActive('reset-known@example.com');
    const res = await request(app)
      .post('/auth/password-reset/request')
      .send({ email: 'reset-known@example.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  it('returns 202 + identical body for unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/auth/password-reset/request')
      .send({ email: 'reset-unknown@example.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
  });

  it('returns 400 on malformed email', async () => {
    const res = await request(app).post('/auth/password-reset/request').send({ email: 'not-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/password-reset/confirm — contract', () => {
  it('returns 204 on success and rotates the password', async () => {
    await seedActive('reset-flow@example.com');
    await request(app).post('/auth/password-reset/request').send({ email: 'reset-flow@example.com' });
    const captured = email.sent.filter((m) => m.to === 'reset-flow@example.com').slice(-1)[0]!;
    const res = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: captured.token, password: 'NewStr0ng!Passw0rd' });
    expect(res.status).toBe(204);

    // Old password no longer authenticates
    const oldLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'reset-flow@example.com', password: PWD });
    expect(oldLogin.status).toBe(401);

    // New password authenticates
    const newLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'reset-flow@example.com', password: 'NewStr0ng!Passw0rd' });
    expect(newLogin.status).toBe(200);
  });

  it('returns 410 for a reused token', async () => {
    await seedActive('reset-reuse@example.com');
    await request(app).post('/auth/password-reset/request').send({ email: 'reset-reuse@example.com' });
    const captured = email.sent.filter((m) => m.to === 'reset-reuse@example.com').slice(-1)[0]!;
    await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: captured.token, password: 'NewStr0ng!Passw0rd' });
    const second = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: captured.token, password: 'AnotherStr0ng!Passw0rd' });
    expect(second.status).toBe(410);
  });

  it('returns 400 for weak new password', async () => {
    await seedActive('reset-weak@example.com');
    await request(app).post('/auth/password-reset/request').send({ email: 'reset-weak@example.com' });
    const captured = email.sent.filter((m) => m.to === 'reset-weak@example.com').slice(-1)[0]!;
    const res = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: captured.token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an unknown token', async () => {
    const res = await request(app)
      .post('/auth/password-reset/confirm')
      .send({ token: 'garbage'.repeat(8), password: 'NewStr0ng!Passw0rd' });
    expect(res.status).toBe(400);
  });
});
