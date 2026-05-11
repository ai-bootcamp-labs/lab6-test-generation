import { Router } from 'express';
import type { AccountDeletionService } from '../services/account-deletion.service.js';
import type { SessionService } from '../services/session.service.js';
import { buildRequireSession } from '../middleware/require-session.js';
import { csrf } from '../middleware/csrf.js';
import { deleteAccountHandler } from '../handlers/account.handler.js';
import { asyncHandler } from '../middleware/async-handler.js';

/**
 * Build the account router (`DELETE /account`) mounted behind `requireSession`
 * and the CSRF double-submit-cookie verifier.
 * @param service - Account-deletion service.
 * @param sessions - Session service for `requireSession`.
 * @param isProduction - Cookie-secure flag for clearing.
 * @returns Express router.
 */
export function buildAccountRouter(
  service: AccountDeletionService,
  sessions: SessionService,
  isProduction: boolean,
): Router {
  const router = Router();
  router.delete('/account', buildRequireSession(sessions), csrf, asyncHandler(deleteAccountHandler(service, isProduction)));
  return router;
}
