import type { ColumnType, Generated } from 'kysely';

/** Auth event types (matches the SQL enum). */
export type EventType =
  | 'register'
  | 'verify_email'
  | 'login'
  | 'logout'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'session_revoke'
  | 'account_delete'
  | 'lockout';

/** Auth event outcomes (matches the SQL enum). */
export type EventOutcome = 'success' | 'failure';

/** Kysely table interface for `auth.security_events`. */
export interface SecurityEventsTable {
  id: Generated<string>;
  event_type: EventType;
  user_id: string | null;
  occurred_at: ColumnType<Date, Date | undefined, never>;
  source_ip: string | null;
  outcome: EventOutcome;
  reason_code: string | null;
  metadata: ColumnType<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>>;
}
