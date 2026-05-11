import type { Request, Response } from 'express';
import { RegisterRequestSchema } from '../schemas/register.schema.js';
import type { RegistrationService } from '../services/registration.service.js';

/**
 * Build the `POST /auth/register` request handler.
 * @param service - Wired registration service.
 * @returns Express handler.
 */
export function registerHandler(service: RegistrationService) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = RegisterRequestSchema.parse(req.body);
    await service.register(body);
    res.status(201).json({ accepted: true });
  };
}
