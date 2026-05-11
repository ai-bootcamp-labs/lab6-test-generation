# Phase 0 — Research & Decisions: User Authentication System

**Feature**: 001-user-auth · **Date**: 2026-05-10 · **Spec**: [spec.md](spec.md)

This document consolidates the technical decisions that flow from the
feature spec, the user's stack mandate (Express.js + TypeScript, PostgreSQL,
bcrypt, JWT, Jest), and best-practice research for each choice.

There are **no `NEEDS CLARIFICATION` markers in the spec**; all clarifications
were resolved in the spec's Clarifications section (2026-05-10). The decisions
below either confirm the user-mandated stack or fill in the remaining
"how-to" choices that the spec deliberately left implementation-defined.

---

## D1. Application framework: Express.js 4.x

- **Decision**: Use Express 4.x as the HTTP framework, mounted as a single
  app composed in `backend/src/server.ts`.
- **Rationale**: User-mandated. Express is the canonical, low-magic Node HTTP
  framework with first-class TypeScript support via `@types/express`. Its
  middleware model maps cleanly onto the layered design: helmet → cookie
  parser → CSRF → rate-limit → router → error mapper.
- **Alternatives considered**:
  - Fastify (faster, schema-first) — rejected: not requested, and the
    performance budget (≥ 100 req/s, p95 < 500 ms) is far from Express's
    ceiling for this workload.
  - NestJS — rejected: heavier abstractions conflict with Constitution I
    ("avoid over-engineering"); would impose decorators/DI not needed at this
    scale.

## D2. Language & strict TypeScript configuration

- **Decision**: TypeScript 5.4 on Node 20 LTS, with `tsconfig.json` enabling
  `strict`, `noImplicitOverride`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`.
- **Rationale**: Constitution Principle II (NON-NEGOTIABLE) mandates strict
  mode and the four extra flags. Node 20 LTS is supported through April 2026
  and aligns with `@types/node` 20.x.
- **Alternatives considered**:
  - Plain JavaScript — rejected: violates Principle II.
  - Looser strictness — rejected: explicitly forbidden by the Constitution.

## D3. Persistence: PostgreSQL 16 + Kysely query builder

- **Decision**: PostgreSQL 16 as the data store; queries built with
  [Kysely](https://kysely.dev) (typed SQL builder) over `pg` driver pool;
  schema migrations managed by `node-pg-migrate`.
- **Rationale**: Postgres is user-mandated. Kysely chosen over a full ORM
  because it preserves SQL fidelity (CTEs, partial indexes, `RETURNING`,
  upserts) while providing TypeScript types from the schema definition —
  satisfying Principle II (no `any` at the data boundary) without imposing
  ORM-style "magic" (Principle I, simplicity).
- **Alternatives considered**:
  - Prisma — rejected: opinionated migration model, generated client adds a
    build step; we do not need its higher-level abstractions for five
    tables.
  - TypeORM / Sequelize — rejected: weaker type ergonomics; decorator-heavy.
  - Raw `pg` with hand-rolled SQL — rejected: forces hand-typed result rows
    which is error-prone and violates DRY in five-table CRUD code.

## D4. Password hashing: bcrypt, cost factor 12

- **Decision**: `bcrypt` with cost factor 12 for password hashing.
- **Rationale**: User-mandated algorithm. Cost factor 12 is the prevailing
  2026 recommendation (~250 ms per hash on commodity server CPUs) — strong
  enough to meaningfully resist offline attack while keeping login p95 under
  the 500 ms target (D6 throttling absorbs spike risk). Bcrypt's per-hash
  salt is built in (FR-005). The `bcrypt` npm package wraps the C
  implementation and is widely audited.
- **Alternatives considered**:
  - Argon2id — rejected only because user mandated bcrypt; would otherwise
    be the modern preference.
  - PBKDF2 — rejected: weaker GPU resistance than bcrypt at equivalent CPU
    cost.

## D5. Token format: JWT (HS256), opaque session reference inside

- **Decision**: JWT in `HttpOnly` + `Secure` + `SameSite=Lax` cookie, signed
  HS256 with a server-side secret rotated out-of-band. Payload carries only
  `sub` (user id), `sid` (opaque session id), `iat`, and `exp`. Server-side
  session row is authoritative for revocation/expiry (FR-022a, Clarification
  Q2).
- **Rationale**: User mandated JWT. Clarification Q2 mandated server-side
  validation; this decision honours both by using JWT only as a signed
  envelope around an opaque session reference. HS256 is sufficient — the
  same process signs and verifies; no need for asymmetric keys until
  multi-service verification appears.
- **Alternatives considered**:
  - Stateless JWT (no DB lookup) — rejected by Clarification Q2 because it
    cannot honour FR-011 / FR-017 / FR-021 truthfully.
  - RS256 — rejected: adds keypair management with no current verifier
    outside this service.
  - Opaque random session id only (no JWT) — rejected: user mandated JWT.

## D6. Throttling: `express-rate-limit` with two independent counters

- **Decision**: Use `express-rate-limit` with `rate-limit-postgresql` (or an
  in-memory store for the MVP) to implement two independent counters per
  Clarification Q3: 5 fails/account/5 min → 15-min account lockout, and
  20 fails/IP/5 min → 15-min IP throttle. A successful login resets the
  account counter.
- **Rationale**: Off-the-shelf middleware backed by Postgres meets the spec
  exactly without requiring Redis in v1. Constitution I favours simple,
  vetted dependencies.
- **Alternatives considered**:
  - Redis-backed (`rate-limiter-flexible`) — rejected for v1: introduces a
    new dependency. Designed in: the throttle service interface (port) lets
    us swap stores without changing call sites.
  - Hand-rolled SQL counters — rejected: reinvents a solved problem.

## D7. Email transport: nodemailer behind a thin port

- **Decision**: Define an `EmailPort` interface (`sendVerification`,
  `sendPasswordReset`); production adapter wraps `nodemailer` configured
  via SMTP env vars. Test adapter records sent messages in memory.
- **Rationale**: Spec assumption: outbound transactional email is a
  prerequisite, not part of this feature. The port keeps the auth services
  free of provider details (Principle I) and fully unit-testable without
  I/O (Principle III).
- **Alternatives considered**:
  - Direct SendGrid/SES SDK — rejected: couples services to a specific
    provider.
  - No abstraction — rejected: would force integration tests to hit the real
    SMTP server.

## D8. Input validation: zod at the HTTP boundary

- **Decision**: Validate all request bodies, query params, and parsed
  cookies/headers with `zod` schemas at the route boundary; pass already-typed
  domain values into services.
- **Rationale**: Implements Principle II's "validate at boundaries only"
  guidance; the resulting parsed object's TypeScript type is exact
  (`z.infer<typeof Schema>`). Replaces ad-hoc `if`/`throw` checks.
- **Alternatives considered**:
  - `joi` — rejected: weaker TS inference.
  - Hand-written guards — rejected: duplicative and error-prone.

## D9. Logging: pino, JSON, redaction

- **Decision**: `pino` for structured JSON logs, with redaction paths set on
  `password`, `passwordHash`, `token`, `cookie.session`, `headers.cookie`.
  Standard log fields: `time`, `level`, `event`, `userId?`, `sessionId?`,
  `ip`, `outcome`, `reasonCode`.
- **Rationale**: SC-005 requires zero plaintext passwords/full tokens in
  logs; pino redaction is declarative and tested. Constitution "Additional
  Constraints" requires structured logging.
- **Alternatives considered**:
  - `winston` — rejected: heavier API, slower, redaction is bolt-on.
  - `console.log` — rejected: not structured.

## D10. Testing: Jest 29 + ts-jest + supertest + testcontainers

- **Decision**: Jest 29 with `ts-jest` transformer; `supertest` for HTTP
  integration tests; `testcontainers` to spin up an ephemeral Postgres for
  repository and route integration tests; coverage thresholds enforced by
  Jest config (line and branch ≥ 80%) on the
  `backend/src/auth/{services,domain}/**` glob.
- **Rationale**: User mandated Jest. `ts-jest` keeps a single TS toolchain.
  `testcontainers` gives real-Postgres fidelity without a developer-managed
  database. The targeted coverage glob exempts boilerplate (routes are
  thin, repositories are exercised via integration, schemas are generated
  from zod) per the Constitution's "trivial code MAY be excluded" allowance.
- **Alternatives considered**:
  - Vitest — rejected: not requested.
  - In-memory SQLite — rejected: dialect drift vs. Postgres invalidates
    constraint and concurrency assumptions.

## D11. CSRF protection

- **Decision**: Double-submit-cookie pattern: server issues a non-HttpOnly
  CSRF cookie alongside the auth cookie at login time; clients echo it in an
  `X-CSRF-Token` header on state-changing requests; middleware verifies the
  header equals the cookie and is bound to the session id.
- **Rationale**: Clarification Q4 requires CSRF protection on top of the
  cookie. Double-submit is stateless, performs well, and integrates cleanly
  with the existing session middleware.
- **Alternatives considered**:
  - Synchronizer-token pattern — rejected: requires server-side per-request
    token store; the session-bound double-submit is sufficient given
    `SameSite=Lax`.
  - `csurf` package — rejected: deprecated in 2022.

## D12. Session expiry & clock-skew leeway

- **Decision**: Sessions expire 24 hours after `issued_at`; verification
  tolerates ≤ 60 s clock skew (subtracted from server now when comparing
  against `expires_at`). Verification links: 24 h. Reset links: 30 min.
  All bounds enforced server-side from the `expires_at` columns, not from
  the JWT `exp`.
- **Rationale**: Spec edge case explicitly permits ≤ 60 s leeway and forbids
  acceptance beyond 24 h + leeway. Server-side authoritative expiry honours
  D5 / Clarification Q2.

## D13. Account-deletion retention job

- **Decision**: A scheduled job (`infra/jobs/retention.job.ts`) runs daily
  to (a) anonymize PII for accounts whose `deleted_at` is older than 30 days
  and `anonymized_at IS NULL`, and (b) delete `security_events` rows older
  than 12 months. Triggered via cron (out-of-band) or `node-cron` if running
  in-process.
- **Rationale**: Implements FR-027, FR-023a, SC-010. Idempotent — safe to
  re-run.
- **Alternatives considered**:
  - Synchronous deletion — rejected: spec allows up to 30 days for PII
    anonymization, and immediate deletion would lose the soft-delete window
    that protects against accidental deletion.

## D14. Module boundary & DI wiring

- **Decision**: A single composition function in `backend/src/auth/index.ts`
  builds the dependency graph (repos depend on Kysely instance, services
  depend on repos + ports, routes depend on services) and returns an
  Express router. The server file mounts the router and provides the
  outbound ports (Kysely instance, email adapter, clock).
- **Rationale**: Plain function-style DI keeps the feature self-contained
  (Principle I), trivially testable (handed mocks during unit tests), and
  free of framework-specific DI containers.

---

## Summary

All NEEDS-CLARIFICATION items are resolved. The user's stack mandate is
honoured verbatim; the 14 decisions above fill in the remaining
implementation-level questions consistent with the Constitution and the
clarified spec. Phase 1 may proceed.
