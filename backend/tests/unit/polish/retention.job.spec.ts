import { describe, expect, it } from '@jest/globals';
import { runRetentionOnce, DELETION_RETENTION_DAYS, AUDIT_RETENTION_MONTHS } from '../../../src/infra/jobs/retention.job.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock } from '../_helpers/fakes.js';
import { InMemoryUsersRepo } from '../_helpers/in-memory-repos.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';
import type { AuditRepository } from '../../../src/auth/repositories/audit.repo.js';

describe('Retention job (runRetentionOnce)', () => {
  it('anonymizes users deleted >30d ago and purges audit events >12mo old', async () => {
    const clock = new FakeClock(new Date('2026-05-10T03:15:00Z'));
    const users = new InMemoryUsersRepo();
    const sessions = new InMemorySessionsRepo();
    const purgeCalls: Date[] = [];
    const audit = {
      async purgeOlderThan(cutoff: Date) {
        purgeCalls.push(cutoff);
        return 7;
      },
    };
    const fresh = await users.insertPending({ email: 'fresh@example.com', passwordHash: 'h' });
    fresh.deletedAt = new Date(clock.now().getTime() - 5 * 24 * 60 * 60 * 1000);
    const stale = await users.insertPending({ email: 'stale@example.com', passwordHash: 'h' });
    stale.deletedAt = new Date(clock.now().getTime() - (DELETION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);

    const result = await runRetentionOnce({
      users: users as unknown as UsersRepository,
      sessions: sessions as unknown as SessionsRepository,
      audit: audit as unknown as AuditRepository,
      clock,
      logger,
    });

    expect(result.anonymizedUsers).toBe(1);
    expect(result.purgedAuditEvents).toBe(7);
    expect(users.rows.find((u) => u.id === fresh.id)!.anonymizedAt).toBeNull();
    expect(users.rows.find((u) => u.id === stale.id)!.anonymizedAt).not.toBeNull();
    const expectedAuditCutoff = new Date(clock.now());
    expectedAuditCutoff.setMonth(expectedAuditCutoff.getMonth() - AUDIT_RETENTION_MONTHS);
    expect(purgeCalls[0]!.getTime()).toBe(expectedAuditCutoff.getTime());
  });

  it('is idempotent — running twice yields zero anonymizations on the second pass', async () => {
    const clock = new FakeClock(new Date('2026-05-10T03:15:00Z'));
    const users = new InMemoryUsersRepo();
    const sessions = new InMemorySessionsRepo();
    const audit = { async purgeOlderThan() { return 0; } };
    const stale = await users.insertPending({ email: 'stale2@example.com', passwordHash: 'h' });
    stale.deletedAt = new Date(clock.now().getTime() - (DELETION_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);

    const deps = {
      users: users as unknown as UsersRepository,
      sessions: sessions as unknown as SessionsRepository,
      audit: audit as unknown as AuditRepository,
      clock,
      logger,
    };
    const first = await runRetentionOnce(deps);
    const second = await runRetentionOnce(deps);
    expect(first.anonymizedUsers).toBe(1);
    expect(second.anonymizedUsers).toBe(0);
  });
});
