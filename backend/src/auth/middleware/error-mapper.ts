import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import {
  AccountLockedError,
  AccountPendingError,
  AuthError,
  ConflictError,
  CsrfError,
  InvalidCredentialsError,
  NotFoundError,
  RateLimitedError,
  TokenAlreadyUsedError,
  TokenExpiredError,
  ValidationError,
} from '../domain/errors.js';
import { logger } from '../../infra/logger.js';

/**
 * Map an {@link AuthError} subclass to the HTTP status code defined in the
 * OpenAPI contract. Unknown errors fall through to 500.
 * @param err - Caught error to classify.
 * @returns HTTP status code.
 */
function statusFor(err: unknown): number {
  if (err instanceof ValidationError) return 400;
  if (err instanceof InvalidCredentialsError) return 401;
  if (err instanceof AccountPendingError) return 403;
  if (err instanceof CsrfError) return 403;
  if (err instanceof AccountLockedError) return 423;
  if (err instanceof TokenExpiredError) return 410;
  if (err instanceof TokenAlreadyUsedError) return 410;
  if (err instanceof RateLimitedError) return 429;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  return 500;
}

/**
 * Express error-handling middleware that converts thrown errors into the
 * RFC-9457-style `application/problem+json` shape used by the contract.
 */
export const errorMapper: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as unknown as { id?: string }).id;

  if (err instanceof ZodError) {
    const wrapped = new ValidationError('Request payload invalid', err.flatten());
    err = wrapped;
  }

  if (err instanceof AuthError) {
    const status = statusFor(err);
    logger.warn({ requestId, reasonCode: err.reasonCode, status }, err.message);
    const body: Record<string, unknown> = {
      type: `urn:auth:error:${err.reasonCode}`,
      title: err.message,
      status,
      reasonCode: err.reasonCode,
    };
    if (err instanceof ValidationError && err.details !== undefined) {
      body['errors'] = err.details;
    }
    if (err instanceof AccountLockedError || err instanceof RateLimitedError) {
      res.setHeader('Retry-After', String(err.retryAfterSec));
    }
    res.status(status).json(body);
    return;
  }

  logger.error({ requestId, err: { name: (err as Error)?.name, message: (err as Error)?.message } }, 'unhandled_error');
  res.status(500).json({
    type: 'urn:auth:error:internal',
    title: 'Internal Server Error',
    status: 500,
  });
};
