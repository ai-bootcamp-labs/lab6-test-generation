import bcrypt from 'bcrypt';
import type { Clock } from '../adapters/clock.port.js';
import type { EmailPort } from '../adapters/email.port.js';
import { generateToken, hashToken } from '../adapters/token.port.js';
import type { UsersRepository } from '../repositories/users.repo.js';
import type { VerificationRepository } from '../repositories/verification.repo.js';
import type { Logger } from '../../infra/logger.js';
import { ValidationError } from '../domain/errors.js';
import { validatePasswordStrength } from '../domain/password-policy.js';

/**
 * Verification token TTL — clarification Q1 → 24 hours.
 */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Dependency bag for the registration service.
 */
export interface RegistrationDeps {
  users: UsersRepository;
  verifications: VerificationRepository;
  email: EmailPort;
  clock: Clock;
  logger: Logger;
  bcryptCost: number;
  publicBaseUrl: string;
}

/**
 * Service that handles new account registration. Always returns a generic
 * 201 response shape; whether or not the email was previously registered is
 * never disclosed in the response (FR-002, SC-006).
 */
export class RegistrationService {
  /**
   * @param deps - Wired dependencies.
   */
  constructor(private readonly deps: RegistrationDeps) {}

  /**
   * Register a new account.
   *
   * Implements timing-equalised duplicate handling: even when the email is
   * already taken we still run a bcrypt hash so attackers cannot infer
   * registration state from latency.
   * @param input - Validated email and plaintext password.
   * @returns Always-acceptable response payload.
   * @throws {ValidationError} If the password fails the strength policy.
   */
  async register(input: { email: string; password: string }): Promise<{ accepted: true }> {
    const policy = validatePasswordStrength(input.password);
    if (!policy.ok) {
      throw new ValidationError('Password does not meet strength policy', { reason: policy.reason });
    }

    // Always perform the hash so duplicate-email path takes equal time.
    const hash = await bcrypt.hash(input.password, this.deps.bcryptCost);
    const now = this.deps.clock.now();

    const exists = await this.deps.users.existsByEmail(input.email);
    if (exists) {
      this.deps.logger.info({ email: input.email, outcome: 'duplicate' }, 'register');
      return { accepted: true };
    }

    const user = await this.deps.users.insertPending({ email: input.email, passwordHash: hash });

    const token = generateToken();
    const tokenHash = hashToken(token);
    await this.deps.verifications.insertToken({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    });

    const url = `${this.deps.publicBaseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.deps.email.sendVerification(user.email, token, url);
    this.deps.logger.info({ userId: user.id, outcome: 'pending' }, 'register');
    return { accepted: true };
  }
}
