import type { Kysely } from 'kysely';
import type { DB } from './db-types.js';
import type { Session, SessionId } from '../domain/session.js';
import type { UserId } from '../domain/user.js';
import type { RevokeReason } from './tables/us2.tables.js';

/**
 * Map a raw `auth.sessions` row to the domain {@link Session}.
 * @param row - DB row.
 * @returns Domain session.
 */
function rowToSession(row: {
  id: string;
  user_id: string;
  csrf_secret: string;
  ip: string | null;
  user_agent: string | null;
  issued_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: RevokeReason | null;
}): Session {
  return {
    id: row.id as SessionId,
    userId: row.user_id as UserId,
    csrfSecret: row.csrf_secret,
    ip: row.ip,
    userAgent: row.user_agent,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

/**
 * Repository over `auth.sessions`.
 */
export class SessionsRepository {
  /** @param db - Active Kysely instance. */
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insert a new session row.
   * @param input - User, csrf secret, optional metadata, expiry timestamp.
   * @param input.userId
   * @param input.csrfSecret
   * @param input.ip
   * @param input.userAgent
   * @param input.expiresAt
   * @returns Persisted session.
   */
  async insert(input: {
    userId: UserId;
    csrfSecret: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session> {
    const row = await this.db
      .insertInto('auth.sessions')
      .values({
        user_id: input.userId,
        csrf_secret: input.csrfSecret,
        ip: input.ip,
        user_agent: input.userAgent,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return rowToSession(row);
  }

  /**
   * Look up a session by id.
   * @param id - Session id.
   * @returns Session or `null`.
   */
  async findById(id: SessionId): Promise<Session | null> {
    const row = await this.db
      .selectFrom('auth.sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? rowToSession(row) : null;
  }

  /**
   * Mark a session revoked.
   * @param id - Session id.
   * @param reason - Revocation reason for audit.
   * @param now - Timestamp.
   * @returns Resolves on success.
   */
  async revoke(id: SessionId, reason: RevokeReason, now: Date): Promise<void> {
    await this.db
      .updateTable('auth.sessions')
      .set({ revoked_at: now, revoke_reason: reason })
      .where('id', '=', id)
      .where('revoked_at', 'is', null)
      .execute();
  }

  /**
   * Revoke every live session for a given user.
   * @param userId - User whose sessions should be revoked.
   * @param reason - Audit reason.
   * @param now - Timestamp.
   * @returns Number of sessions revoked.
   */
  async revokeAllForUser(userId: UserId, reason: RevokeReason, now: Date): Promise<number> {
    const result = await this.db
      .updateTable('auth.sessions')
      .set({ revoked_at: now, revoke_reason: reason })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /**
   * Mark all expired but not-yet-revoked sessions as `expired` (housekeeping).
   * @param now - Reference timestamp.
   * @returns Resolves on completion.
   */
  async purgeExpired(now: Date): Promise<void> {
    await this.db
      .updateTable('auth.sessions')
      .set({ revoked_at: now, revoke_reason: 'expired' })
      .where('revoked_at', 'is', null)
      .where('expires_at', '<', now)
      .execute();
  }
}
