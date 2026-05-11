import { Router } from 'express';
import type { LogoutService } from '../services/logout.service.js';
import type { SessionService } from '../services/session.service.js';
import { logoutHandler } from '../handlers/logout.handler.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { buildRequireSession } from '../middleware/require-session.js';
import { csrf } from '../middleware/csrf.js';

/**
 * Build the logout router (`POST /logout`) mounted behind `requireSession`
 * and the CSRF double-submit-cookie verifier.
 * @param logout - Logout service.
 * @param sessions - Session service for `requireSession`.
 * @param isProduction - Cookie-secure flag for clearing.
 * @returns Express router.
 */
export function buildLogoutRouter(
  logout: LogoutService,
  sessions: SessionService,
  isProduction: boolean,
): Router {
  const router = Router();
  router.post('/logout', buildRequireSession(sessions), csrf, asyncHandler(logoutHandler(logout, isProduction)));
  return router;
}
