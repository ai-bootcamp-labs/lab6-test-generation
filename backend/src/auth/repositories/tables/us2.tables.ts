import type { ColumnType, Generated } from 'kysely';

/** Helper alias for timestamps. */
type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

/**
 * Reasons a session may be revoked. Mirrors the Postgres enum `auth.revoke_reason`.
 */
export type RevokeReason =
  | 'logout'
  | 'password_reset'
  | 'admin_revoke'
  | 'expired'
  | 'account_deleted';

/**
 * Persisted shape of `auth.sessions`.
 */
export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  csrf_secret: string;
  ip: ColumnType<string | null, string | null | undefined, string | null>;
  user_agent: ColumnType<string | null, string | null | undefined, string | null>;
  issued_at: Timestamp;
  expires_at: Timestamp;
  revoked_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
  revoke_reason: ColumnType<RevokeReason | null, RevokeReason | null | undefined, RevokeReason | null>;
}
