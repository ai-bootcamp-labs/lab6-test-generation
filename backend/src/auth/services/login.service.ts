import bcrypt from 'bcrypt';
import type { Clock } from '../adapters/clock.port.js';
import type { Logger } from '../../infra/logger.js';
import {
  AccountPendingError,
  InvalidCredentialsError,
} from '../domain/errors.js';
import type { UsersRepository } from '../repositories/users.repo.js';
import type { IssuedSession } from '../domain/session.js';
import type { SessionService } from './session.service.js';
import type { ThrottleService } from './throttle.service.js';

/**
 * Dependency bag for the login service.
 */
export interface LoginDeps {
  users: UsersRepository;
  sessions: SessionService;
  throttle: ThrottleService;
  clock: Clock;
  logger: Logger;
  /** A bcrypt placeholder used when the email is unknown to keep timings flat. */
  dummyHash: string;
}

/**
 * Service handling the `POST /auth/login` flow.
 */
export class LoginService {
  /** @param deps - Wired dependencies. */
  constructor(private readonly deps: LoginDeps) {}

  /**
   * Authenticate an email/password pair and (on success) issue a session.
   *
   * Behaviour:
   *   - Calls throttle preflight first (lockouts skip credential check entirely).
   *   - Always runs bcrypt — even on unknown email — to equalise timing.
   *   - Pending accounts return `AccountPendingError` (HTTP 403) so callers can
   *     prompt the user to verify, while still being distinct from invalid creds.
   *   - On success: resets account throttle counter and issues a session.
   * @param input - Plaintext credentials and request metadata.
   * @returns Issued session (cookie + jwt) ready for the response.
   * @throws {InvalidCredentialsError} Unknown email or wrong password.
   * @throws {AccountPendingError} Email matches a pending (unverified) user.
   * @throws {AccountLockedError|RateLimitedError} Throttle thresholds exceeded.
   */
  async login(input: {
    email: string;
    password: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<IssuedSession> {
    const accountKey = input.email.toLowerCase();
    this.deps.throttle.assertNotLocked(accountKey, input.ip);

    const user = await this.deps.users.findByEmail(accountKey);

    // Always run a bcrypt compare to equalise timing.
    const hashToCompare = user?.passwordHash ?? this.deps.dummyHash;
    const ok = await bcrypt.compare(input.password, hashToCompare);

    if (!user || !ok) {
      this.deps.throttle.recordFailure(accountKey, input.ip);
      this.deps.logger.info(
        { email: accountKey, outcome: 'failure', reason: !user ? 'unknown_email' : 'wrong_password' },
        'login',
      );
      throw new InvalidCredentialsError();
    }

    if (user.status === 'pending') {
      // Don't penalise account counter — pending isn't a brute-force signal.
      this.deps.logger.info({ userId: user.id, outcome: 'failure', reason: 'pending' }, 'login');
      throw new AccountPendingError();
    }
    if (user.status === 'disabled') {
      this.deps.logger.info({ userId: user.id, outcome: 'failure', reason: 'disabled' }, 'login');
      throw new InvalidCredentialsError();
    }

    this.deps.throttle.recordSuccess(accountKey);
    const issued = await this.deps.sessions.issue({
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    this.deps.logger.info({ userId: user.id, sid: issued.session.id, outcome: 'success' }, 'login');
    return issued;
  }
}
