import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { SessionId } from './session.js';
import type { UserId } from './user.js';

/**
 * Stable claim shape encoded in every session JWT (research D5).
 */
export interface SessionTokenClaims extends JwtPayload {
  sub: UserId;
  sid: SessionId;
}

/**
 * Sign a session JWT using HS256.
 * @param secret - Shared HS256 secret (≥ 32 bytes).
 * @param claims - Subject, session id, and expiry seconds-since-epoch.
 * @returns Compact JWS string ready to set as a cookie.
 */
export function signSessionToken(
  secret: string,
  claims: { sub: UserId; sid: SessionId; expSec: number },
): string {
  return jwt.sign({ sub: claims.sub, sid: claims.sid }, secret, {
    algorithm: 'HS256',
    expiresIn: claims.expSec - Math.floor(Date.now() / 1000),
  });
}

/**
 * Verify a session JWT and return its claims.
 * @param secret - Shared HS256 secret.
 * @param token - Compact JWS to verify.
 * @param leewaySec - Seconds of clock skew allowed (default 60).
 * @returns Decoded {@link SessionTokenClaims}.
 * @throws Error When the signature, format, or expiry check fails.
 */
export function verifySessionToken(
  secret: string,
  token: string,
  leewaySec = 60,
): SessionTokenClaims {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'], clockTolerance: leewaySec });
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  return decoded as SessionTokenClaims;
}
