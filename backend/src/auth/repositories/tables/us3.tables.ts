import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely table interface for `auth.password_resets`.
 */
export interface PasswordResetsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  issued_at: ColumnType<Date, Date | undefined, never>;
  expires_at: ColumnType<Date, Date, Date>;
  used_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
}
