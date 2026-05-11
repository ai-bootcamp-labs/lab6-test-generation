import type { Logger } from '../../infra/logger.js';
import type { SessionId } from '../domain/session.js';
import type { SessionService } from './session.service.js';

/**
 * Service handling explicit logout. Revokes the supplied session and emits an
 * audit log entry. Sibling sessions belonging to the same user are NOT
 * affected — each session is independent (FR-021).
 */
export class LogoutService {
  /**
   * @param sessions - Session service (provides revoke).
   * @param logger - Pino logger.
   */
  constructor(
    private readonly sessions: SessionService,
    private readonly logger: Logger,
  ) {}

  /**
   * Revoke a single session.
   * @param sessionId - Session id to revoke.
   * @param userId - User who owns the session (for audit log).
   * @returns Resolves once the row is updated.
   */
  async logout(sessionId: SessionId, userId: string): Promise<void> {
    await this.sessions.revoke(sessionId, 'logout');
    this.logger.info({ userId, sid: sessionId, outcome: 'success' }, 'logout');
  }
}
