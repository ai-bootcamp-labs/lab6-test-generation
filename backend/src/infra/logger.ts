import pino from 'pino';

/**
 * Centralised pino logger with redaction for sensitive fields (research D9, SC-005).
 * Any structured log call that includes these paths will have the values replaced
 * with `[Redacted]` before serialisation.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'cookie.session',
      'headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
    ],
    remove: false,
    censor: '[Redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Type alias for the application logger used across modules.
 */
export type Logger = typeof logger;
