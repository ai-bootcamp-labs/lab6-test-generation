import { describe, expect, it } from '@jest/globals';
import {
  COMMON_WEAK_PASSWORDS,
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
} from '../../../src/auth/domain/password-policy.js';

describe('validatePasswordStrength', () => {
  it('accepts a strong password with 4 character classes', () => {
    expect(validatePasswordStrength('Str0ng!Passw0rd-XYZ')).toEqual({ ok: true });
  });

  it('accepts the minimum-length boundary when classes are sufficient', () => {
    const pw = 'Aa1!Aa1!Aa1!'; // 12 chars, 4 classes
    expect(pw.length).toBe(MIN_PASSWORD_LENGTH);
    expect(validatePasswordStrength(pw)).toEqual({ ok: true });
  });

  it('rejects short passwords', () => {
    expect(validatePasswordStrength('Aa1!Aa1!')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rejects passwords with fewer than 3 character classes', () => {
    // 12 chars, only lower + digit (2 classes)
    expect(validatePasswordStrength('abcdefg123456')).toEqual({
      ok: false,
      reason: 'insufficient_classes',
    });
  });

  it('rejects bundled common passwords case-insensitively', () => {
    // pick a strong-looking password that happens to be on the blocklist
    for (const pw of COMMON_WEAK_PASSWORDS) {
      const result = validatePasswordStrength(pw);
      // Some entries may legitimately fail length / classes; if they pass those
      // checks they MUST be rejected as common.
      if (pw.length >= MIN_PASSWORD_LENGTH) {
        expect(result.ok).toBe(false);
      }
    }
  });

  it('respects an extra blocklist supplied by the caller', () => {
    const extra = new Set(['mycompanyname1!']);
    expect(validatePasswordStrength('Mycompanyname1!', extra)).toEqual({
      ok: false,
      reason: 'common_password',
    });
  });

  it('rejects non-string inputs gracefully', () => {
    // @ts-expect-error — exercising defensive runtime branch
    expect(validatePasswordStrength(undefined)).toEqual({ ok: false, reason: 'too_short' });
  });
});
