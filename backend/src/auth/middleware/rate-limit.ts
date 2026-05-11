import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/**
 * Build the per-IP rate limiter for the login endpoint.
 *
 * Note: this is a coarse first-line defence; the {@link ThrottleService}
 * (per-account / per-IP failure counting with lockouts) is the authoritative
 * implementation of Clarification Q3 thresholds.
 * @returns Configured `express-rate-limit` middleware.
 */
export function buildLoginRateLimiter(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env['NODE_ENV'] === 'test',
  });
}
