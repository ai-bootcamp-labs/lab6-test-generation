import type { ColumnType, Generated } from 'kysely';

/**
 * Helper alias for timestamps: read-only `Date` returned, accepts `Date` on insert/update.
 */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * Persisted shape of `auth.users`.
 */
export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  status: 'pending' | 'active' | 'disabled';
  verified_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  deleted_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  anonymized_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Persisted shape of `auth.email_verifications`.
 */
export interface EmailVerificationsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  used_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  created_at: Timestamp;
}
