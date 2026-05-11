/**
 * 005-security-events — `auth.security_events` audit log per data-model.md.
 *
 * Append-only; rows older than 12 months are deleted by the retention job
 * (research D13). Inserted by every authentication-related service path.
 */

DO $$ BEGIN
  CREATE TYPE auth.event_type AS ENUM (
    'register',
    'verify_email',
    'login',
    'logout',
    'password_reset_request',
    'password_reset_complete',
    'session_revoke',
    'account_delete',
    'lockout'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE auth.event_outcome AS ENUM ('success', 'failure');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS auth.security_events (
  id           BIGSERIAL                PRIMARY KEY,
  event_type   auth.event_type          NOT NULL,
  user_id      UUID                     REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  source_ip    INET,
  outcome      auth.event_outcome       NOT NULL,
  reason_code  TEXT,
  metadata     JSONB                    NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS security_events_occurred_idx
  ON auth.security_events (occurred_at);
CREATE INDEX IF NOT EXISTS security_events_user_idx
  ON auth.security_events (user_id, occurred_at DESC);
