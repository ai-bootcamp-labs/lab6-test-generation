import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { RegistrationService } from '../services/registration.service.js';
import { registerHandler } from '../handlers/register.handler.js';
import { asyncHandler } from '../middleware/async-handler.js';

/**
 * Build the `/auth/register` sub-router with per-IP rate limiting (5 req/min/IP).
 * @param service - Registration service.
 * @returns Express router exposing `POST /register`.
 */
export function buildRegisterRouter(service: RegistrationService): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'test',
  });
  router.post('/register', limiter, asyncHandler(registerHandler(service)));
  return router;
}
