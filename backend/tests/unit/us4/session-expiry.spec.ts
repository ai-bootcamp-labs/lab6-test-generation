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

/** @returns Wired session service + utilities. */
function setup() {
  const clock = new FakeClock(new Date('2026-05-10T00:00:00Z'));
  const repo = new InMemorySessionsRepo();
  const service = new SessionService({
    sessions: repo as unknown as SessionsRepository,
    clock,
    jwtSecret: SECRET,
  });
  return { service, clock, repo };
}

describe('Session expiry boundaries (FakeClock)', () => {
  it('is live well within TTL (23h59m)', async () => {
    const { service, clock } = setup();
    const issued = await service.issue({ userId: randomUUID() as UserId, ip: null, userAgent: null });
    clock.advance(SESSION_TTL_MS - 60_000);
    await expect(service.validate(issued.jwt)).resolves.toBeDefined();
  });

  it('is accepted within the 60s leeway after nominal expiry (24h + 30s)', async () => {
    const { service, clock } = setup();
    const issued = await service.issue({ userId: randomUUID() as UserId, ip: null, userAgent: null });
    clock.advance(SESSION_TTL_MS + 30_000);
    await expect(service.validate(issued.jwt)).resolves.toBeDefined();
  });

  it('is rejected past the leeway (24h + 61s)', async () => {
    const { service, clock } = setup();
    const issued = await service.issue({ userId: randomUUID() as UserId, ip: null, userAgent: null });
    clock.advance(SESSION_TTL_MS + (SESSION_LEEWAY_SEC + 1) * 1000);
    await expect(service.validate(issued.jwt)).rejects.toMatchObject({
      name: 'InvalidCredentialsError',
    });
  });
});
