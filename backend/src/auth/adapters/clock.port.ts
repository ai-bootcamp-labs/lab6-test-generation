/**
 * Injectable clock abstraction (research D12). All time-dependent services
 * depend on this port instead of `Date.now()` directly so unit tests can
 * advance time deterministically with a {@link FakeClock}.
 */
export interface Clock {
  /** Returns the current wall-clock time. */
  now(): Date;
}

/**
 * Production clock implementation backed by `Date`.
 */
export class SystemClock implements Clock {
  /** @returns The current UTC instant. */
  now(): Date {
    return new Date();
  }
}
