import { describe, expect, it, jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import { LoginService } from '../../../src/auth/services/login.service.js';
import { SessionService } from '../../../src/auth/services/session.service.js';
import { ThrottleService } from '../../../src/auth/services/throttle.service.js';
import type { Logger } from '../../../src/infra/logger.js';
import { FakeClock } from '../_helpers/fakes.js';
import { InMemoryUsersRepo } from '../_helpers/in-memory-repos.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';

const PWD = 'Str0ng!Passw0rd-XYZ';
const SECRET = 'x'.repeat(64);

/** @returns A logger stub whose `info`/`warn`/`error` calls are captured. */
function makeLoggerSpy(): Logger & {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
} {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger & {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    debug: jest.Mock;
  };
}

/** @returns Wired services + a verified user already inserted. */
async function setup() {
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  const users = new InMemoryUsersRepo();
  const sessionsRepo = new InMemorySessionsRepo();
  const sessions = new SessionService({
    sessions: sessionsRepo as unknown as SessionsRepository,
    clock,
    jwtSecret: SECRET,
  });
  const throttle = new ThrottleService(clock);
  const dummyHash = await bcrypt.hash('placeholder', 4);
  const logger = makeLoggerSpy();
  const service = new LoginService({
    users: users as unknown as UsersRepository,
    sessions,
    throttle,
    clock,
    logger,
    dummyHash,
  });

  const hash = await bcrypt.hash(PWD, 4);
  const u = await users.insertPending({ email: 'alice@example.com', passwordHash: hash });
  await users.markVerified(u.id, clock.now());

  return { service, sessions, sessionsRepo, throttle, clock, users, user: u, logger };
}

describe('LoginService.login', () => {
  it('issues a session on the happy path', async () => {
    const { service, sessionsRepo, logger, user } = await setup();
    const issued = await service.login({
      email: 'alice@example.com',
      password: PWD,
      ip: '127.0.0.1',
      userAgent: 'jest',
    });
    expect(issued.session.userId).toBeDefined();
    expect(issued.jwt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sessionsRepo.rows).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      { userId: user.id, sid: issued.session.id, outcome: 'success' },
      'login',
    );
  });

  it('rejects unknown email with InvalidCredentialsError and logs reason="unknown_email"', async () => {
    const { service, logger } = await setup();
    await expect(
      service.login({ email: 'nobody@example.com', password: PWD, ip: null, userAgent: null }),
    ).rejects.toMatchObject({ name: 'InvalidCredentialsError' });
    expect(logger.info).toHaveBeenCalledWith(
      { email: 'nobody@example.com', outcome: 'failure', reason: 'unknown_email' },
      'login',
    );
  });

  it('rejects wrong password with the SAME error class as unknown email and logs reason="wrong_password"', async () => {
    const { service, logger } = await setup();
    await expect(
      service.login({ email: 'alice@example.com', password: 'NotIt!XXXXXXXX', ip: null, userAgent: null }),
    ).rejects.toMatchObject({ name: 'InvalidCredentialsError' });
    expect(logger.info).toHaveBeenCalledWith(
      { email: 'alice@example.com', outcome: 'failure', reason: 'wrong_password' },
      'login',
    );
  });

  it('rejects pending account with AccountPendingError (not InvalidCredentials)', async () => {
    const { service, users, logger } = await setup();
    const hash = await bcrypt.hash(PWD, 4);
    const pending = await users.insertPending({ email: 'pending@example.com', passwordHash: hash });
    await expect(
      service.login({ email: 'pending@example.com', password: PWD, ip: null, userAgent: null }),
    ).rejects.toMatchObject({ name: 'AccountPendingError' });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: pending.id, outcome: 'failure', reason: 'pending' },
      'login',
    );
  });

  it('rejects disabled account with InvalidCredentialsError and logs reason="disabled"', async () => {
    const { service, users, user, clock, logger } = await setup();
    await users.softDelete(user.id, clock.now());
    await expect(
      service.login({ email: 'alice@example.com', password: PWD, ip: null, userAgent: null }),
    ).rejects.toMatchObject({ name: 'InvalidCredentialsError' });
    expect(logger.info).toHaveBeenCalledWith(
      { userId: user.id, outcome: 'failure', reason: 'disabled' },
      'login',
    );
  });

  it('locks the account after 5 failures and rejects subsequent attempts even with correct password', async () => {
    const { service } = await setup();
    for (let i = 0; i < 5; i += 1) {
      await expect(
        service.login({
          email: 'alice@example.com',
          password: 'wrong-' + String(i) + 'XXXXXX',
          ip: '10.0.0.1',
          userAgent: null,
        }),
      ).rejects.toBeDefined();
    }
    // 6th attempt — even with correct password — must be rejected as locked.
    await expect(
      service.login({ email: 'alice@example.com', password: PWD, ip: '10.0.0.1', userAgent: null }),
    ).rejects.toMatchObject({ name: 'AccountLockedError' });
  });

  it('resets the account counter on successful login', async () => {
    const { service, throttle } = await setup();
    for (let i = 0; i < 4; i += 1) {
      await expect(
        service.login({
          email: 'alice@example.com',
          password: 'wrong-' + String(i) + 'XXXXXX',
          ip: '10.0.0.2',
          userAgent: null,
        }),
      ).rejects.toBeDefined();
    }
    await service.login({ email: 'alice@example.com', password: PWD, ip: '10.0.0.2', userAgent: null });
    // After success the account counter is cleared, so we can fail 4 more times without lockout.
    expect(() => { throttle.assertNotLocked('alice@example.com', '10.0.0.2'); }).not.toThrow();
  });
});
