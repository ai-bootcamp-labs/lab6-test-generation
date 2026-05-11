import type { Clock } from '../adapters/clock.port.js';
import { AccountLockedError, RateLimitedError } from '../domain/errors.js';

/**
 * Thresholds enforced by {@link ThrottleService}, per Clarification Q3.
 *
 *   - Per-account: 5 failed logins within 5 minutes → 15 min lockout
 *   - Per-IP:      20 failed logins within 5 minutes → 15 min throttle
 */
export const THROTTLE_CONFIG = {
  accountWindowMs: 5 * 60 * 1000,
  accountMaxFailures: 5,
  accountLockoutMs: 15 * 60 * 1000,
  ipWindowMs: 5 * 60 * 1000,
  ipMaxFailures: 20,
  ipLockoutMs: 15 * 60 * 1000,
} as const;

/**
 * Internal counter row.
 */
interface Counter {
  failures: number[]; // ms timestamps of failure events within window
  lockedUntil: number | null;
}

/**
 * In-memory implementation of the throttle policy. Production deployments may
 * back this with Redis or Postgres for cross-process coherency, but the
 * in-process variant is sufficient for the MVP and for tests.
 */
export class ThrottleService {
  private readonly accounts = new Map<string, Counter>();
  private readonly ips = new Map<string, Counter>();

  /** @param clock - Injected clock so tests can advance windows deterministically. */
  constructor(private readonly clock: Clock) {}

  /**
   * Throw if either the account or IP is currently locked. Call before
   * verifying credentials so attackers don't even reach bcrypt.
   * @param accountKey - Lower-cased email being attempted.
   * @param ip - Client IP (best-effort).
   * @throws {AccountLockedError} Account-level lockout active.
   * @throws {RateLimitedError} IP-level throttle active.
   */
  assertNotLocked(accountKey: string, ip: string | null): void {
    const now = this.clock.now().getTime();
    const ac = this.accounts.get(accountKey);
    if (ac?.lockedUntil && ac.lockedUntil > now) {
      throw new AccountLockedError(Math.ceil((ac.lockedUntil - now) / 1000));
    }
    if (ip) {
      const ic = this.ips.get(ip);
      if (ic?.lockedUntil && ic.lockedUntil > now) {
        throw new RateLimitedError(Math.ceil((ic.lockedUntil - now) / 1000));
      }
    }
  }

  /**
   * Record a failed authentication attempt. May trigger a lockout when
   * thresholds are crossed.
   * @param accountKey - Email being targeted.
   * @param ip - Client IP.
   */
  recordFailure(accountKey: string, ip: string | null): void {
    const now = this.clock.now().getTime();

    // Account counter
    const ac = this.accounts.get(accountKey) ?? { failures: [], lockedUntil: null };
    ac.failures = ac.failures.filter((t) => now - t < THROTTLE_CONFIG.accountWindowMs);
    ac.failures.push(now);
    if (ac.failures.length >= THROTTLE_CONFIG.accountMaxFailures) {
      ac.lockedUntil = now + THROTTLE_CONFIG.accountLockoutMs;
      ac.failures = [];
    }
    this.accounts.set(accountKey, ac);

    // IP counter
    if (ip) {
      const ic = this.ips.get(ip) ?? { failures: [], lockedUntil: null };
      ic.failures = ic.failures.filter((t) => now - t < THROTTLE_CONFIG.ipWindowMs);
      ic.failures.push(now);
      if (ic.failures.length >= THROTTLE_CONFIG.ipMaxFailures) {
        ic.lockedUntil = now + THROTTLE_CONFIG.ipLockoutMs;
        ic.failures = [];
      }
      this.ips.set(ip, ic);
    }
  }

  /**
   * Reset the per-account counter on successful authentication. IP counter
   * is intentionally left in place to keep credential-stuffing pressure
   * suppressed even after one valid login mixed in.
   * @param accountKey - Email that just authenticated.
   */
  recordSuccess(accountKey: string): void {
    this.accounts.delete(accountKey);
  }
}
