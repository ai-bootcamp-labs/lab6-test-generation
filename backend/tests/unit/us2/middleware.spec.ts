import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';
import { csrf, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../../src/auth/middleware/csrf.js';
import { buildRequireSession, SESSION_COOKIE_NAME } from '../../../src/auth/middleware/require-session.js';
import { CsrfError, InvalidCredentialsError } from '../../../src/auth/domain/errors.js';
import type { Session, SessionId } from '../../../src/auth/domain/session.js';
import type { UserId } from '../../../src/auth/domain/user.js';
import type { SessionService } from '../../../src/auth/services/session.service.js';

/**
 * @param _req
 * @param _res
 * @param next
 * @returns Minimal error-mapper terminal middleware.
 */
function terminal(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof InvalidCredentialsError) res.status(401).json({ code: 'INVALID_CREDENTIALS' });
  else if (err instanceof CsrfError) res.status(403).json({ code: 'CSRF_FAILURE' });
  else res.status(500).json({ code: 'ERR' });
}

const SESSION: Session = {
  id: '11111111-1111-1111-1111-111111111111' as SessionId,
  userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as UserId,
  csrfSecret: 'secret-value',
  ip: null,
  userAgent: null,
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 86_400_000),
  revokedAt: null,
  revokeReason: null,
};

describe('require-session middleware', () => {
  it('rejects missing session cookie', async () => {
    const fake: Pick<SessionService, 'validate'> = { validate: jest.fn() } as never;
    const app = express();
    app.use(cookieParser());
    app.get('/p', buildRequireSession(fake as SessionService), terminal, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app).get('/p');
    expect(res.status).toBe(401);
  });

  it('attaches session on success', async () => {
    const fake = {
      validate: jest.fn(async () => ({ session: SESSION })),
    } as unknown as SessionService;
    const app = express();
    app.use(cookieParser());
    app.get('/p', buildRequireSession(fake), (req, res) => res.json({ uid: req.userId }));
    app.use(errorHandler);
    const res = await request(app)
      .get('/p')
      .set('Cookie', SESSION_COOKIE_NAME + '=anything');
    expect(res.status).toBe(200);
    expect(res.body.uid).toBe(SESSION.userId);
  });
});

describe('csrf middleware', () => {
  it('skips GET requests', async () => {
    const app = express();
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.session = SESSION;
      next();
    });
    app.get('/p', csrf, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app).get('/p');
    expect(res.status).toBe(200);
  });

  it('rejects POST without csrf header', async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.session = SESSION;
      next();
    });
    app.post('/p', csrf, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app)
      .post('/p')
      .set('Cookie', CSRF_COOKIE_NAME + '=' + SESSION.csrfSecret)
      .send({});
    expect(res.status).toBe(403);
  });

  it('accepts POST with matching cookie + header tied to session secret', async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.session = SESSION;
      next();
    });
    app.post('/p', csrf, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app)
      .post('/p')
      .set('Cookie', CSRF_COOKIE_NAME + '=' + SESSION.csrfSecret)
      .set(CSRF_HEADER_NAME, SESSION.csrfSecret)
      .send({});
    expect(res.status).toBe(200);
  });

  it('rejects mismatched header vs cookie', async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use((req, _res, next) => {
      req.session = SESSION;
      next();
    });
    app.post('/p', csrf, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app)
      .post('/p')
      .set('Cookie', CSRF_COOKIE_NAME + '=' + SESSION.csrfSecret)
      .set(CSRF_HEADER_NAME, 'wrong')
      .send({});
    expect(res.status).toBe(403);
  });
});
