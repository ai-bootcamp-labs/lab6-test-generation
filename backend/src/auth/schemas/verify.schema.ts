import { z } from 'zod';

/**
 * Zod schema for `POST /auth/verify-email`.
 */
export const VerifyEmailRequestSchema = z.object({
  token: z.string().min(20).max(512),
});

/**
 * Validated request payload type for verify-email.
 */
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

/**
 * Zod schema for `POST /auth/verify-email/resend` and reset-request bodies.
 */
export const EmailOnlyRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

/**
 * Validated payload type used by both verify-resend and reset-request.
 */
export type EmailOnlyRequest = z.infer<typeof EmailOnlyRequestSchema>;
