import type { Request, Response } from 'express';
import type { LogoutService } from '../services/logout.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/require-session.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

/**
 * Build the `POST /auth/logout` handler. Revokes the calling session and
 * clears `auth_session` and `csrf_token` cookies on the response.
 * @param service - Logout service.
 * @param isProduction - Whether to flag cleared cookies `Secure`.
 * @returns Express handler.
 */
export function logoutHandler(service: LogoutService, isProduction: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const session = req.session;
    if (!session) throw new Error('logoutHandler must be mounted behind requireSession');
    await service.logout(session.id, session.userId);
    const clearOpts = {
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
    };
    res.clearCookie(SESSION_COOKIE_NAME, { ...clearOpts, httpOnly: true });
    res.clearCookie(CSRF_COOKIE_NAME, { ...clearOpts, httpOnly: false });
    res.status(204).send();
  };
}
