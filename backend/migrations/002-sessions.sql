/**
 * 002-sessions — `auth.revoke_reason` enum + `auth.sessions` table per data-model.md.
 *
 * Each session row is the server-side state referenced by an opaque session
 * id embedded in the signed JWT cookie (clarification Q2). The CSRF secret
 * column powers the double-submit-cookie check (research D11).
 */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'revoke_reason') THEN
    CREATE TYPE auth.revoke_reason AS ENUM (
      'logout',
      'password_reset',
      'admin_revoke',
      'expired',
      'account_deleted'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS auth.sessions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csrf_secret   TEXT         NOT NULL,
  ip            INET,
  user_agent    TEXT,
  issued_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ  NOT NULL,
  revoked_at    TIMESTAMPTZ,
  revoke_reason auth.revoke_reason
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON auth.sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_live_idx
  ON auth.sessions (user_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON auth.sessions (expires_at);
