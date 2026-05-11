/**
 * 001-users — `auth.user_status` enum + `auth.users` table per data-model.md.
 * Idempotent: uses IF NOT EXISTS / DO blocks where Postgres permits it.
 */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE auth.user_status AS ENUM ('pending', 'active', 'disabled');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT       NOT NULL,
  password_hash   TEXT         NOT NULL,
  status          auth.user_status NOT NULL DEFAULT 'pending',
  verified_at     TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  anonymized_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial unique index: only enforce uniqueness on live (non-anonymised) accounts
CREATE UNIQUE INDEX IF NOT EXISTS users_email_live_uniq
  ON auth.users (email)
  WHERE anonymized_at IS NULL;

CREATE INDEX IF NOT EXISTS users_status_idx ON auth.users (status);
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON auth.users (deleted_at)
  WHERE deleted_at IS NOT NULL;
