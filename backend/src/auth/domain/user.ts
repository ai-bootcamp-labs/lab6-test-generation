/**
 * Pure domain types and constructors for users. No I/O, no Kysely — these
 * are safe to consume from unit tests directly.
 */

/**
 * Three-valued lifecycle state. Mirrors the Postgres enum `auth.user_status`.
 */
export type UserStatus = 'pending' | 'active' | 'disabled';

/**
 * Branded string for user ids so they can't be confused with other UUIDs.
 */
export type UserId = string & { readonly __brand: 'UserId' };

/**
 * Aggregate user state as projected from the database row.
 */
export interface User {
  id: UserId;
  email: string;
  passwordHash: string;
  status: UserStatus;
  verifiedAt: Date | null;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Inputs required to construct a freshly-registered (pending) user.
 */
export interface NewPendingUserInput {
  email: string;
  passwordHash: string;
  now: Date;
}

/**
 * Build the row payload for a new pending registration. Pure function so
 * tests can assert defaults without touching the database.
 * @param input - Email, hash, current time.
 * @returns Insert-ready user record.
 */
export function newPendingUser(input: NewPendingUserInput): {
  email: string;
  password_hash: string;
  status: UserStatus;
  verified_at: null;
  deleted_at: null;
  anonymized_at: null;
} {
  return {
    email: input.email.toLowerCase(),
    password_hash: input.passwordHash,
    status: 'pending',
    verified_at: null,
    deleted_at: null,
    anonymized_at: null,
  };
}

/**
 * Compute the `active` transition from a pending user. Returns the patch to
 * apply rather than mutating in place.
 * @param now - Current time to record on `verified_at` and `updated_at`.
 * @returns Partial row payload representing the activation update.
 */
export function activatePendingUser(now: Date): {
  status: 'active';
  verified_at: Date;
  updated_at: Date;
} {
  return { status: 'active', verified_at: now, updated_at: now };
}
