import type { Kysely } from 'kysely';
import type { DB } from './db-types.js';
import type { EventOutcome, EventType } from './tables/polish.tables.js';
import type { UserId } from '../domain/user.js';

/** Input for an audit-event insert. */
export interface AuditEventInput {
  eventType: EventType;
  userId?: UserId | null;
  sourceIp?: string | null;
  outcome: EventOutcome;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Repository over `auth.security_events`. Append-only by design.
 */
export class AuditRepository {
  /** @param db - Active Kysely instance. */
  constructor(private readonly db: Kysely<DB>) {}

  /**
   * Insert an audit event row.
   * @param input - Event details (no PII, no plaintext secrets).
   * @returns Resolves once the insert is durable.
   */
  async insertEvent(input: AuditEventInput): Promise<void> {
    await this.db
      .insertInto('auth.security_events')
      .values({
        event_type: input.eventType,
        user_id: input.userId ?? null,
        source_ip: input.sourceIp ?? null,
        outcome: input.outcome,
        reason_code: input.reasonCode ?? null,
        metadata: input.metadata ?? {},
      })
      .execute();
  }

  /**
   * Delete events older than the supplied cutoff (retention job).
   * @param olderThan - Cutoff timestamp; rows with `occurred_at < olderThan` are deleted.
   * @returns Number of rows deleted.
   */
  async purgeOlderThan(olderThan: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('auth.security_events')
      .where('occurred_at', '<', olderThan)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
