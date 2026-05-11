import { describe, expect, it } from '@jest/globals';
import {
  SESSION_LEEWAY_SEC,
  SESSION_TTL_MS,
  SessionService,
} from '../../../src/auth/services/session.service.js';
import { FakeClock } from '../_helpers/fakes.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';
import type { UserId } from '../../../src/auth/domain/user.js';
import { randomUUID } from 'node:crypto';

const SECRET = 'x'.repeat(64);

/** @returns Wired session service with empty repo. */
function setup() {
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  const repo = new InMemorySessionsRepo();
  const service = new SessionService({
    sessions: repo as unknown as SessionsRepository,
    clock,
    jwtSecret: SECRET,
  });
  return { service, repo, clock };
}

describe('SessionService.issue + validate', () => {
  it('issues a session and validates it back', async () => {
    const { service } = setup();
    const userId = randomUUID() as UserId;
    const issued = await service.issue({ userId, ip: '127.0.0.1', userAgent: 'jest' });
    const validated = await service.validate(issued.jwt);
    expect(validated.session.id).toBe(issued.session.id);
    expect(validated.session.userId).toBe(userId);
  });

  it('rejects a tampered JWT signature with InvalidCredentialsError', async () => {
    const { service } = setup();
    const userId = randomUUID() as UserId;
    const issued = await service.issue({ userId, ip: null, userAgent: null });
    const tampered = issued.jwt.slice(0, -2) + (issued.jwt.endsWith('A') ? 'BB' : 'AA');
    await expect(service.validate(tampered)).rejects.toMatchObject({
      name: 'InvalidCredentialsError',
    });
  });

  it('rejects a revoked session', async () => {
    const { service } = setup();
    const userId = randomUUID() as UserId;
    const issued = await service.issue({ userId, ip: null, userAgent: null });
    await service.revoke(issued.session.id, 'logout');
    await expect(service.validate(issued.jwt)).rejects.toMatchObject({
      name: 'InvalidCredentialsError',
    });
  });

  it('accepts a session within leeway after nominal TTL', async () => {
    const { service, clock } = setup();
    const userId = randomUUID() as UserId;
    const issued = await service.issue({ userId, ip: null, userAgent: null });
    // Move just past TTL but still inside the leeway window.
    clock.advance(SESSION_TTL_MS + (SESSION_LEEWAY_SEC - 5) * 1000);
    await expect(service.validate(issued.jwt)).resolves.toBeDefined();
  });

  it('rejects a session beyond TTL + leeway', async () => {
    const { service, clock } = setup();
    const userId = randomUUID() as UserId;
    const issued = await service.issue({ userId, ip: null, userAgent: null });
    clock.advance(SESSION_TTL_MS + (SESSION_LEEWAY_SEC + 5) * 1000);
    await expect(service.validate(issued.jwt)).rejects.toMatchObject({
      name: 'InvalidCredentialsError',
    });
  });
});

describe('SessionService.revokeAllForUser', () => {
  it('revokes every live session for the user and leaves others alone', async () => {
    const { service, repo } = setup();
    const a = randomUUID() as UserId;
    const b = randomUUID() as UserId;
    await service.issue({ userId: a, ip: null, userAgent: null });
    await service.issue({ userId: a, ip: null, userAgent: null });
    await service.issue({ userId: b, ip: null, userAgent: null });
    const n = await service.revokeAllForUser(a, 'password_reset');
    expect(n).toBe(2);
    const live = repo.rows.filter((s) => s.revokedAt === null);
    expect(live.map((s) => s.userId)).toEqual([b]);
  });
});
