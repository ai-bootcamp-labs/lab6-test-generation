import { z } from 'zod';

/**
 * Zod schema describing required runtime configuration. Fail-fast on invalid env.
 */
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be ≥ 32 characters'),
  COOKIE_DOMAIN: z.string().min(1).default('localhost'),
  SMTP_URL: z.string().url(),
  PASSWORD_BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
});

/**
 * Strongly-typed application configuration loaded from environment variables.
 */
export type AppConfig = z.infer<typeof ConfigSchema>;

/**
 * Parse `process.env` (or a supplied source) into a validated {@link AppConfig}.
 * @param source - Optional override of the env source (defaults to {@link process.env}).
 * @returns Parsed, immutable configuration object.
 * @throws {z.ZodError} When required variables are missing or invalid.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return Object.freeze(ConfigSchema.parse(source));
}
