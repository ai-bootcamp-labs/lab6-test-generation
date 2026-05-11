import cron from 'node-cron';
import type { Clock } from '../../auth/adapters/clock.port.js';
import type { Logger } from '../logger.js';
import type { UsersRepository } from '../../auth/repositories/users.repo.js';
import type { SessionsRepository } from '../../auth/repositories/sessions.repo.js';
import type { AuditRepository } from '../../auth/repositories/audit.repo.js';

/** Anonymization threshold for soft-deleted users (FR-027). */
export const DELETION_RETENTION_DAYS = 30;

/** Audit-event retention threshold (FR-023a, research D13). */
export const AUDIT_RETENTION_MONTHS = 12;

/**
 * Outcome of a retention run; useful for observability and tests.
 */
export interface RetentionRunResult {
  anonymizedUsers: number;
  purgedAuditEvents: number;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Dependencies for the retention job.
 */
export interface RetentionDeps {
  users: UsersRepository;
  sessions: SessionsRepository;
  audit: AuditRepository;
  clock: Clock;
  logger: Logger;
}

/**
 * Run a single retention pass. Idempotent — safe to call repeatedly.
 *
 *   (a) Anonymize `users` rows with `deleted_at < now() - 30d`.
 *   (b) Delete `security_events` rows with `occurred_at < now() - 12 months`.
 *   (c) Mark expired `sessions` as `expired` (housekeeping).
 * @param deps - Wired dependencies.
 * @returns Summary of work performed.
 */
export async function runRetentionOnce(deps: RetentionDeps): Promise<RetentionRunResult> {
  const startedAt = deps.clock.now();
  const anonymizationCutoff = new Date(
    startedAt.getTime() - DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const auditCutoff = new Date(startedAt);
  auditCutoff.setMonth(auditCutoff.getMonth() - AUDIT_RETENTION_MONTHS);

  const anonymizedUsers = await deps.users.anonymizeDeletedOlderThan(anonymizationCutoff, startedAt);
  const purgedAuditEvents = await deps.audit.purgeOlderThan(auditCutoff);
  await deps.sessions.purgeExpired(startedAt);

  const finishedAt = deps.clock.now();
  deps.logger.info(
    { anonymizedUsers, purgedAuditEvents, durationMs: finishedAt.getTime() - startedAt.getTime() },
    'retention_run_complete',
  );
  return { anonymizedUsers, purgedAuditEvents, startedAt, finishedAt };
}

/**
 * Schedule the retention job to run daily at 03:15 server time.
 * @param deps - Wired dependencies.
 * @returns Scheduled cron task (call `.stop()` to disarm).
 */
export function scheduleRetentionJob(deps: RetentionDeps): cron.ScheduledTask {
  return cron.schedule('15 3 * * *', () => {
    runRetentionOnce(deps).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      deps.logger.error({ err: { message } }, 'retention_run_failed');
    });
  });
}
