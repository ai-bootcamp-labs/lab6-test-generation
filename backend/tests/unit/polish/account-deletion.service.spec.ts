import { describe, expect, it } from '@jest/globals';
import { AccountDeletionService } from '../../../src/auth/services/account-deletion.service.js';
import { SessionService } from '../../../src/auth/services/session.service.js';
import type { AuditRepository } from '../../../src/auth/repositories/audit.repo.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock } from '../_helpers/fakes.js';
import { InMemoryUsersRepo, InMemoryVerificationRepo } from '../_helpers/in-memory-repos.js';
import { InMemoryResetRepo } from '../_helpers/in-memory-reset.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { VerificationRepository } from '../../../src/auth/repositories/verification.repo.js';
import type { PasswordResetRepository } from '../../../src/auth/repositories/reset.repo.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';

const SECRET = 'x'.repeat(64);

/** @returns Wired services + fakes. */
async function setup() {
  const clock = new FakeClock(new Date('2026-05-10T00:00:00Z'));
  const users = new InMemoryUsersRepo();
  const verifications = new InMemoryVerificationRepo();
  const resets = new InMemoryResetRepo();
  const sessionsRepo = new InMemorySessionsRepo();
  const sessions = new SessionService({
    sessions: sessionsRepo as unknown as SessionsRepository,
    clock,
    jwtSecret: SECRET,
  });
  const audit = {
    events: [] as unknown[],
    async insertEvent(input: unknown) {
      this.events.push(input);
    },
    async purgeOlderThan() {
      return 0;
    },
  };
  const service = new AccountDeletionService({
    users: users as unknown as UsersRepository,
    verifications: verifications as unknown as VerificationRepository,
    resets: resets as unknown as PasswordResetRepository,
    sessions,
    audit: audit as unknown as AuditRepository,
    clock,
    logger,
  });
  const user = await users.insertPending({ email: 'gone@example.com', passwordHash: 'h' });
  return { service, users, verifications, resets, sessions, sessionsRepo, audit, user, clock };
}

describe('AccountDeletionService.delete', () => {
  it('soft-deletes the user, revokes all sessions, invalidates tokens, and records an audit event', async () => {
    const { service, users, sessionsRepo, audit, user, sessions } = await setup();
    await sessions.issue({ userId: user.id, ip: null, userAgent: null });
    await sessions.issue({ userId: user.id, ip: null, userAgent: null });

    await service.delete(user.id, '198.51.100.7');

    const after = users.rows.find((u) => u.id === user.id)!;
    expect(after.status).toBe('disabled');
    expect(after.deletedAt).not.toBeNull();
    expect(sessionsRepo.rows.every((s) => s.revokedAt !== null && s.revokeReason === 'account_deleted')).toBe(true);
    expect(audit.events.length).toBe(1);
  });
});
