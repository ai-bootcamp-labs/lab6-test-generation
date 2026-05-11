import type { Kysely } from 'kysely';
import type { DB } from './db-types.js';
import type { UserId } from '../domain/user.js';

/**
 * Persisted shape of a password-reset row returned to services.
 */
export interface PasswordResetRecord {
  id: string;
  userId: UserId;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Map a raw `auth.password_resets` row to the domain {@link PasswordResetRecord}.
 * @param row - DB row.
 * @returns Domain record.
 */
function rowToRecord(row: {
  id: string;
  user_id: string;
  token_hash: string;
  issued_at: Date;
  expires_at: Date;
  used_at: Date | null;
}): PasswordResetRecord {
  return {
    id: row.id,
    userId: row.user_id as UserId,
    tokenHash: row.token_hash,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

/**
 * Repository over `auth.password_resets`.
 */
export class PasswordResetRepository {
  /** @param db - Active Kysely instance. */
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insert a new password-reset token row.
   * @param input - User id, sha256(token) hash, expiry timestamp.
   * @param input.userId
   * @param input.tokenHash
   * @param input.expiresAt
   * @returns Persisted record.
   */
  async insertToken(input: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    const row = await this.db
      .insertInto('auth.password_resets')
      .values({
        user_id: input.userId,
        token_hash: input.tokenHash,
        expires_at: input.expiresAt,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return rowToRecord(row);
  }

  /**
   * Look up a reset row by its sha256 hash.
   * @param tokenHash - Hex sha256 of the plaintext token.
   * @returns Record or `null`.
   */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const row = await this.db
      .selectFrom('auth.password_resets')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    return row ? rowToRecord(row) : null;
  }

  /**
   * Mark a reset row as consumed.
   * @param id - Row id.
   * @param now - Consumption timestamp.
   * @returns Resolves on success.
   */
  async markUsed(id: string, now: Date): Promise<void> {
    await this.db
      .updateTable('auth.password_resets')
      .set({ used_at: now })
      .where('id', '=', id)
      .where('used_at', 'is', null)
      .execute();
  }

  /**
   * Invalidate every outstanding reset token for a user.
   * @param userId - User whose tokens should be invalidated.
   * @param now - Timestamp to write.
   * @returns Resolves on success.
   */
  async invalidateAllForUser(userId: UserId, now: Date): Promise<void> {
    await this.db
      .updateTable('auth.password_resets')
      .set({ used_at: now })
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .execute();
  }
}
