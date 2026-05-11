import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './infra/config.js';
import { logger } from './infra/logger.js';
import { buildDb } from './infra/db.js';
import { buildAuthRouter } from './auth/index.js';
import { SystemClock } from './auth/adapters/clock.port.js';
import { NodemailerEmailAdapter } from './auth/adapters/email.port.js';
import { errorMapper } from './auth/middleware/error-mapper.js';

/**
 * Compose the Express application. Pure function — no side-effects until
 * {@link bootstrap} is called.
 * @returns A fully-wired Express app.
 */
export function buildApp(): Express {
  const config = loadConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { id: string }).id =
      (req.header('x-request-id') ?? randomUUID()).slice(0, 64);
    next();
  });

  const db = buildDb(config);
  const clock = new SystemClock();
  const email = new NodemailerEmailAdapter(config.SMTP_URL);

  app.use('/auth', buildAuthRouter({ config, db, clock, email }));

  app.use(errorMapper);
  return app;
}

/**
 * Start the HTTP server on the configured port.
 * @returns Promise that resolves once the server is listening.
 */
export async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = buildApp();
  await new Promise<void>((resolve) => {
    app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, env: config.NODE_ENV }, 'auth server started');
      resolve();
    });
  });
}

// Auto-bootstrap when invoked directly (ts-node-dev / node dist/server.js).
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  bootstrap().catch((err: unknown) => {
    logger.fatal({ err }, 'bootstrap failed');
    process.exit(1);
  });
}
