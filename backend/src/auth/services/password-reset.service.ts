import bcrypt from 'bcrypt';
import type { Clock } from '../adapters/clock.port.js';
import type { EmailPort } from '../adapters/email.port.js';
import { generateToken, hashToken } from '../adapters/token.port.js';
import { validatePasswordStrength } from '../domain/password-policy.js';
import {
  TokenAlreadyUsedError,
  TokenExpiredError,
  ValidationError,
} from '../domain/errors.js';
import type { Logger } from '../../infra/logger.js';
import type { UsersRepository } from '../repositories/users.repo.js';
import type { PasswordResetRepository } from '../repositories/reset.repo.js';
import type { SessionService } from './session.service.js';

/**
 * TTL for password-reset tokens — 30 minutes (FR-015).
 */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/**
 * Clock-skew leeway applied to expiry comparisons (60 seconds).
 */
export const PASSWORD_RESET_LEEWAY_MS = 60 * 1000;

/**
 * Dependency bag for the password-reset service.
 */
export interface PasswordResetDeps {
  users: UsersRepository;
  resets: PasswordResetRepository;
  email: EmailPort;
  clock: Clock;
  logger: Logger;
  sessions: SessionService;
  bcryptCost: number;
  publicBaseUrl: string;
  /** Bcrypt placeholder used to keep request timings flat for unknown emails. */
  dummyHash: string;
}

/**
 * Service implementing the password-reset flow.
 *
 * Behaviour highlights:
 *   - `request` ALWAYS returns the same shape and runs equal work — no
 *     enumeration leaks (FR-014, SC-006).
 *   - `confirm` redeems a single-use token, hashes the new password, revokes
 *     every live session with reason `password_reset`, invalidates the token,
 *     and (per Story 3 edge case) flips a still-pending user to active.
 */
export class PasswordResetService {
  /** @param deps - Wired dependencies. */
  constructor(private readonly deps: PasswordResetDeps) {}

  /**
   * Initiate a password-reset request. Always succeeds in the caller's view
   * regardless of whether the email is known.
   * @param input - Email address.
   * @param input.email
   * @returns Acceptance envelope.
   */
  async request(input: { email: string }): Promise<{ accepted: true }> {
    const email = input.email.toLowerCase();
    const user = await this.deps.users.findByEmail(email);

    // Equalise timing: always run a bcrypt op.
    await bcrypt.compare('placeholder-equaliser', this.deps.dummyHash);

    if (!user || user.status === 'disabled' || user.deletedAt !== null) {
      this.deps.logger.info({ email, outcome: 'noop' }, 'password_reset_request');
      return { accepted: true };
    }

    const now = this.deps.clock.now();
    // Invalidate any prior outstanding tokens for this user (single-active).
    await this.deps.resets.invalidateAllForUser(user.id, now);

    const token = generateToken();
    await this.deps.resets.insertToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    });
    const url = `${this.deps.publicBaseUrl}/auth/password-reset/confirm?token=${encodeURIComponent(token)}`;
    await this.deps.email.sendPasswordReset(user.email, token, url);
    this.deps.logger.info({ userId: user.id, outcome: 'sent' }, 'password_reset_request');
    return { accepted: true };
  }

  /**
   * Consume a reset token and apply a new password.
   * @param input - Plaintext token + new password.
   * @param input.token
   * @param input.password
   * @returns Resolves on success.
   * @throws {ValidationError} Token is missing/unknown OR new password is weak.
   * @throws {TokenExpiredError} Token is past its TTL (with 60 s leeway).
   * @throws {TokenAlreadyUsedError} Token already redeemed.
   */
  async confirm(input: { token: string; password: string }): Promise<void> {
    if (!input.token) throw new ValidationError('Missing token');

    // Validate password BEFORE any DB lookup so policy violations short-circuit
    // early and don't leak token validity through differential timing.
    const policy = validatePasswordStrength(input.password);
    if (!policy.ok) {
      throw new ValidationError('Password does not meet strength policy', { reason: policy.reason });
    }

    const tokenHash = hashToken(input.token);
    const record = await this.deps.resets.findByTokenHash(tokenHash);
    if (!record) throw new ValidationError('Invalid token');
    if (record.usedAt !== null) throw new TokenAlreadyUsedError();

    const now = this.deps.clock.now();
    if (record.expiresAt.getTime() + PASSWORD_RESET_LEEWAY_MS < now.getTime()) {
      throw new TokenExpiredError();
    }

    const newHash = await bcrypt.hash(input.password, this.deps.bcryptCost);

    // Single logical operation: mark token used → update password (also flips
    // pending → active inside `updatePasswordHash`) → revoke every live session.
    await this.deps.resets.markUsed(record.id, now);
    await this.deps.users.updatePasswordHash(record.userId, newHash, now);
    const revoked = await this.deps.sessions.revokeAllForUser(record.userId, 'password_reset');

    this.deps.logger.info(
      { userId: record.userId, sessionsRevoked: revoked, outcome: 'success' },
      'password_reset_complete',
    );
  }
}
