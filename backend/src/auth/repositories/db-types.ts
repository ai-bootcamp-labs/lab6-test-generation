import type { EmailVerificationsTable, UsersTable } from './tables/us1.tables.js';
import type { SessionsTable } from './tables/us2.tables.js';
import type { PasswordResetsTable } from './tables/us3.tables.js';
import type { SecurityEventsTable } from './tables/polish.tables.js';

/**
 * Aggregate Kysely DB schema. Tables are added by user-story phases:
 *   - US1 (T033): users, email_verifications
 *   - US2 (T056): sessions
 *   - US3 (T078): password_resets
 *   - Polish (T098): security_events
 */
export interface DB {
  'auth.users': UsersTable;
  'auth.email_verifications': EmailVerificationsTable;
  'auth.sessions': SessionsTable;
  'auth.password_resets': PasswordResetsTable;
  'auth.security_events': SecurityEventsTable;
}
