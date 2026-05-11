import type { Request, Response } from 'express';
import { LoginRequestSchema } from '../schemas/login.schema.js';
import type { LoginService } from '../services/login.service.js';
import { SESSION_TTL_MS } from '../services/session.service.js';
import { SESSION_COOKIE_NAME } from '../middleware/require-session.js';
import { CSRF_COOKIE_NAME } from '../middleware/csrf.js';

/**
 * Build the `POST /auth/login` handler. Sets `auth_session` (HttpOnly) and
 * `csrf_token` (readable) cookies on success.
 * @param service - Login service.
 * @param isProduction - When `true`, cookies are flagged `Secure`.
 * @returns Express handler.
 */
export function loginHandler(service: LoginService, isProduction: boolean) {
  return async (req: Request, res: Response): Promise<void> => {
    const body = LoginRequestSchema.parse(req.body);
    const ip = (req.ip ?? null);
    const userAgent = req.header('user-agent') ?? null;
    const issued = await service.login({ email: body.email, password: body.password, ip, userAgent });

    const cookieBase = {
      domain: undefined as string | undefined,
      sameSite: 'lax' as const,
      secure: isProduction,
      path: '/',
      maxAge: SESSION_TTL_MS,
    };
    res.cookie(SESSION_COOKIE_NAME, issued.jwt, { ...cookieBase, httpOnly: true });
    res.cookie(CSRF_COOKIE_NAME, issued.csrfCookieValue, { ...cookieBase, httpOnly: false });

    res.status(200).json({
      userId: issued.session.userId,
      sessionId: issued.session.id,
      expiresAt: issued.expiresAt.toISOString(),
    });
  };
}

/**
 * Build the `GET /auth/session` handler. Returns the live session info for
 * the calling cookie. Mounted behind {@link buildRequireSession} so failures
 * surface as 401 from middleware.
 * @returns Express handler.
 */
export function sessionHandler() {
  return (req: Request, res: Response): void => {
    const s = req.session;
    if (!s) throw new Error('sessionHandler must be mounted behind requireSession');
    res.status(200).json({
      userId: s.userId,
      sessionId: s.id,
      issuedAt: s.issuedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    });
  };
}
