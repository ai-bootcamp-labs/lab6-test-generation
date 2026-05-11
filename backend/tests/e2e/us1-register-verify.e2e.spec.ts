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
}, 90_000);

afterAll(async () => {
  await h.stop();
});

describe('Story 1: Register and verify email (E2E)', () => {
  it('Scenario 1 — happy path: register → email captured → verify → user active', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'e2e-1@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(reg.status).toBe(201);

    const captured = email.sent.filter((m) => m.to === 'e2e-1@example.com').slice(-1)[0];
    expect(captured?.kind).toBe('verification');

    const verify = await request(app).post('/auth/verify-email').send({ token: captured!.token });
    expect(verify.status).toBe(204);

    const row = await h.db
      .selectFrom('auth.users')
      .select(['status', 'verified_at'])
      .where('email', '=', 'e2e-1@example.com')
      .executeTakeFirst();
    expect(row?.status).toBe('active');
    expect(row?.verified_at).not.toBeNull();
  });

  it('Scenario 2 — duplicate registration leaks no enumeration signal', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'e2e-2@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const second = await request(app)
      .post('/auth/register')
      .send({ email: 'e2e-2@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ accepted: true });
  });

  it('Scenario 3 — expired/used token returns 410', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'e2e-3@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const captured = email.sent.filter((m) => m.to === 'e2e-3@example.com').slice(-1)[0]!;
    await request(app).post('/auth/verify-email').send({ token: captured.token });
    const reuse = await request(app).post('/auth/verify-email').send({ token: captured.token });
    expect(reuse.status).toBe(410);
  });
});
