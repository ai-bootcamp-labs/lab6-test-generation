import { describe, expect, it } from '@jest/globals';
import { ThrottleService, THROTTLE_CONFIG } from '../../../src/auth/services/throttle.service.js';
import { FakeClock } from '../_helpers/fakes.js';

describe('ThrottleService', () => {
  it('does not lock below the per-account threshold', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    for (let i = 0; i < THROTTLE_CONFIG.accountMaxFailures - 1; i += 1) {
      t.recordFailure('alice@x', '1.2.3.4');
    }
    expect(() => { t.assertNotLocked('alice@x', '1.2.3.4'); }).not.toThrow();
  });

  it('locks the account at the threshold', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    for (let i = 0; i < THROTTLE_CONFIG.accountMaxFailures; i += 1) {
      t.recordFailure('alice@x', '1.2.3.4');
    }
    expect(() => { t.assertNotLocked('alice@x', null); }).toThrow(/locked/i);
  });

  it('releases the lock after lockoutMs has elapsed', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    for (let i = 0; i < THROTTLE_CONFIG.accountMaxFailures; i += 1) {
      t.recordFailure('alice@x', null);
    }
    clock.advance(THROTTLE_CONFIG.accountLockoutMs + 1000);
    expect(() => { t.assertNotLocked('alice@x', null); }).not.toThrow();
  });

  it('locks the IP after 20 failures and rate-limits other accounts from same IP', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    for (let i = 0; i < THROTTLE_CONFIG.ipMaxFailures; i += 1) {
      t.recordFailure('user-' + String(i) + '@x', '9.9.9.9');
    }
    expect(() => { t.assertNotLocked('totally-new@x', '9.9.9.9'); }).toThrow(/too many|rate/i);
  });

  it('window expiry resets the failure count without lockout', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    t.recordFailure('alice@x', null);
    t.recordFailure('alice@x', null);
    clock.advance(THROTTLE_CONFIG.accountWindowMs + 1000);
    // After window passes, three more should not lock
    t.recordFailure('alice@x', null);
    t.recordFailure('alice@x', null);
    t.recordFailure('alice@x', null);
    expect(() => { t.assertNotLocked('alice@x', null); }).not.toThrow();
  });

  it('recordSuccess clears the per-account counter', () => {
    const clock = new FakeClock();
    const t = new ThrottleService(clock);
    for (let i = 0; i < THROTTLE_CONFIG.accountMaxFailures - 1; i += 1) {
      t.recordFailure('alice@x', null);
    }
    t.recordSuccess('alice@x');
    // Now we can fail (max - 1) more without triggering lockout
    for (let i = 0; i < THROTTLE_CONFIG.accountMaxFailures - 1; i += 1) {
      t.recordFailure('alice@x', null);
    }
    expect(() => { t.assertNotLocked('alice@x', null); }).not.toThrow();
  });
});
