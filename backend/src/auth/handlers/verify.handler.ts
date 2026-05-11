import type { Request, Response } from 'express';
import { EmailOnlyRequestSchema, VerifyEmailRequestSchema } from '../schemas/verify.schema.js';
import type { VerificationService } from '../services/verification.service.js';

/**
 * Build the `POST /auth/verify-email` handler.
 * @param service - Verification service.
 * @returns Express handler.
 */
export function verifyEmailHandler(service: VerificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = VerifyEmailRequestSchema.parse(req.body);
    await service.consumeToken(body.token);
    res.status(204).end();
  };
}

/**
 * Build the `POST /auth/verify-email/resend` handler. Always returns 202 to
 * avoid disclosing email registration state.
 * @param service - Verification service.
 * @returns Express handler.
 */
export function resendVerificationHandler(service: VerificationService) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = EmailOnlyRequestSchema.parse(req.body);
    await service.resendVerification(body.email);
    res.status(202).json({ accepted: true });
  };
}
