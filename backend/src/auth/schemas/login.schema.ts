import { z } from 'zod';

/**
 * Zod schema for `POST /auth/login`.
 */
export const LoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

/**
 * Validated login request payload.
 */
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
