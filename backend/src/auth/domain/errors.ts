/**
 * Typed error hierarchy for the auth domain. Handlers map these to HTTP status
 * codes via the error-mapper middleware. Every error carries a stable
 * `reasonCode` so audit/logging can analyze without coupling to messages.
 */

/**
 * Base class for all auth-domain errors.
 */
export abstract class AuthError extends Error {
  /**
   * @param reasonCode - Stable machine-readable code for logging / metrics.
   * @param message - Human-readable diagnostic.
   */
  constructor(
    public readonly reasonCode: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Input validation failure (HTTP 400). */
export class ValidationError extends AuthError {
  /**
   * @param message - Reason for validation failure.
   * @param details - Optional structured details (e.g. Zod issues).
   */
  constructor(message = 'Invalid request', public readonly details?: unknown) {
    super('validation_error', message);
  }
}

/** Credentials did not authenticate; unified for unknown email vs wrong password (HTTP 401). */
export class InvalidCredentialsError extends AuthError {
  /**
   * Construct an invalid-credentials error.
   */
  constructor() {
    super('invalid_credentials', 'Invalid email or password');
  }
}

/** Account exists but email has not been verified yet (HTTP 403). */
export class AccountPendingError extends AuthError {
  /**
   * Construct a pending-verification error.
   */
  constructor() {
    super('account_pending', 'Account is pending email verification');
  }
}

/** Account or IP is throttled / locked (HTTP 423 for account, 429 for IP). */
export class AccountLockedError extends AuthError {
  /**
   * @param retryAfterSec - Seconds until the lock is released.
   */
  constructor(public readonly retryAfterSec: number) {
    super('account_locked', 'Too many failed attempts; account temporarily locked');
  }
}

/** Token expired (HTTP 410). */
export class TokenExpiredError extends AuthError {
  /**
   * Construct a token-expired error.
   */
  constructor() {
    super('token_expired', 'Token has expired');
  }
}

/** Token has already been redeemed (HTTP 410). */
export class TokenAlreadyUsedError extends AuthError {
  /**
   * Construct a token-already-used error.
   */
  constructor() {
    super('token_used', 'Token has already been used');
  }
}

/** Generic rate-limit violation (HTTP 429). */
export class RateLimitedError extends AuthError {
  /**
   * @param retryAfterSec - Seconds the caller must wait before retrying.
   */
  constructor(public readonly retryAfterSec: number) {
    super('rate_limited', 'Too many requests');
  }
}

/** Resource not found / generic 404. */
export class NotFoundError extends AuthError {
  /**
   * @param what - Optional resource label.
   */
  constructor(what = 'Resource') {
    super('not_found', `${what} not found`);
  }
}

/** CSRF token missing or mismatched (HTTP 403). */
export class CsrfError extends AuthError {
  /**
   * Construct a CSRF-validation error.
   */
  constructor() {
    super('csrf_error', 'CSRF validation failed');
  }
}

/** Conflict — e.g. duplicate registration after timing-equalised path (HTTP 409). */
export class ConflictError extends AuthError {
  /**
   * @param message - Reason for the conflict.
   */
  constructor(message = 'Conflict') {
    super('conflict', message);
  }
}
