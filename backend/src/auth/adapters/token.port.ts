import { createHash, randomBytes } from 'node:crypto';

/**
 * Length in bytes used for verification, reset, and CSRF tokens. 32 bytes
 * (256 bits) of entropy comfortably exceed the security floor for opaque
 * single-use credentials.
 */
export const TOKEN_BYTE_LENGTH = 32;

/**
 * Generate a cryptographically-random opaque token, base64url-encoded.
 * @returns A URL-safe random token string.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTE_LENGTH).toString('base64url');
}

/**
 * Compute a deterministic SHA-256 hash of an opaque token. Only the hash is
 * persisted (`token_hash` columns in `data-model.md`); the plaintext token is
 * delivered out-of-band (email link / cookie) and discarded server-side.
 * @param token - Plaintext token previously emitted by {@link generateToken}.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
