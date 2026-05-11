import type { Clock } from '../adapters/clock.port.js';
import type { EmailPort } from '../adapters/email.port.js';
import { generateToken, hashToken } from '../adapters/token.port.js';
import type { UsersRepository } from '../repositories/users.repo.js';
import type { VerificationRepository } from '../repositories/verification.repo.js';
import type { Logger } from '../../infra/logger.js';
import { TokenAlreadyUsedError, TokenExpiredError, ValidationError } from '../domain/errors.js';
import { VERIFICATION_TTL_MS } from './registration.service.js';

/**
 * Clock-skew leeway applied to verification expiry comparisons (60 seconds).
 */
export const VERIFICATION_LEEWAY_MS = 60 * 1000;

/**
 * Dependency bag for the verification service.
 */
export interface VerificationDeps {
  users: UsersRepository;
  verifications: VerificationRepository;
  email: EmailPort;
  clock: Clock;
  logger: Logger;
  publicBaseUrl: string;
}

/**
 * Service responsible for consuming verification tokens and (re)issuing them.
 */
export class VerificationService {
  /**
   * @param deps - Wired dependencies.
   */
  constructor(private readonly deps: VerificationDeps) {}

  /**
   * Consume a verification token: validate, mark used, flip user to active.
   *
   * @param token - Plaintext token from the email link.
   * @returns Resolves when the user has been activated.
   * @throws {ValidationError} Token is missing/empty or matches no row.
   * @throws {TokenExpiredError} Token is past its TTL (with 60s leeway).
   * @throws {TokenAlreadyUsedError} Token was previously consumed.
   */
  async consumeToken(token: string): Promise<void> {
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Missing token');
    }
    const tokenHash = hashToken(token);
    const record = await this.deps.verifications.findByTokenHash(tokenHash);
    if (!record) throw new ValidationError('Invalid token');

    if (record.usedAt !== null) throw new TokenAlreadyUsedError();

    const now = this.deps.clock.now();
    if (record.expiresAt.getTime() + VERIFICATION_LEEWAY_MS < now.getTime()) {
      throw new TokenExpiredError();
    }

    await this.deps.verifications.markUsed(record.id, now);
    await this.deps.users.markVerified(record.userId, now);
    this.deps.logger.info({ userId: record.userId }, 'verify_email_success');
  }

  /**
   * Resend a verification token. Always returns a generic acceptance even
   * when the email is unknown (FR-006b, non-enumeration).
   * @param email - Email address to resend to.
   * @returns Resolves once the email is queued (or silently dropped for unknown).
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this.deps.users.findByEmail(email);
    if (!user || user.status !== 'pending') {
      this.deps.logger.info({ email, outcome: 'noop' }, 'verify_email_resend');
      return;
    }
    const now = this.deps.clock.now();
    await this.deps.verifications.invalidateAllForUser(user.id, now);
    const token = generateToken();
    await this.deps.verifications.insertToken({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    });
    const url = `${this.deps.publicBaseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    await this.deps.email.sendVerification(user.email, token, url);
    this.deps.logger.info({ userId: user.id, outcome: 'resent' }, 'verify_email_resend');
  }
}
