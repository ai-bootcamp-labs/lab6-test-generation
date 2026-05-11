import { randomBytes } from 'node:crypto';
import type { Clock } from '../adapters/clock.port.js';
import { signSessionToken, verifySessionToken } from '../domain/token.js';
import { isLive, type IssuedSession, type Session, type SessionId } from '../domain/session.js';
import type { UserId } from '../domain/user.js';
import type { SessionsRepository } from '../repositories/sessions.repo.js';
import type { RevokeReason } from '../repositories/tables/us2.tables.js';
import { InvalidCredentialsError } from '../domain/errors.js';

/**
 * Session TTL — 24 hours per Clarification Q4 / data-model.md.
 */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Clock-skew leeway for session-expiry checks (60 seconds).
 */
export const SESSION_LEEWAY_SEC = 60;

/**
 * Dependency bag for the session service.
 */
export interface SessionDeps {
  sessions: SessionsRepository;
  clock: Clock;
  jwtSecret: string;
}

/**
 * Validation result returned by {@link SessionService.validate} so callers
 * (`requireSession` middleware) can attach both the user id and the live
 * session row to `req`.
 */
export interface ValidatedSession {
  session: Session;
}

/**
 * Manages issuing, validating, and revoking server-side session rows.
 */
export class SessionService {
  /** @param deps - Wired dependencies. */
  constructor(private readonly deps: SessionDeps) {}

  /**
   * Issue a brand-new session for the given user.
   * @param input - User id, optional client metadata.
   * @returns Issued session (row + JWT + CSRF cookie value).
   */
  async issue(input: {
    userId: UserId;
    ip: string | null;
    userAgent: string | null;
  }): Promise<IssuedSession> {
    const now = this.deps.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const csrfSecret = randomBytes(32).toString('base64url');
    const session = await this.deps.sessions.insert({
      userId: input.userId,
      csrfSecret,
      ip: input.ip,
      userAgent: input.userAgent,
      expiresAt,
    });
    const jwt = signSessionToken(this.deps.jwtSecret, {
      sub: session.userId,
      sid: session.id,
      expSec: Math.floor(expiresAt.getTime() / 1000),
    });
    return { session, jwt, csrfCookieValue: csrfSecret, expiresAt };
  }

  /**
   * Validate a presented JWT. Performs signature check, DB lookup, and
   * revocation/expiry checks (with 60s leeway).
   * @param token - JWT extracted from the `auth_session` cookie.
   * @returns Validated session aggregate.
   * @throws {InvalidCredentialsError} On any failure (signature/missing/revoked/expired).
   */
  async validate(token: string): Promise<ValidatedSession> {
    let claims;
    try {
      claims = verifySessionToken(this.deps.jwtSecret, token, SESSION_LEEWAY_SEC);
    } catch {
      throw new InvalidCredentialsError();
    }
    const session = await this.deps.sessions.findById(claims.sid);
    if (!session) throw new InvalidCredentialsError();
    if (session.userId !== claims.sub) throw new InvalidCredentialsError();
    if (!isLive(session, this.deps.clock.now(), SESSION_LEEWAY_SEC)) {
      throw new InvalidCredentialsError();
    }
    return { session };
  }

  /**
   * Revoke a single session by id.
   * @param id - Session id.
   * @param reason - Audit reason.
   * @returns Resolves on success.
   */
  async revoke(id: SessionId, reason: RevokeReason): Promise<void> {
    await this.deps.sessions.revoke(id, reason, this.deps.clock.now());
  }

  /**
   * Revoke every live session for a user.
   * @param userId - Subject.
   * @param reason - Audit reason.
   * @returns Number of sessions revoked.
   */
  async revokeAllForUser(userId: UserId, reason: RevokeReason): Promise<number> {
    return this.deps.sessions.revokeAllForUser(userId, reason, this.deps.clock.now());
  }
}
