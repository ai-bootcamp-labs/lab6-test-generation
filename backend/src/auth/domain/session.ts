import type { UserId } from './user.js';
import type { RevokeReason } from '../repositories/tables/us2.tables.js';

/**
 * Branded session id type so it can't be confused with other UUIDs.
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/**
 * In-memory session aggregate.
 */
export interface Session {
  id: SessionId;
  userId: UserId;
  csrfSecret: string;
  ip: string | null;
  userAgent: string | null;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: RevokeReason | null;
}

/**
 * Result of issuing a brand-new session: the underlying row plus the signed
 * JWT and CSRF cookie value to set on the response.
 */
export interface IssuedSession {
  session: Session;
  jwt: string;
  csrfCookieValue: string;
  expiresAt: Date;
}

/**
 * Determine whether a session is currently considered live.
 *
 * Applies a positive leeway (typically 60 seconds) when comparing against
 * `expires_at` so minor clock skew between hosts doesn't reject otherwise
 * valid traffic.
 * @param session - Session row to evaluate.
 * @param now - Current wall-clock time.
 * @param leewaySec - Seconds of skew tolerance (default 60).
 * @returns `true` when not revoked and within `expiresAt + leeway`.
 */
export function isLive(session: Session, now: Date, leewaySec = 60): boolean {
  if (session.revokedAt !== null) return false;
  return session.expiresAt.getTime() + leewaySec * 1000 >= now.getTime();
}
