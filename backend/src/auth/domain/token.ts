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
 * Sign a session JWT using HS256. The expiry is encoded directly as the `exp`
 * claim (seconds since epoch) so the caller's clock — not real time —
 * determines token lifetime, which is required for tests using a `FakeClock`.
 * @param secret - Shared HS256 secret (≥ 32 bytes).
 * @param claims - Subject, session id, and expiry seconds-since-epoch.
 * @returns Compact JWS string ready to set as a cookie.
 */
export function signSessionToken(
  secret: string,
  claims: { sub: UserId; sid: SessionId; expSec: number },
): string {
  return jwt.sign(
    { sub: claims.sub, sid: claims.sid, exp: claims.expSec },
    secret,
    { algorithm: 'HS256' },
  );
}

/**
 * Verify a session JWT and return its claims.
 * @param secret - Shared HS256 secret.
 * @param token - Compact JWS to verify.
 * @param leewaySec - Seconds of clock skew allowed (default 60).
 * @param nowSec - Reference "now" in seconds since epoch; defaults to real
 *   time. Pass a value derived from the injected `Clock` (e.g.
 *   `Math.floor(clock.now().getTime() / 1000)`) so the expiry check honours
 *   test-controlled time.
 * @returns Decoded {@link SessionTokenClaims}.
 * @throws Error When the signature, format, or expiry check fails.
 */
export function verifySessionToken(
  secret: string,
  token: string,
  leewaySec = 60,
  nowSec?: number,
): SessionTokenClaims {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    clockTolerance: leewaySec,
    ...(nowSec !== undefined ? { clockTimestamp: nowSec } : {}),
  });
  // `jwt.verify` returns `string | JwtPayload`; reject the string form so the
  // remaining code can safely treat the value as an object payload.
  if (typeof decoded !== 'object') {
    throw new Error('Invalid token payload');
  }
  return decoded as SessionTokenClaims;
}
