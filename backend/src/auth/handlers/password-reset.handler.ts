import type { Request, Response } from 'express';
import {
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
} from '../schemas/reset.schema.js';
import type { PasswordResetService } from '../services/password-reset.service.js';

/**
 * Build the `POST /auth/password-reset/request` handler. Always responds 202
 * with `{accepted: true}` so callers cannot distinguish known vs unknown
 * emails (FR-014).
 * @param service - Password-reset service.
 * @returns Express handler.
 */
export function passwordResetRequestHandler(service: PasswordResetService) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = PasswordResetRequestSchema.parse(req.body);
    await service.request({ email: body.email });
    res.status(202).json({ accepted: true });
  };
}

/**
 * Build the `POST /auth/password-reset/confirm` handler. 204 on success.
 * @param service - Password-reset service.
 * @returns Express handler.
 */
export function passwordResetConfirmHandler(service: PasswordResetService) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = PasswordResetConfirmSchema.parse(req.body);
    await service.confirm({ token: body.token, password: body.password });
    res.status(204).send();
  };
}
