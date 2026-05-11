/**
 * Password-strength policy per FR-004 and clarified Q1.
 *
 *   - Length ≥ 12 characters
 *   - Must contain at least three of:
 *       lowercase, uppercase, digit, symbol
 *   - Must NOT match a maintained list of common weak passwords
 *
 * Pure function — no I/O. The blocklist is a small bundled set; production
 * deployments can swap in a larger list via `extraBlocklist`.
 */

/** Smallest reasonable allowed length. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Bundled minimal blocklist of well-known weak passwords. Does NOT pretend to
 * be exhaustive — the goal is to fail fast on the most embarrassing inputs.
 */
export const COMMON_WEAK_PASSWORDS = new Set<string>([
  'password',
  'password1',
  'password123',
  '123456789012',
  'qwertyuiopas',
  'letmeinplease',
  'welcome12345',
  'admin1234567',
  'iloveyou1234',
  'monkeymonkey',
  'passw0rdpassw0rd',
]);

/**
 * Outcome of a strength check.
 */
export type PasswordPolicyResult =
  | { ok: true }
  | { ok: false; reason: 'too_short' | 'insufficient_classes' | 'common_password' };

/**
 * Validate a candidate password against the policy.
 * @param plain - Raw user-supplied password.
 * @param extraBlocklist - Optional additional blocked values (lower-cased on compare).
 * @returns Discriminated result describing acceptance or specific rejection reason.
 */
export function validatePasswordStrength(
  plain: string,
  extraBlocklist: ReadonlySet<string> = new Set(),
): PasswordPolicyResult {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'too_short' };
  }
  const classes =
    Number(/[a-z]/.test(plain)) +
    Number(/[A-Z]/.test(plain)) +
    Number(/[0-9]/.test(plain)) +
    Number(/[^A-Za-z0-9]/.test(plain));
  if (classes < 3) return { ok: false, reason: 'insufficient_classes' };

  const lower = plain.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower) || extraBlocklist.has(lower)) {
    return { ok: false, reason: 'common_password' };
  }
  return { ok: true };
}
