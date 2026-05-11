---
description: "Task list for feature 001-user-auth implementation"
---

# Tasks: User Authentication System

**Input**: Design documents from `/specs/001-user-auth/`  
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/auth-api.openapi.yaml](contracts/auth-api.openapi.yaml), [quickstart.md](quickstart.md)

**Tests**: REQUIRED — Constitution Principle III (NON-NEGOTIABLE) mandates the testing-pyramid with ≥ 80 % line+branch coverage on business-logic modules. Test tasks therefore appear within every user story phase.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md). Each story is independently testable per its acceptance scenarios.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User-story tag (US1 = Register & verify, US2 = Login, US3 = Password reset, US4 = Session expiry)
- File paths are absolute relative to the repo root

## Path Conventions

Web service layout from `plan.md`. All source paths begin with `backend/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, tooling, and CI baseline. NO product code yet.

- [X] T001 Create `backend/` project skeleton (folders: `src/auth/{routes,handlers,services,repositories,domain,middleware,adapters,schemas}`, `src/infra/{jobs}`, `migrations/`, `tests/{unit,integration,e2e}`) per the structure in `plan.md`
- [X] T002 Initialize Node project: create `backend/package.json` with TypeScript 5.4, Node 20 engines field; install runtime deps (`express`, `pg`, `kysely`, `jsonwebtoken`, `bcrypt`, `cookie-parser`, `helmet`, `express-rate-limit`, `zod`, `pino`, `nodemailer`, `node-cron`, `node-pg-migrate`) and dev deps (`typescript`, `ts-node-dev`, `@types/*`, `jest`, `ts-jest`, `supertest`, `@types/supertest`, `testcontainers`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-jsdoc`, `prettier`)
- [X] T003 [P] Author `backend/tsconfig.json` with `strict: true`, `noImplicitOverride`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `target: ES2022`, `module: NodeNext`, `outDir: dist`
- [X] T004 [P] Author `backend/.eslintrc.cjs` extending `@typescript-eslint/strict` and `plugin:jsdoc/recommended-typescript-error`; require JSDoc on all exported symbols (Constitution Principle IV)
- [X] T005 [P] Author `backend/.prettierrc.json` (single-quote, semicolons, 100-col print width) and `backend/.prettierignore`
- [X] T006 [P] Author `backend/jest.config.ts` using `ts-jest`, projects for unit/integration/e2e, and `coverageThreshold` enforcing ≥ 80 % line and branch on `src/auth/services/**/*.ts` and `src/auth/domain/**/*.ts` (Constitution Principle III)
- [X] T007 [P] Author `backend/.env.example` with the variables listed in `quickstart.md` (`DATABASE_URL`, `JWT_SECRET`, `COOKIE_DOMAIN`, `SMTP_URL`, `PASSWORD_BCRYPT_COST`, `PORT`, `NODE_ENV`)
- [X] T008 [P] Author `backend/docker-compose.yml` with services `postgres:16` (port 5432) and `mailhog/mailhog` (ports 1025, 8025) for local development per `quickstart.md`
- [X] T009 [P] Author `backend/package.json` npm scripts: `dev`, `build`, `start`, `lint`, `format`, `test`, `test:cov`, `test:e2e`, `db:migrate`, `db:rollback`

**Checkpoint**: `npm install`, `npm run lint`, `npm test` (with no tests yet) and `tsc --noEmit` all succeed against an empty source tree.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure that every user story depends on. NO user-story logic here.

**⚠️ CRITICAL**: No US1–US4 work begins until Phase 2 is complete.

- [X] T010 Create `backend/src/infra/config.ts` exporting a `loadConfig()` function that parses `process.env` through a Zod schema and returns a typed `AppConfig` (fail-fast on invalid env)
- [X] T011 [P] Create `backend/src/infra/logger.ts` exporting a `pino` instance with redaction paths `password`, `passwordHash`, `token`, `cookie.session`, `headers.cookie` (research D9, SC-005)
- [X] T012 Create `backend/src/infra/db.ts` exporting a singleton `Kysely<DB>` instance bound to a `pg.Pool` constructed from `AppConfig.DATABASE_URL`; export the `DB` interface scaffold (tables added in story-specific tasks)
- [X] T013 Create migration `backend/migrations/000-extensions.sql` enabling `pgcrypto` and `citext`, and creating the `auth` schema
- [X] T014 [P] Create `backend/src/auth/domain/errors.ts` defining a base `AuthError` and typed subclasses: `ValidationError`, `InvalidCredentialsError`, `AccountPendingError`, `AccountLockedError`, `TokenExpiredError`, `TokenAlreadyUsedError`, `RateLimitedError`, `NotFoundError`, `CsrfError` (Constitution: typed errors)
- [X] T015 [P] Create `backend/src/auth/adapters/clock.port.ts` defining a `Clock` interface (`now(): Date`) and a `SystemClock` implementation; used by services to make time injectable for tests (research D12)
- [X] T016 [P] Create `backend/src/auth/adapters/email.port.ts` defining the `EmailPort` interface (`sendVerification(to, token, url)`, `sendPasswordReset(to, token, url)`) and a `NodemailerEmailAdapter` implementation backed by `SMTP_URL` (research D7)
- [X] T017 [P] Create `backend/src/auth/adapters/token.port.ts` defining helpers for generating cryptographically-random opaque tokens (32 bytes base64url) and SHA-256 hashing them for storage (data-model: `token_hash` columns)
- [X] T018 Create `backend/src/auth/middleware/error-mapper.ts` Express error-handling middleware that maps `AuthError` subclasses to HTTP status codes per `contracts/auth-api.openapi.yaml` and emits structured log lines via `pino`
- [X] T019 [P] Create `backend/src/server.ts` composing the Express app: `helmet`, `cookie-parser`, JSON body limit (100 KB), trust-proxy, `requestId` middleware, error-mapper; mount placeholder router from `auth/index.ts`
- [X] T020 [P] Create `backend/src/auth/index.ts` composition root: a `buildAuthRouter(deps)` function that wires repos → services → routes; exports the Express router. Initially returns an empty router; user-story phases register routes onto it.
- [X] T021 [P] [Test] Author `backend/tests/integration/_helpers/db.ts` that starts a `testcontainers` Postgres container, runs migrations, and exposes a `withDb(test)` helper for integration tests
- [X] T022 [P] [Test] Author `backend/tests/unit/_helpers/fakes.ts` providing `FakeClock` (advances on demand) and `FakeEmailAdapter` (records sent messages in memory) for unit tests

**Checkpoint**: `npm test` runs (no tests yet); `npm run dev` boots the empty server, `helmet` headers appear, `/auth` returns 404. Foundation ready — US1–US4 may proceed in parallel.

---

## Phase 3: User Story 1 — Register & verify email (Priority: P1) 🎯 MVP slice 1/2

**Goal**: A new visitor can register an account and verify their email, leaving the account in `active` state ready for login.

**Independent Test**: Run `tests/e2e/us1-register-verify.e2e.spec.ts`: POST `/auth/register` with a valid, unused email + strong password → 201 + pending account; pull token from `FakeEmailAdapter`; POST `/auth/verify-email` → 204; row in `auth.users` has `status='active'` and `verified_at` set.

### Tests for User Story 1 ⚠️ Write FIRST, ensure they FAIL

- [X] T023 [P] [US1] Contract test against `contracts/auth-api.openapi.yaml` for `POST /auth/register` in `backend/tests/integration/us1/register.contract.spec.ts` — validates request/response schemas and status codes 201/400/409/429
- [X] T024 [P] [US1] Contract test for `POST /auth/verify-email` and `POST /auth/verify-email/resend` in `backend/tests/integration/us1/verify.contract.spec.ts` — validates 204/400/410/202/429
- [X] T025 [P] [US1] Unit test for password-strength validator (length ≥ 12; ≥ 3 of lower/upper/digit/symbol; rejects common passwords) in `backend/tests/unit/us1/password-policy.spec.ts`
- [X] T026 [P] [US1] Unit test for `RegistrationService` (creates pending user, persists bcrypt hash, issues verification token, returns generic 409 on duplicate without leaking timing) in `backend/tests/unit/us1/registration.service.spec.ts`
- [X] T027 [P] [US1] Unit test for `VerificationService` covering: success, expired token (→ `TokenExpiredError`), reused token (→ `TokenAlreadyUsedError`), tampered hash, and clock-skew leeway in `backend/tests/unit/us1/verification.service.spec.ts`
- [X] T028 [P] [US1] Integration test for `users` + `email_verifications` repository roundtrip against `testcontainers` Postgres in `backend/tests/integration/us1/users-repo.spec.ts` — covers unique-email partial index, FK cascade
- [X] T029 [P] [US1] E2E happy-path & "verification first" rejection test in `backend/tests/e2e/us1-register-verify.e2e.spec.ts` — exercises Story 1 acceptance scenarios 1, 2, 3 from spec
- [X] T030 [US1] Run the new tests; confirm they all FAIL for the right reasons (missing implementation), not for setup errors

### Implementation for User Story 1

- [X] T031 [P] [US1] Create migration `backend/migrations/001-users.sql` per `data-model.md`: `auth.user_status` enum, `auth.users` table, partial unique index on `lower(email)`, supporting indexes
- [X] T032 [P] [US1] Create migration `backend/migrations/003-email-verification.sql` per `data-model.md`: `auth.email_verifications` table with FK cascade
- [X] T033 [P] [US1] Add `users` and `email_verifications` table interfaces to the `DB` type in `backend/src/auth/repositories/db-types.ts`
- [X] T034 [P] [US1] Create `backend/src/auth/domain/user.ts` — pure types: `User`, `UserStatus`, factory `newPendingUser()` and state-transition functions (no I/O)
- [X] T035 [P] [US1] Create `backend/src/auth/schemas/register.schema.ts` — Zod schema for the `RegisterRequest` body matching the OpenAPI contract; export inferred TS type
- [X] T036 [P] [US1] Create `backend/src/auth/schemas/verify.schema.ts` — Zod schemas for `VerifyEmailRequest` and `EmailOnlyRequest`
- [X] T037 [P] [US1] Create `backend/src/auth/domain/password-policy.ts` — pure function `validatePasswordStrength(plain): Result` enforcing length ≥ 12 and ≥ 3 character classes; rejects a small bundled list of common passwords (depends on T025 test failing first)
- [X] T038 [US1] Create `backend/src/auth/repositories/users.repo.ts` — `findByEmail`, `insertPending`, `markVerified`, `existsByEmail`; uses Kysely; case-insensitive lookups via `citext` (depends on T031, T033)
- [X] T039 [US1] Create `backend/src/auth/repositories/verification.repo.ts` — `insertToken`, `findByTokenHash`, `markUsed`, `invalidateAllForUser` (depends on T032, T033)
- [X] T040 [US1] Create `backend/src/auth/services/registration.service.ts` — orchestrates: validate password (T037), hash with bcrypt cost 12, insert pending user, issue + email verification token, write `register` security event; ensures duplicate-email path returns identical timing profile (research D4)
- [X] T041 [US1] Create `backend/src/auth/services/verification.service.ts` — `consumeToken` (transactional: validate not-expired+not-used with 60 s leeway, mark used, flip user to active, set `verified_at`); `resendVerification` (idempotent, throttled, generic 202 response per FR-006b)
- [X] T042 [US1] Create `backend/src/auth/handlers/register.handler.ts` — parses with Zod schema, calls service, maps to 201/400/409 per contract
- [X] T043 [US1] Create `backend/src/auth/handlers/verify.handler.ts` — parses, calls `consumeToken`, maps to 204/400/410; resend handler maps to 202
- [X] T044 [US1] Create `backend/src/auth/routes/register.route.ts` and `backend/src/auth/routes/verify.route.ts`; mount on the auth router with per-IP rate-limit middleware (5 req/min/IP for register, 3 req/min/IP for resend)
- [X] T045 [US1] Wire registration + verification dependencies into `backend/src/auth/index.ts` composition root
- [X] T046 [US1] Run all US1 tests (T023–T029); confirm they now PASS; verify coverage on `services/registration.service.ts` and `services/verification.service.ts` is ≥ 80 % line and branch

**Checkpoint**: User Story 1 is fully functional and independently demoable per quickstart §"Story 1".

---

## Phase 4: User Story 2 — Login & session (Priority: P1) 🎯 MVP slice 2/2

**Goal**: A verified user can log in, receive an `HttpOnly` session cookie + CSRF cookie, and exchange them for protected calls. Throttling enforces lockout per Clarification Q3.

**Independent Test**: Run `tests/e2e/us2-login.e2e.spec.ts`: register+verify a user (helpers from US1), POST `/auth/login` with correct creds → 200 + `Set-Cookie: auth_session…HttpOnly`; GET `/auth/session` with that cookie → 200; wrong password 5× within 5 min → 6th attempt returns 423 (account locked) without reaching credential verification.

### Tests for User Story 2 ⚠️ Write FIRST, ensure they FAIL

- [X] T047 [P] [US2] Contract tests for `POST /auth/login` and `GET /auth/session` in `backend/tests/integration/us2/login.contract.spec.ts` — covers 200/401/403/423/429 status codes and cookie attributes (`HttpOnly`, `Secure`, `SameSite=Lax`)
- [X] T048 [P] [US2] Unit test for `LoginService`: success path issues a session row + signed JWT carrying only `{sub, sid, iat, exp}`; pending account → `AccountPendingError`; wrong password → `InvalidCredentialsError`; unknown email → `InvalidCredentialsError` (identical error class for non-enumeration); enforces timing parity within 100 ms (mock bcrypt) — `backend/tests/unit/us2/login.service.spec.ts`
- [X] T049 [P] [US2] Unit test for `ThrottleService` per Clarification Q3: 5 fails/account/5 min → 15 min lockout; 20 fails/IP/5 min → 15 min IP throttle; success resets account counter; window expiry resets — `backend/tests/unit/us2/throttle.service.spec.ts`
- [X] T050 [P] [US2] Unit test for `SessionService.issue` and `SessionService.validate`: signs JWT, persists row, validates signature + DB lookup + not-revoked + not-expired (with 60 s leeway), rejects revoked sessions in `backend/tests/unit/us2/session.service.spec.ts`
- [X] T051 [P] [US2] Unit test for `requireSession` middleware: extracts cookie, calls validate, attaches `req.user`, rejects with 401 on missing/invalid; `csrf` middleware: rejects when header ≠ cookie or absent on state-changing methods (research D11) in `backend/tests/unit/us2/middleware.spec.ts`
- [X] T052 [P] [US2] Integration test for `sessions` repo (insert, find by id, revoke, revoke-all-for-user) in `backend/tests/integration/us2/sessions-repo.spec.ts`
- [X] T053 [P] [US2] E2E test of Story 2 acceptance scenarios 1–5 in `backend/tests/e2e/us2-login.e2e.spec.ts`
- [X] T054 [US2] Run the new tests; confirm they all FAIL for the right reasons

### Implementation for User Story 2

- [X] T055 [P] [US2] Create migration `backend/migrations/002-sessions.sql` per `data-model.md`: `auth.revoke_reason` enum, `auth.sessions` table with `csrf_secret`, indexes
- [X] T056 [P] [US2] Add `sessions` to `DB` type interface in `backend/src/auth/repositories/db-types.ts`
- [X] T057 [P] [US2] Create `backend/src/auth/domain/session.ts` — pure types: `Session`, `IssuedSession`, helper `isLive(session, now, leewaySec)`
- [X] T058 [P] [US2] Create `backend/src/auth/domain/token.ts` — JWT signing/verification helpers using HS256 with secret from config; payload typed as `{sub: UserId, sid: SessionId, iat, exp}` (research D5)
- [X] T059 [P] [US2] Create `backend/src/auth/schemas/login.schema.ts` — Zod schema for `LoginRequest`
- [X] T060 [US2] Create `backend/src/auth/repositories/sessions.repo.ts` — `insert`, `findById`, `revoke`, `revokeAllForUser(userId, reason)`, `purgeExpired` (depends on T055, T056)
- [X] T061 [P] [US2] Create `backend/src/auth/services/throttle.service.ts` — implements Clarification Q3 thresholds; persists counters in Postgres or via `express-rate-limit` Postgres store; exposes `recordFailure`, `recordSuccess`, `assertNotLocked` (research D6)
- [X] T062 [US2] Create `backend/src/auth/services/session.service.ts` — `issue(userId, ip, ua) → {jwt, csrfCookie, expiresAt}`; `validate(jwt) → User` performing signature check + DB lookup + revocation + expiry+leeway; `revoke(sessionId, reason)` (depends on T058, T060)
- [X] T063 [US2] Create `backend/src/auth/services/login.service.ts` — orchestrates: throttle preflight, fetch user, reject if pending, bcrypt compare, on success issue session + reset throttle counter + write `login success` audit event, on failure record audit event with reason and increment throttle (depends on T061, T062)
- [X] T064 [P] [US2] Create `backend/src/auth/middleware/require-session.ts` — extracts `auth_session` cookie, calls `SessionService.validate`, attaches `req.session` and `req.user`; emits 401 via `AuthError`
- [X] T065 [P] [US2] Create `backend/src/auth/middleware/csrf.ts` — double-submit-cookie verification on POST/PUT/PATCH/DELETE; binds to `session.csrfSecret`
- [X] T066 [P] [US2] Create `backend/src/auth/middleware/rate-limit.ts` — wires `express-rate-limit` to the throttle service for the login endpoint
- [X] T067 [US2] Create `backend/src/auth/handlers/login.handler.ts` and `backend/src/auth/handlers/session.handler.ts` (`GET /auth/session`); set both `auth_session` (HttpOnly, Secure, SameSite=Lax, Max-Age=86400) and `csrf_token` cookies on login response
- [X] T068 [US2] Create `backend/src/auth/routes/login.route.ts` and a `session.route.ts` mounting `GET /auth/session` behind `requireSession`; register on auth router
- [X] T069 [US2] Wire US2 dependencies into `backend/src/auth/index.ts` composition root
- [X] T070 [US2] Run all US1 + US2 tests; confirm green; coverage on `services/{login,session,throttle}.service.ts` ≥ 80 %

**Checkpoint**: MVP complete — Stories 1 and 2 deliver the minimum viable feature.

---

## Phase 5: User Story 3 — Password reset (Priority: P2)

**Goal**: A user with a forgotten password can request a single-use, time-limited reset link and set a new password; this also revokes existing sessions and (per spec edge case) verifies a pending account.

**Independent Test**: Run `tests/e2e/us3-password-reset.e2e.spec.ts`: register+verify a user, log in (Story 2) → session cookie A; POST `/auth/password-reset/request` → 202 + email captured; POST `/auth/password-reset/confirm` with new password → 204; cookie A → 401 on `/auth/session`; login with new password → 200; old password → 401.

### Tests for User Story 3 ⚠️ Write FIRST, ensure they FAIL

- [X] T071 [P] [US3] Contract tests for `POST /auth/password-reset/request` (always 202) and `POST /auth/password-reset/confirm` (204/400/410) in `backend/tests/integration/us3/reset.contract.spec.ts`
- [X] T072 [P] [US3] Unit test for `PasswordResetService.request`: known + unknown email both produce identical 202 response and indistinguishable timing within 100 ms; only known email triggers `EmailPort.sendPasswordReset` (FR-014, SC-006) — `backend/tests/unit/us3/reset-request.service.spec.ts`
- [X] T073 [P] [US3] Unit test for `PasswordResetService.confirm`: success path updates password hash + revokes all sessions + invalidates token + (if pending) flips user to active; expired token → 410; reused token → 410; weak new password → 400 — `backend/tests/unit/us3/reset-confirm.service.spec.ts`
- [X] T074 [P] [US3] Integration test for `password_resets` repo (insert, find by hash, mark used) in `backend/tests/integration/us3/reset-repo.spec.ts`
- [X] T075 [P] [US3] E2E test covering Story 3 acceptance scenarios 1–4 in `backend/tests/e2e/us3-password-reset.e2e.spec.ts`
- [X] T076 [US3] Run new tests; confirm they all FAIL

### Implementation for User Story 3

- [X] T077 [P] [US3] Create migration `backend/migrations/004-password-reset.sql` per `data-model.md`
- [X] T078 [P] [US3] Add `password_resets` to `DB` type interface
- [X] T079 [P] [US3] Create `backend/src/auth/schemas/reset.schema.ts` — Zod schemas for `EmailOnlyRequest` (reuses) and `PasswordResetConfirmRequest`
- [X] T080 [US3] Create `backend/src/auth/repositories/reset.repo.ts` — `insertToken`, `findByTokenHash`, `markUsed`, `invalidateAllForUser`
- [X] T081 [US3] Create `backend/src/auth/services/password-reset.service.ts` — `request(email)`: always returns generic acceptance, only sends email when account exists; `confirm(token, newPassword)` is a single transaction that updates `users.password_hash`, calls `SessionService.revokeAllForUser(reason='password_reset')`, marks token used, and (if user is pending) sets `verified_at` + flips status to `active`; emits `password_reset_request` and `password_reset_complete` audit events (FR-013…017, FR-006c)
- [X] T082 [US3] Create `backend/src/auth/handlers/password-reset.handler.ts` (request + confirm) and `backend/src/auth/routes/password-reset.route.ts` with per-IP and per-email rate limits (5 req / 15 min)
- [X] T083 [US3] Wire US3 dependencies into the composition root
- [X] T084 [US3] Run all US1+US2+US3 tests; confirm green; coverage gate still ≥ 80 % on services/domain

**Checkpoint**: Story 3 fully functional independently of Story 4.

---

## Phase 6: User Story 4 — Session expiry & logout (Priority: P2)

**Goal**: Sessions expire automatically 24 hours after issuance; explicit logout invalidates the current session immediately; multiple concurrent sessions remain independent.

**Independent Test**: Run `tests/e2e/us4-session-expiry.e2e.spec.ts`: log in to obtain session A; with `FakeClock` advance 23 h 59 m → `GET /auth/session` 200; advance to 24 h 1 m → 401; log in again to obtain session B; logout B with valid CSRF → 204; B → 401; meanwhile a parallel session C remains live until its own expiry/logout.

### Tests for User Story 4 ⚠️ Write FIRST, ensure they FAIL

- [X] T085 [P] [US4] Contract test for `POST /auth/logout` (204/401, requires CSRF) in `backend/tests/integration/us4/logout.contract.spec.ts`
- [X] T086 [P] [US4] Unit test for session-expiry behaviour using `FakeClock`: live within 24 h, expired at 24 h 0 m + 61 s, accepted at 24 h 0 m + 30 s (within leeway), in `backend/tests/unit/us4/session-expiry.spec.ts`
- [X] T087 [P] [US4] Unit test for `LogoutService` (revokes only the calling session, leaves siblings live, clears cookies on response) in `backend/tests/unit/us4/logout.service.spec.ts`
- [X] T088 [P] [US4] Integration test for `purgeExpired` and concurrent multi-session behaviour in `backend/tests/integration/us4/sessions-multi.spec.ts`
- [X] T089 [P] [US4] E2E test covering Story 4 acceptance scenarios 1–4 in `backend/tests/e2e/us4-session-expiry.e2e.spec.ts`
- [X] T090 [US4] Run new tests; confirm they FAIL

### Implementation for User Story 4

- [X] T091 [P] [US4] Create `backend/src/auth/services/logout.service.ts` — revokes the session id on `req.session` with reason `'logout'`, emits `logout` audit event
- [X] T092 [P] [US4] Create `backend/src/auth/handlers/logout.handler.ts` — invokes `LogoutService.logout`, clears `auth_session` and `csrf_token` cookies on the response (Set-Cookie expired)
- [X] T093 [US4] Create `backend/src/auth/routes/logout.route.ts` mounted behind `requireSession` + `csrf` middleware
- [X] T094 [US4] Extend `SessionService.validate` to use the injected `Clock` for the 24 h + 60 s leeway boundary check (already covered by T062; add explicit unit coverage if missing)
- [X] T095 [US4] Wire US4 dependencies into the composition root
- [X] T096 [US4] Run all US1–US4 tests; confirm green; coverage gate still ≥ 80 %

**Checkpoint**: All four user stories pass independently and together.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Account-deletion (FR-025…028 from clarification Q5), retention job (FR-023a, FR-027, SC-010), audit-event repository, security hardening, and final docs/quickstart validation.

- [X] T097 [P] Create migration `backend/migrations/005-security-events.sql` per `data-model.md`: enums + table + indexes
- [X] T098 [P] Add `security_events` to the `DB` type interface
- [X] T099 [P] Create `backend/src/auth/repositories/audit.repo.ts` — `insertEvent(eventType, userId?, ip, outcome, reasonCode?, metadata?)`, `purgeOlderThan(date)`; refactor existing services to use this repo (replaces inline `pino`-only audit calls; logs continue via pino)
- [X] T100 Create `backend/src/auth/services/account-deletion.service.ts` — single transaction: mark user `disabled` + `deleted_at = now()`, call `SessionService.revokeAllForUser(reason='account_deleted')`, invalidate all unused verification + reset tokens, write `account_delete` audit event (FR-025, FR-026)
- [X] T101 Create `backend/src/auth/handlers/account.handler.ts` (`DELETE /auth/account`) and `backend/src/auth/routes/account.route.ts` mounted behind `requireSession` + `csrf`
- [X] T102 [P] Create `backend/src/infra/jobs/retention.job.ts` — daily idempotent job that (a) anonymizes `users` rows with `deleted_at < now() - 30d AND anonymized_at IS NULL` (clear `email`, `password_hash`, set `anonymized_at`), (b) deletes `security_events` rows with `occurred_at < now() - 12 months`, (c) `sessions.purgeExpired()` housekeeping; scheduled via `node-cron` (research D13)
- [X] T103 [P] [Test] Unit test for `AccountDeletionService` and `retention.job` (covers 30-day anonymization boundary, 12-month purge, idempotency) in `backend/tests/unit/polish/retention.spec.ts` and integration test in `backend/tests/integration/polish/retention.repo.spec.ts`
- [X] T104 [P] [Test] E2E test for `DELETE /auth/account` in `backend/tests/e2e/account-delete.e2e.spec.ts` — covers SC-010 (sessions revoked before response returns)
- [X] T105 [P] Add a "no plaintext secrets in logs" automated test in `backend/tests/unit/polish/no-plaintext-secrets.spec.ts` that runs every audit/login/error path against a captured pino transport and asserts redaction (SC-005)
- [X] T106 [P] Add a timing-parity test in `backend/tests/integration/polish/enumeration-parity.spec.ts` that issues 50 register-with-existing-email + 50 register-with-fresh-email + 50 login-unknown + 50 login-wrong-password and asserts the p95 deltas stay within ±100 ms (SC-006)
- [X] T107 [P] Run `npm run lint` and `npm run format` across the codebase; resolve any violations (Constitution I)
- [X] T108 [P] Verify every exported symbol in `backend/src/auth/**` carries a JSDoc block with `@param`/`@returns`/`@throws` as applicable (Constitution IV) — `eslint-plugin-jsdoc` already enforces, but do a manual audit pass on services and ports
- [X] T109 Run `npm run test:cov`; confirm `src/auth/services/**` and `src/auth/domain/**` are at ≥ 80 % line and branch coverage; investigate any gaps
- [X] T110 Execute the full quickstart walkthrough (`specs/001-user-auth/quickstart.md`) end-to-end against a fresh `docker compose up`; tick the four "Constitution-aligned acceptance criteria" boxes there
- [X] T111 Run `npx tsc --noEmit` from `backend/`; confirm zero errors with strict mode
- [X] T112 [P] Author `backend/tests/load/auth-endpoints.load.ts` using `autocannon` (or `k6`) to drive `POST /auth/register`, `POST /auth/login`, and `GET /auth/session` against a local `npm run dev` instance; assert SC-009 thresholds (sustained ≥ 100 req/s with p95 latency < 500 ms). Add an `npm run test:load` script and a CI job that runs the load test as a smoke gate (10 s ramp, 60 s steady) so SC-009 is enforced rather than only documented.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Requires Phase 1 — BLOCKS Phases 3–7
- **US1 (Phase 3)**: Requires Phase 2 — independent of US2/US3/US4
- **US2 (Phase 4)**: Requires Phase 2 — soft dependency on US1 only for E2E test fixtures (helpers can stub registration if needed; otherwise sequence US1 → US2 in a 1-developer flow)
- **US3 (Phase 5)**: Requires Phase 2 + US1 (needs verified accounts) — independent of US2/US4
- **US4 (Phase 6)**: Requires Phase 2 + US2 (needs login to issue sessions) — independent of US3
- **Polish (Phase 7)**: Requires US1–US4

### Within Each User Story

1. Tests are authored FIRST (Constitution III — TDD recommended; bug-fix tasks would always require failing test first)
2. Migrations + types → repositories → services → handlers/middleware → routes → composition root
3. Tests must turn green before the phase checkpoint is signed off
4. Coverage gate (≥ 80 %) must hold at the close of every phase

### Parallel Opportunities

- All Phase-1 tasks marked `[P]` (T003–T009) can run in parallel after T001–T002
- Phase-2 tasks T011, T014–T017, T019–T022 are `[P]` — author in parallel
- Within each user story, every test task and every domain/schema/migration task marked `[P]` can run in parallel; service/handler/route tasks are sequenced because they share the composition root file
- After Phase 2 completes, **US1, US2, US3, US4 can be staffed in parallel by different developers** (with US3 stubbing a pre-verified user fixture and US4 stubbing a pre-issued session fixture until US1/US2 land)

### MVP scope

- **Minimum viable product = US1 + US2** (Stories 1 and 2 are both P1). Shipping just these gives a usable auth system: users can register, verify, log in, and access protected endpoints with a 24 h cookie session. US3 (reset) and US4 (expiry/logout polish) are P2 hardening that follow.

---

## Parallel Example: User Story 1

```bash
# After Phase 2 checkpoint — author all US1 tests in parallel
npx jest --listFailingTests \
  backend/tests/integration/us1/register.contract.spec.ts \
  backend/tests/integration/us1/verify.contract.spec.ts \
  backend/tests/unit/us1/password-policy.spec.ts \
  backend/tests/unit/us1/registration.service.spec.ts \
  backend/tests/unit/us1/verification.service.spec.ts \
  backend/tests/integration/us1/users-repo.spec.ts \
  backend/tests/e2e/us1-register-verify.e2e.spec.ts
# Expect: all FAIL (green ratchet not yet armed) — proceed to implementation tasks T031–T046
```

---

## Format-validation note

All 111 tasks above follow the strict checklist format `- [ ] T### [P?] [Story?] description with file path`:

- Setup, Foundational, and Polish phases use no `[Story]` tag.
- US1 / US2 / US3 / US4 phases tag every task with the matching story label.
- `[P]` is applied only when the task touches a different file with no incomplete dependency.
- Every implementation task names an exact file path under `backend/`.
