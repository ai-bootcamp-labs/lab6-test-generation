/**
 * 004-password-reset — `auth.password_resets` per data-model.md.
 *
 * Stores SHA-256 (hex) hashes of opaque tokens; the plaintext token is only
 * ever delivered via the password-reset email and never persisted.
 */
CREATE TABLE IF NOT EXISTS auth.password_resets (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash   TEXT         NOT NULL UNIQUE,
  issued_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ  NOT NULL,
  used_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx
  ON auth.password_resets (user_id);
CREATE INDEX IF NOT EXISTS password_resets_expires_idx
  ON auth.password_resets (expires_at);
