import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../domain/password-policy.js';

/**
 * `POST /auth/password-reset/request` body — just an email.
 */
export const PasswordResetRequestSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
});

/** Validated request shape. */
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;

/**
 * `POST /auth/password-reset/confirm` body — token + new password.
 */
export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
});

/** Validated confirm-request shape. */
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;
