import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { PasswordResetService } from '../services/password-reset.service.js';
import {
  passwordResetConfirmHandler,
  passwordResetRequestHandler,
} from '../handlers/password-reset.handler.js';
import { asyncHandler } from '../middleware/async-handler.js';

/**
 * Build the password-reset sub-router.
 *
 * Per-IP rate limit of 5 requests / 15 min on the request endpoint matches
 * tasks T082; the confirm endpoint is also protected at the same rate.
 * @param service - Password-reset service.
 * @returns Express router.
 */
export function buildPasswordResetRouter(service: PasswordResetService): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'test',
  });
  router.post('/password-reset/request', limiter, asyncHandler(passwordResetRequestHandler(service)));
  router.post('/password-reset/confirm', limiter, asyncHandler(passwordResetConfirmHandler(service)));
  return router;
}
