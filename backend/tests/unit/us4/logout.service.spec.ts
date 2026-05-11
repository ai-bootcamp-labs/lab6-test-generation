import { describe, expect, it } from '@jest/globals';
import { LogoutService } from '../../../src/auth/services/logout.service.js';
import { SessionService } from '../../../src/auth/services/session.service.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock } from '../_helpers/fakes.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';
import type { UserId } from '../../../src/auth/domain/user.js';
import { randomUUID } from 'node:crypto';

const SECRET = 'x'.repeat(64);

/** @returns Wired services. */
function setup() {
  const clock = new FakeClock();
  const repo = new InMemorySessionsRepo();
  const sessions = new SessionService({
    sessions: repo as unknown as SessionsRepository,
    clock,
    jwtSecret: SECRET,
  });
  const logout = new LogoutService(sessions, logger);
  return { logout, sessions, repo, clock };
}

describe('LogoutService.logout', () => {
  it('revokes the calling session with reason logout', async () => {
    const { logout, sessions, repo } = setup();
    const userId = randomUUID() as UserId;
    const issued = await sessions.issue({ userId, ip: null, userAgent: null });
    await logout.logout(issued.session.id, userId);
    const after = repo.rows.find((r) => r.id === issued.session.id)!;
    expect(after.revokedAt).not.toBeNull();
    expect(after.revokeReason).toBe('logout');
  });

  it('does not affect sibling sessions of the same user', async () => {
    const { logout, sessions, repo } = setup();
    const userId = randomUUID() as UserId;
    const a = await sessions.issue({ userId, ip: null, userAgent: null });
    const b = await sessions.issue({ userId, ip: null, userAgent: null });
    await logout.logout(a.session.id, userId);
    const sib = repo.rows.find((r) => r.id === b.session.id)!;
    expect(sib.revokedAt).toBeNull();
  });
});
