import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { startDb, type DbHarness } from '../_helpers/db.js';
import { buildAuthRouter } from '../../../src/auth/index.js';
import { errorMapper } from '../../../src/auth/middleware/error-mapper.js';
import { SystemClock } from '../../../src/auth/adapters/clock.port.js';
import { FakeEmailAdapter } from '../../unit/_helpers/fakes.js';
import type { AppConfig } from '../../../src/infra/config.js';

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

describe('POST /auth/verify-email — contract', () => {
  it('returns 204 when consuming a valid token', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'v1@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const captured = email.sent.filter((m) => m.to === 'v1@example.com').slice(-1)[0];
    expect(captured).toBeDefined();
    const res = await request(app).post('/auth/verify-email').send({ token: captured!.token });
    expect(res.status).toBe(204);
  });

  it('returns 410 when the token has already been used', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'v2@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const captured = email.sent.filter((m) => m.to === 'v2@example.com').slice(-1)[0]!;
    await request(app).post('/auth/verify-email').send({ token: captured.token });
    const res = await request(app).post('/auth/verify-email').send({ token: captured.token });
    expect(res.status).toBe(410);
  });

  it('returns 400 when the token is missing', async () => {
    const res = await request(app).post('/auth/verify-email').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when the token is gibberish', async () => {
    const res = await request(app).post('/auth/verify-email').send({ token: 'no-such-token-1234567890' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/verify-email/resend — contract', () => {
  it('returns 202 for known pending email', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'resend1@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const res = await request(app)
      .post('/auth/verify-email/resend')
      .send({ email: 'resend1@example.com' });
    expect(res.status).toBe(202);
  });

  it('returns 202 for unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/auth/verify-email/resend')
      .send({ email: 'unknown-resend@example.com' });
    expect(res.status).toBe(202);
  });
});
