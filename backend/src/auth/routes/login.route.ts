import { Router } from 'express';
import type { LoginService } from '../services/login.service.js';
import type { SessionService } from '../services/session.service.js';
import { loginHandler, sessionHandler } from '../handlers/login.handler.js';
import { buildRequireSession } from '../middleware/require-session.js';
import { buildLoginRateLimiter } from '../middleware/rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';

/**
 * Build the login router (`POST /login`).
 * @param service - Login service.
 * @param isProduction - Cookie-secure flag.
 * @returns Router.
 */
export function buildLoginRouter(service: LoginService, isProduction: boolean): Router {
  const router = Router();
  router.post('/login', buildLoginRateLimiter(), asyncHandler(loginHandler(service, isProduction)));
  return router;
}

/**
 * Build the session router (`GET /session`) behind requireSession.
 * @param sessionService - Session service for validation.
 * @returns Router.
 */
export function buildSessionRouter(sessionService: SessionService): Router {
  const router = Router();
  router.get('/session', buildRequireSession(sessionService), sessionHandler());
  return router;
}
