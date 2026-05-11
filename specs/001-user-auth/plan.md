# Implementation Plan: User Authentication System

**Branch**: `001-user-auth` | **Date**: 2026-05-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-user-auth/spec.md`

## Summary

Deliver a self-contained authentication module exposing HTTP endpoints for
registration, email verification, login, logout, password reset, account
deletion, and a session-validation middleware. Accounts are stored in
PostgreSQL with bcrypt-hashed passwords; sessions are persisted server-side
(authoritative for revocation) and referenced by an `HttpOnly` JWT cookie that
every protected request validates against the session row. Email-verification
and password-reset flows use single-use, time-limited tokens delivered via a
pluggable transactional-email port. Throttling, audit logging, and a 30-day
PII-anonymization retention job round out the feature.

## Technical Context

**Language/Version**: TypeScript 5.4 on Node.js 20 LTS  
**Primary Dependencies**: Express.js 4.x, `pg` (node-postgres) with `kysely`
query builder for typed SQL, `jsonwebtoken` (JWT signing/verification),
`bcrypt` (password hashing, cost factor 12), `cookie-parser`, `helmet`,
`express-rate-limit` (in-memory MVP; pluggable for Redis later), `zod`
(input validation), `pino` (structured JSON logging), `nodemailer` behind a
thin port interface (provider-agnostic for v1)  
**Storage**: PostgreSQL 16 (managed or self-hosted); migrations via
`node-pg-migrate`  
**Testing**: Jest 29 with `ts-jest`; `supertest` for HTTP integration tests;
`testcontainers` for ephemeral PostgreSQL in integration tests; coverage
collected via Jest's built-in V8 reporter  
**Target Platform**: Linux server (containerized; Node 20 LTS)  
**Project Type**: Web service (single backend; no frontend in this feature)  
**Performance Goals**: ≥ 100 req/s on auth endpoints with p95 < 500 ms
(SC-009); login p95 < 5 s end-to-end (SC-002)  
**Constraints**: All traffic over TLS (FR-024); zero plaintext passwords or
full tokens in any persistent surface (SC-005); response timing for
enumeration-probe parity within ±100 ms p95 (SC-006); 24-hour absolute session
expiry (FR-018); reset link 30 min, verification link 24 h  
**Scale/Scope**: Initial target ~10 k registered users, ~1 k DAU; feature
ships ~28 functional requirements, 5 entities (User, Session,
PasswordResetRequest, EmailVerificationRequest, SecurityEvent), ~10 HTTP
endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Principles evaluated against
[`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)
v1.0.0:

| # | Principle | Plan compliance |
|---|---|---|
| I | Clean Code (NON-NEGOTIABLE) | **PASS** — Layered architecture (routes → handlers → services → repositories) keeps functions small and single-purpose. ESLint (`@typescript-eslint/strict` + `eslint-plugin-jsdoc`) and Prettier are wired into CI. No abbreviations, no dead code policy enforced by lint and review. |
| II | TypeScript Strict Mode (NON-NEGOTIABLE) | **PASS** — `tsconfig.json` enables `strict`, `noImplicitOverride`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`. No `any`; trust boundaries (HTTP body, env, DB rows) use `unknown` narrowed by `zod` schemas and Kysely's typed result rows. |
| III | Testing Pyramid + 80% business-logic coverage (NON-NEGOTIABLE) | **PASS** — Pyramid: unit tests for services / token helpers / validators (deterministic, no I/O), integration tests against a `testcontainers` Postgres for repositories and HTTP routes, a thin slice of E2E happy-paths. Jest coverage gate fails CI when business-logic modules drop below 80% line and branch. Generated migrations and DTOs are excluded by glob. |
| IV | JSDoc Documentation Mandate | **PASS** — Every exported symbol carries a JSDoc block; `eslint-plugin-jsdoc` enforces presence, `@param`/`@returns`, and signature drift. PR reviewers verify intent (contract, invariants, side effects). |

**Additional Constraints**: Dependency footprint is small and well-known; all
listed packages are widely maintained. Security posture aligns with OWASP Top
10 by design (parameterized SQL via Kysely, bcrypt hashing, helmet headers,
HttpOnly+Secure+SameSite cookie, CSRF tokens on state-changing endpoints).

**Initial Constitution Check: PASS — no violations, Complexity Tracking
section intentionally empty.**

## Project Structure

### Documentation (this feature)

```text
specs/001-user-auth/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── auth-api.openapi.yaml
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Created by /speckit.tasks
```

### Source Code (repository root)

Single backend service. The feature lives under `backend/src/auth/` with
shared infrastructure in `backend/src/infra/` and DB migrations at the
backend root.

```text
backend/
├── src/
│   ├── auth/
│   │   ├── routes/                # Express routers (HTTP layer)
│   │   │   ├── register.route.ts
│   │   │   ├── verify.route.ts
│   │   │   ├── login.route.ts
│   │   │   ├── logout.route.ts
│   │   │   ├── password-reset.route.ts
│   │   │   └── account.route.ts
│   │   ├── handlers/              # Request → service adapter (parsing, status mapping)
│   │   ├── services/              # Business logic — primary 80% coverage target
│   │   │   ├── registration.service.ts
│   │   │   ├── verification.service.ts
│   │   │   ├── login.service.ts
│   │   │   ├── session.service.ts
│   │   │   ├── password-reset.service.ts
│   │   │   ├── account-deletion.service.ts
│   │   │   └── throttle.service.ts
│   │   ├── repositories/          # Data access (Kysely queries)
│   │   │   ├── users.repo.ts
│   │   │   ├── sessions.repo.ts
│   │   │   ├── verification.repo.ts
│   │   │   ├── reset.repo.ts
│   │   │   └── audit.repo.ts
│   │   ├── domain/                # Pure types & invariants (no I/O)
│   │   │   ├── user.ts
│   │   │   ├── session.ts
│   │   │   ├── token.ts
│   │   │   └── errors.ts
│   │   ├── middleware/
│   │   │   ├── require-session.ts
│   │   │   ├── csrf.ts
│   │   │   └── rate-limit.ts
│   │   ├── adapters/              # Outbound ports
│   │   │   ├── email.port.ts
│   │   │   ├── nodemailer.adapter.ts
│   │   │   └── clock.port.ts
│   │   ├── schemas/               # zod request/response schemas
│   │   └── index.ts               # Composition root for the feature
│   ├── infra/
│   │   ├── db.ts                  # Kysely instance, pool config
│   │   ├── logger.ts              # pino instance
│   │   ├── config.ts              # env parsing (zod-validated)
│   │   └── jobs/
│   │       └── retention.job.ts   # 30-day PII anonymization + 12-month audit purge
│   └── server.ts                  # Express app composition
├── migrations/
│   ├── 001-users.sql
│   ├── 002-sessions.sql
│   ├── 003-email-verification.sql
│   ├── 004-password-reset.sql
│   └── 005-security-events.sql
├── tests/
│   ├── unit/                      # Service & domain tests (no I/O)
│   ├── integration/               # Repos + routes against testcontainers Postgres
│   └── e2e/                       # End-to-end happy paths via supertest
├── jest.config.ts
├── tsconfig.json
├── .eslintrc.cjs
└── package.json
```

**Structure Decision**: Single Node.js/Express backend service rooted at
`backend/`. Front-end work is out of scope for this feature; consuming clients
talk to the documented HTTP API. The auth module is internally layered
(routes → handlers → services → repositories) with outbound ports (email,
clock) so the high-value services layer is fully unit-testable without I/O —
this is the layer that must hit the 80% business-logic coverage gate
(Constitution III).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

*No violations. Section intentionally empty.*
