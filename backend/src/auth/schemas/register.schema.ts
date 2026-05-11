import { z } from 'zod';

/**
 * Zod schema for `POST /auth/register` request bodies. Mirrors the
 * `RegisterRequest` shape in `contracts/auth-api.openapi.yaml`.
 */
export const RegisterRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

/**
 * Validated request payload type.
 */
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
