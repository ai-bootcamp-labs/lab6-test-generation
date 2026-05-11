import type { NextFunction, Request, Response } from 'express';
import { InvalidCredentialsError } from '../domain/errors.js';
import type { SessionService } from '../services/session.service.js';
import type { Session } from '../domain/session.js';
import type { UserId } from '../domain/user.js';

/**
 * Express request augmentation: handlers behind {@link requireSession} can
 * read `req.session` and `req.userId`.
 */
declare module 'express-serve-static-core' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Request {
    session?: Session;
    userId?: UserId;
  }
}

/** Cookie name carrying the signed session JWT. */
export const SESSION_COOKIE_NAME = 'auth_session';

/**
 * Build a `requireSession` middleware bound to the supplied service.
 * @param service - Session service responsible for token validation.
 * @returns Express middleware that attaches `req.session` or fails with 401.
 */
export function buildRequireSession(service: SessionService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const cookies = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
      const token = cookies[SESSION_COOKIE_NAME];
      if (!token) throw new InvalidCredentialsError();
      const { session } = await service.validate(token);
      req.session = session;
      req.userId = session.userId;
      next();
    } catch (err) {
      next(err);
    }
  };
}
