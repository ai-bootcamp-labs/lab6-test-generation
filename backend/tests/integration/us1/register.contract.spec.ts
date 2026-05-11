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

describe('POST /auth/register — contract', () => {
  it('returns 201 + accepted shape on a fresh email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'contract1@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ accepted: true });
  });

  it('returns 400 when password is too weak', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'contract2@example.com', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ status: 400, reasonCode: 'validation_error' });
  });

  it('returns 400 when email is malformed', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'Str0ng!Passw0rd-XYZ' });
    expect(res.status).toBe(400);
  });

  it('returns 201 even on duplicate email (no enumeration)', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ accepted: true });
  });
});
