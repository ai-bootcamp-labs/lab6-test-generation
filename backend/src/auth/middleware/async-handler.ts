import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wrap an async Express handler so rejected promises are forwarded to
 * `next(err)` and reach the error-mapper middleware. Required because
 * Express 4 does not auto-handle async errors.
 * @param fn - Async route handler.
 * @returns Express-compatible request handler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => {
      next(err);
    });
  };
}
