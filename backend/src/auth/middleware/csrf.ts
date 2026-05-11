import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CsrfError } from '../domain/errors.js';

/** HTTP methods that mutate state and therefore require CSRF validation. */
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Cookie name carrying the CSRF secret (NOT HttpOnly so the browser can read it). */
export const CSRF_COOKIE_NAME = 'csrf_token';

/** Header expected to mirror the CSRF cookie value (double-submit pattern). */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Constant-time string equality.
 * @param a - First string.
 * @param b - Second string.
 * @returns `true` when bytes match.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Double-submit-cookie CSRF middleware (research D11). Skips safe methods and
 * the login + register endpoints (no session yet to bind to). Other state-
 * changing methods must present an `x-csrf-token` header equal to both the
 * `csrf_token` cookie and the bound session's `csrfSecret`.
 * @param req - Express request.
 * @param _res - Express response.
 * @param next - Continuation.
 */
export function csrf(req: Request, _res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method)) {
    next();
    return;
  }
  // Only enforce when a session is attached (login/register skip this).
  if (!req.session) {
    next();
    return;
  }
  const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
  const cookieValue = cookies[CSRF_COOKIE_NAME];
  const headerValue = req.header(CSRF_HEADER_NAME);
  if (!cookieValue || !headerValue) {
    next(new CsrfError());
    return;
  }
  if (!safeEqual(cookieValue, headerValue) || !safeEqual(cookieValue, req.session.csrfSecret)) {
    next(new CsrfError());
    return;
  }
  next();
}
