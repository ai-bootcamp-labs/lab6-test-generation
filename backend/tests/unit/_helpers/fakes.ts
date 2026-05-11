import type { Clock } from '../../../src/auth/adapters/clock.port.js';
import type { EmailPort } from '../../../src/auth/adapters/email.port.js';

/**
 * Deterministic clock for unit tests. Time only advances when the test calls
 * {@link FakeClock.advance} or {@link FakeClock.set}.
 */
export class FakeClock implements Clock {
  private current: Date;

  /**
   * @param start - Initial wall-clock time. Defaults to the Unix epoch.
   */
  constructor(start: Date = new Date('2026-01-01T00:00:00.000Z')) {
    this.current = new Date(start.getTime());
  }

  /** @inheritdoc */
  now(): Date {
    return new Date(this.current.getTime());
  }

  /**
   * Move the clock forward by the supplied number of milliseconds.
   * @param ms - Milliseconds to advance.
   */
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  /**
   * Set the clock to an absolute point in time.
   * @param t - New "now" value.
   */
  set(t: Date): void {
    this.current = new Date(t.getTime());
  }
}

/**
 * In-memory representation of a captured outbound email message.
 */
export interface CapturedEmail {
  kind: 'verification' | 'password_reset';
  to: string;
  token: string;
  url: string;
}

/**
 * In-memory email adapter for unit tests. Records each call so assertions can
 * verify which user received which token.
 */
export class FakeEmailAdapter implements EmailPort {
  /** All messages sent during the test, in order. */
  public readonly sent: CapturedEmail[] = [];

  /** @inheritdoc */
  async sendVerification(to: string, token: string, url: string): Promise<void> {
    this.sent.push({ kind: 'verification', to, token, url });
  }

  /** @inheritdoc */
  async sendPasswordReset(to: string, token: string, url: string): Promise<void> {
    this.sent.push({ kind: 'password_reset', to, token, url });
  }

  /** Forget all previously-recorded messages. */
  reset(): void {
    this.sent.length = 0;
  }
}
