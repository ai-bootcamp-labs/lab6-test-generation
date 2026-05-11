import type { Request, Response } from 'express';
import type { AccountDeletionService } from '../services/account-deletion.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/require-session.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

/**
 * Build the `DELETE /auth/account` handler.
 * @param service - Account-deletion service.
 * @param isProduction - Whether to flag cleared cookies `Secure`.
 * @returns Express handler.
 */
export function deleteAccountHandler(service: AccountDeletionService, isProduction: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const session = req.session;
    if (!session) throw new Error('deleteAccountHandler must be mounted behind requireSession');
    const ip = req.ip ?? null;
    await service.delete(session.userId, ip);
    const opts = { sameSite: 'lax' as const, secure: isProduction, path: '/' };
    res.clearCookie(SESSION_COOKIE_NAME, { ...opts, httpOnly: true });
    res.clearCookie(CSRF_COOKIE_NAME, { ...opts, httpOnly: false });
    res.status(204).send();
  };
}
