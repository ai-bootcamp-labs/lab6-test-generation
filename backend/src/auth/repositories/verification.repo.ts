import type { Kysely } from 'kysely';
import type { DB } from './db-types.js';
import type { UserId } from '../domain/user.js';

/**
 * Persisted shape of a verification record returned to the service.
 */
export interface VerificationRecord {
  id: string;
  userId: UserId;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Repository over `auth.email_verifications`.
 */
export class VerificationRepository {
  /**
   * @param db - Active Kysely instance.
   */
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insert a new verification token row.
   * @param input - User id, sha256(token) hash, expiry timestamp.
   * @returns The inserted record.
   */
  async insertToken(input: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationRecord> {
    const row = await this.db
      .insertInto('auth.email_verifications')
      .values({
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      userId: row.user_id as UserId,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Fetch a token row by its sha256 hash.
   * @param tokenHash - Hex-encoded sha256 of the plaintext token.
   * @returns Record or `null` when no row matches.
   */
  async findByTokenHash(tokenHash: string): Promise<VerificationRecord | null> {
    const row = await this.db
      .selectFrom('auth.email_verifications')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id as UserId,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Mark a verification row as consumed.
   * @param id - Row id.
   * @param now - Consumption timestamp.
   * @returns Resolves on success.
   */
  async markUsed(id: string, now: Date): Promise<void> {
    await this.db
      .updateTable('auth.email_verifications')
      .set({ used_at: now })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Invalidate every outstanding token for a user (e.g. on resend or reset).
   * @param userId - User whose tokens should be invalidated.
   * @param now - Timestamp to write into `used_at`.
   * @returns Resolves on success.
   */
  async invalidateAllForUser(userId: UserId, now: Date): Promise<void> {
    await this.db
      .updateTable('auth.email_verifications')
      .set({ used_at: now })
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .execute();
  }
}
