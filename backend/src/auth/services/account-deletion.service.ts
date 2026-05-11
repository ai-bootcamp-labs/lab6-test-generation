import type { Clock } from '../adapters/clock.port.js';
import type { Logger } from '../../infra/logger.js';
import type { UsersRepository } from '../repositories/users.repo.js';
import type { VerificationRepository } from '../repositories/verification.repo.js';
import type { PasswordResetRepository } from '../repositories/reset.repo.js';
import type { AuditRepository } from '../repositories/audit.repo.js';
import type { SessionService } from './session.service.js';
import type { UserId } from '../domain/user.js';

/**
 * Dependency bag for the account-deletion service.
 */
export interface AccountDeletionDeps {
  users: UsersRepository;
  verifications: VerificationRepository;
  resets: PasswordResetRepository;
  sessions: SessionService;
  audit: AuditRepository;
  clock: Clock;
  logger: Logger;
}

/**
 * Service that orchestrates account deletion (FR-025…028, clarification Q5).
 *
 * Order of operations:
 *   1. Soft-delete the user (status=`disabled`, `deleted_at=now()`).
 *   2. Revoke every live session with reason `account_deleted` (FR-026).
 *   3. Invalidate any outstanding verification + reset tokens.
 *   4. Write an `account_delete` audit event.
 *
 * Hard purge / anonymization happens 30 days later via the retention job
 * (`retention.job.ts`).
 */
export class AccountDeletionService {
  /** @param deps - Wired dependencies. */
  constructor(private readonly deps: AccountDeletionDeps) {}

  /**
   * Delete the supplied user account.
   * @param userId - User to delete.
   * @param ip - Caller IP for audit logging.
   * @returns Resolves once the operation is complete.
   */
  async delete(userId: UserId, ip: string | null): Promise<void> {
    const now = this.deps.clock.now();
    await this.deps.users.softDelete(userId, now);
    const revoked = await this.deps.sessions.revokeAllForUser(userId, 'account_deleted');
    await this.deps.verifications.invalidateAllForUser(userId, now);
    await this.deps.resets.invalidateAllForUser(userId, now);
    await this.deps.audit.insertEvent({
      eventType: 'account_delete',
      userId,
      sourceIp: ip,
      outcome: 'success',
      metadata: { sessionsRevoked: revoked },
    });
    this.deps.logger.info({ userId, sessionsRevoked: revoked, outcome: 'success' }, 'account_delete');
  }
}
