/**
 * 003-email-verification — `auth.email_verifications` table per data-model.md.
 * Stores SHA-256 hashes of opaque tokens; plaintext is delivered via email
 * and never persisted server-side.
 */
CREATE TABLE IF NOT EXISTS auth.email_verifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT         NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ  NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_idx
  ON auth.email_verifications (user_id);
CREATE INDEX IF NOT EXISTS email_verifications_active_idx
  ON auth.email_verifications (user_id)
  WHERE used_at IS NULL;
