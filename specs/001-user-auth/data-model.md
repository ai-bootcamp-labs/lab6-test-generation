# Phase 1 — Data Model: User Authentication System

**Feature**: 001-user-auth · **Date**: 2026-05-10 · **Spec**: [spec.md](spec.md)

PostgreSQL 16 schema for the auth feature. All tables live in the `auth`
schema. Times are `timestamptz` (UTC). Surrogate keys are `uuid` with
`gen_random_uuid()` defaults (requires `pgcrypto`).

---

## Entity overview

| Entity | Table | Spec FRs | Lifetime |
|---|---|---|---|
| User Account | `auth.users` | FR-001…008, FR-025…028 | Permanent (PII anonymized 30 days after deletion) |
| Email Verification Request | `auth.email_verifications` | FR-006a, FR-006b | 24 h, single-use |
| Session | `auth.sessions` | FR-008, FR-018…022c | 24 h, revocable |
| Password Reset Request | `auth.password_resets` | FR-012…017 | 30 min, single-use |
| Security Event | `auth.security_events` | FR-023, FR-023a | 12 months |

---

## `auth.users`

Represents an authenticatable account.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Surrogate, stable across email changes/anonymization. |
| `email` | `citext` | NULL allowed (cleared on anonymization); unique partial index on non-null values where `status <> 'disabled' OR anonymized_at IS NULL`. | Case-insensitive (FR-006). |
| `password_hash` | `text` | NULL allowed (cleared on anonymization). | Bcrypt cost 12 (FR-005, D4). |
| `status` | `auth.user_status` (enum) | NOT NULL, default `'pending'`. | `pending` \| `active` \| `locked` \| `disabled`. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |  |
| `verified_at` | `timestamptz` | NULL until verified | Set when email verification succeeds (FR-006a). |
| `last_login_at` | `timestamptz` | NULL |  |
| `failed_login_count` | `integer` | NOT NULL, default 0 | Reset on success (FR-010). |
| `failed_login_window_started_at` | `timestamptz` | NULL | Start of current 5-min window. |
| `locked_until` | `timestamptz` | NULL | Set when account-level lockout triggers. |
| `deleted_at` | `timestamptz` | NULL | Soft-delete marker (FR-026). |
| `anonymized_at` | `timestamptz` | NULL | Set by retention job (FR-027). |

**Indexes**:

- Unique partial index on `lower(email)` where `email IS NOT NULL` —
  enforces uniqueness across non-deleted accounts and allows reuse of an
  email after anonymization (FR-028).
- Index on `(status, locked_until)` for lockout queries.
- Index on `(deleted_at)` where `deleted_at IS NOT NULL AND anonymized_at IS NULL`
  for the retention job.

**State transitions**:

```text
                     register                              verify ✓
   (none) ───────────────────────────► pending ──────────────────────► active
                                            │                              │
                                            │ password reset ✓             │ admin/policy
                                            ▼                              ▼
                                          active                        locked
                                            │ ▲ failed-login threshold     │
                                            │ └─────────────────┐          │ unlock_at expires
                                            ▼                   │          ▼
                                          locked  ◄─────────────┘        active
                                            │
                                            │ self-delete
                                            ▼
                                         disabled  ──── retention 30d ──► disabled (PII anonymized)
```

**Validation rules**:

- `password_hash IS NOT NULL` while `status IN ('pending','active','locked')`.
- `verified_at IS NOT NULL` IFF `status NOT IN ('pending')` AND `deleted_at IS NULL`
  (active and locked accounts are by definition verified; disabled may be
  either depending on how they were closed).
- `anonymized_at IS NULL OR deleted_at IS NOT NULL` (anonymization only
  follows deletion).
- After anonymization, `email IS NULL AND password_hash IS NULL`.

---

## `auth.email_verifications`

Single-use, time-limited token granting email-ownership proof.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |  |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |  |
| `token_hash` | `bytea` | NOT NULL, UNIQUE | SHA-256 of opaque random token; the raw token is emailed and never persisted. |
| `issued_at` | `timestamptz` | NOT NULL, default `now()` |  |
| `expires_at` | `timestamptz` | NOT NULL | `issued_at + 24h` (FR-006a). |
| `used_at` | `timestamptz` | NULL | Set on successful consumption. |

**Indexes**: `(user_id)` for "invalidate prior unused links on resend"
(FR-006b); `(expires_at)` for purge.

**Rules**:

- A token is valid IFF `used_at IS NULL AND now() <= expires_at + interval '60 seconds'`
  (clock-skew leeway, D12).
- On successful use, `used_at` is set in the same transaction that flips
  `users.status` to `active` and sets `users.verified_at`.

---

## `auth.sessions`

Authoritative server-side session record. The JWT cookie carries only the
session id (D5).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Used as JWT `sid`. |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |  |
| `issued_at` | `timestamptz` | NOT NULL, default `now()` |  |
| `expires_at` | `timestamptz` | NOT NULL | `issued_at + 24h` (FR-018). |
| `revoked_at` | `timestamptz` | NULL | Logout / reset / admin / deletion. |
| `revoke_reason` | `auth.revoke_reason` (enum) | NULL | `'logout'` \| `'password_reset'` \| `'admin'` \| `'account_deleted'` \| `'expired'`. |
| `csrf_secret` | `text` | NOT NULL | Random per session; basis for CSRF cookie value (D11). |
| `source_ip` | `inet` | NULL | Audit metadata. |
| `user_agent` | `text` | NULL | Audit metadata; truncated to 512 chars. |

**Indexes**: `(user_id)` for "revoke all sessions"; `(expires_at)` for purge.

**Rules**:

- A session is **valid** IFF
  `revoked_at IS NULL AND now() <= expires_at + interval '60 seconds'`
  (D12 leeway).
- Multiple concurrent sessions per user are permitted (FR-020).
- Revocation MUST happen in the same transaction as the action that causes
  it (logout, password reset, account deletion).

---

## `auth.password_resets`

Single-use, time-limited reset grant.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |  |
| `user_id` | `uuid` | NOT NULL, FK → `auth.users(id)` ON DELETE CASCADE |  |
| `token_hash` | `bytea` | NOT NULL, UNIQUE | SHA-256 of opaque token; raw token only emailed. |
| `issued_at` | `timestamptz` | NOT NULL, default `now()` |  |
| `expires_at` | `timestamptz` | NOT NULL | `issued_at + 30 minutes` (FR-015). |
| `used_at` | `timestamptz` | NULL |  |

**Indexes**: `(user_id)`; `(expires_at)`.

**Rules**:

- A reset request is consumable IFF
  `used_at IS NULL AND now() <= expires_at + interval '60 seconds'`.
- On successful consumption (in one transaction): set `used_at`, update
  `users.password_hash`, revoke ALL of the user's active sessions
  (`revoke_reason = 'password_reset'`), and — if the user was `pending` —
  also set `users.verified_at` and flip `status` to `active`
  (clarification edge case from spec).

---

## `auth.security_events`

Append-only audit log.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `bigserial` | PK |  |
| `event_type` | `auth.event_type` (enum) | NOT NULL | See enum values below. |
| `user_id` | `uuid` | NULL, FK → `auth.users(id)` ON DELETE SET NULL | NULL for events that do not bind to an account (e.g., login attempts for unknown emails). |
| `occurred_at` | `timestamptz` | NOT NULL, default `now()` |  |
| `source_ip` | `inet` | NULL |  |
| `outcome` | `auth.event_outcome` (enum) | NOT NULL | `'success'` \| `'failure'`. |
| `reason_code` | `text` | NULL | Short machine-readable code (e.g., `'bad_password'`, `'account_locked'`). |
| `metadata` | `jsonb` | NULL, default `'{}'::jsonb` | Non-PII context (no passwords, no full tokens). |

**Event types**: `'register'`, `'verify_email'`, `'login'`, `'logout'`,
`'password_reset_request'`, `'password_reset_complete'`, `'session_revoke'`,
`'account_delete'`, `'lockout'`.

**Indexes**: `(occurred_at)` for retention purge (FR-023a);
`(user_id, occurred_at DESC)` for per-user audit views.

**Rules**:

- Inserts only; never updated or deleted except by the retention job.
- Retention: rows with `occurred_at < now() - interval '12 months'` are
  deleted by the daily job (D13).

---

## Enum types

```sql
CREATE TYPE auth.user_status   AS ENUM ('pending', 'active', 'locked', 'disabled');
CREATE TYPE auth.revoke_reason AS ENUM ('logout', 'password_reset', 'admin', 'account_deleted', 'expired');
CREATE TYPE auth.event_type    AS ENUM (
  'register', 'verify_email', 'login', 'logout',
  'password_reset_request', 'password_reset_complete',
  'session_revoke', 'account_delete', 'lockout'
);
CREATE TYPE auth.event_outcome AS ENUM ('success', 'failure');
```

---

## Cross-entity invariants

1. A `users` row in `pending` MUST have at least one un-used, un-expired
   `email_verifications` row OR have access to the "resend verification"
   flow (FR-006b).
2. A `users` row in `disabled` with `anonymized_at IS NULL AND
   deleted_at < now() - interval '30 days'` MUST be picked up by the next
   retention run.
3. No `sessions` row may exist with `user_id` referencing a `disabled`
   account that has `revoked_at IS NULL` — account deletion atomically
   revokes all sessions (FR-026).
4. `password_resets` and `email_verifications` token *raw values* MUST NEVER
   be persisted; only their SHA-256 hashes live in the DB. The raw token
   exists only in transit (the email message).

---

## Migration order

1. `001-users.sql` — extension + `auth` schema + `user_status` enum + `users`
2. `002-sessions.sql` — `revoke_reason` enum + `sessions`
3. `003-email-verification.sql` — `email_verifications`
4. `004-password-reset.sql` — `password_resets`
5. `005-security-events.sql` — `event_type`/`event_outcome` enums + `security_events`
