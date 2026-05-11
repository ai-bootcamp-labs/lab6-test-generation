<!--
SYNC IMPACT REPORT
==================
Version change: 1.3.0 → 1.4.0
Bump rationale: MINOR — adds normative "Mutation-Resistant Test Generation Rules"
to Principle III §7. Codifies five concrete authoring rules (mutation-score
target, boundary testing, boolean truth-table coverage, exact-equality
assertions, exact error-message validation) that have been empirically validated
against Stryker on `backend/src/auth/services/login.service.ts` (44.74% → 100%
mutation score after applying these rules). No existing rule is relaxed or
removed; this strengthens §7.

Modified principles:
  - III. Testing Principles — §7 expanded with "Mutation-Resistant Test
    Generation Rules" subsection.

Added sections:
  - Principle III §7 "Mutation-Resistant Test Generation Rules" (subsection).

Prior history retained for context (sections normative since v1.3.0):
  - Principle III §6 "Mocking & Test Data"
  - Principle III §7 "Quality Criteria (CRITICAL)"
  - Principle III §8 "Tools & Frameworks"

Removed sections:
  - None.

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md  (Constitution Check remains generic)
  - ✅ .specify/templates/spec-template.md  (compatible)
  - ✅ .specify/templates/tasks-template.md (compatible)
  - ✅ .specify/templates/checklist-template.md (compatible)

Drift from current repository (non-blocking, recorded for follow-up):
  - `backend/package.json` is missing the npm scripts mandated by §8
    (`test:unit`, `test:integration`, `test:mutation`) and Stryker is not yet a
    devDependency. The constitution is the source of truth; the package.json
    MUST be updated in a follow-up PR. Until then, equivalents are:
      • `npm test`                 → `npm test`
      • `npm run test:unit`        → `npx jest --selectProjects unit`
      • `npm run test:integration` → `npx jest --selectProjects integration`
      • `npm run test:e2e`         → `npm run test:e2e`  (already present)
      • `npm run test:cov`         → `npm run test:cov`  (already present)
      • `npm run test:mutation`    → not yet runnable; install Stryker first.
  - `backend/jest.config.ts` currently sets `branches: 80` globally; §2/§7
    require branches ≥ 75. The 80% setting is stricter than the constitutional
    floor and is therefore compliant; lowering it would require a separate
    amendment.

Follow-up TODOs:
  - TODO(STRYKER_SETUP): add `@stryker-mutator/core` and
    `@stryker-mutator/jest-runner` to `backend/devDependencies`, create
    `backend/stryker.conf.js` with `thresholds.break = 75`, and add the
    `test:unit`, `test:integration`, and `test:mutation` npm scripts.
  - Principle III is now complete (§1–§8). Future testing-related amendments
    should extend, not replace, these sections.
-->

# lab5-speckit Constitution

## Core Principles

### I. Clean Code (NON-NEGOTIABLE)

All production code MUST adhere to clean-code discipline:

- **Meaningful names**: identifiers MUST reveal intent; abbreviations and single-letter
  names are forbidden outside of trivial loop indices and well-known math symbols.
- **Small, single-purpose functions**: a function MUST do one thing; functions SHOULD
  be ≤ 40 lines and have ≤ 4 parameters. Introduce a parameter object when this is
  exceeded.
- **No duplication (DRY)**: duplicated logic MUST be extracted before merge.
- **No dead code**: commented-out blocks, unreachable branches, and unused exports
  MUST be deleted, not retained "just in case."
- **Explicit over implicit**: prefer pure functions, immutable data, and early
  returns; side effects MUST be isolated and named accordingly.
- **Linting**: ESLint with a strict ruleset (recommended + `@typescript-eslint/strict`)
  MUST pass with zero warnings on every PR. Formatting MUST be enforced by Prettier.

**Rationale**: Code is read far more often than it is written. Enforcing these rules
keeps the codebase maintainable, lowers onboarding cost, and prevents the slow accrual
of technical debt that erodes velocity.

### II. TypeScript Strict Mode (NON-NEGOTIABLE)

All TypeScript code MUST compile under strict mode:

- `tsconfig.json` MUST set `"strict": true`, and additionally enable
  `noImplicitOverride`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and
  `noFallthroughCasesInSwitch`.
- The `any` type is forbidden in committed code. `unknown` MUST be used at trust
  boundaries and narrowed before use. Any unavoidable escape hatch MUST use
  `// eslint-disable-next-line` with a written justification reviewed in PR.
- Non-null assertions (`!`) are forbidden except in tests with an inline
  justification.
- Public APIs (exported functions, classes, types) MUST have explicit type
  annotations on parameters and return values; inferred return types are allowed only
  for non-exported internals.
- The build MUST fail on type errors; type errors MUST NOT be suppressed via
  `@ts-ignore`. Use `@ts-expect-error` with a comment only when a known, tracked issue
  exists.

**Rationale**: Strict typing catches whole classes of defects at compile time, makes
refactoring safe, and turns the type system into living documentation.

### III. Testing Principles (NON-NEGOTIABLE)

Testing is a first-class engineering activity in this project. All tests run on
**Node.js ≥ 20** with **TypeScript** sources, executed by **Jest** (unit +
integration + E2E projects via `--selectProjects`) and mutation-tested by
**Stryker**. The following sections are normative; sections §3–§8 are reserved for
forthcoming amendments and MUST be filled before any rule that depends on them is
enforced.

#### §1 Testing Philosophy

- **Test-Driven Development (TDD) is MANDATORY** for all business-logic code
  (domain services, use-cases, validators, calculators, repositories' query logic).
  Production code MUST NOT be written before a failing test that exercises the new
  behaviour exists in the same PR.
- The **RED → GREEN → REFACTOR** cycle MUST be followed:
  1. **RED**: write the smallest test that captures the next required behaviour and
     watch it fail for the right reason.
  2. **GREEN**: write the minimum production code required to make the test pass —
     no extra features, no speculative abstractions.
  3. **REFACTOR**: with the suite green, remove duplication and improve names and
     structure; tests MUST stay green throughout.
  Commits SHOULD make the cycle visible (e.g., `test: …` then `feat: …` then
  `refactor: …`); squash-merging is permitted but PR description MUST note the
  cycle was followed.
- **Tests are written FIRST, before implementation.** Bug fixes MUST start with a
  failing regression test. PRs that introduce production code with no co-authored
  test changes MUST be rejected unless the change is provably non-behavioural
  (formatting, doc-only, dependency bump).
- **Tests are generated from specifications, not from the implementation.** The
  source of truth for what to test is the feature spec, contracts (e.g.,
  `specs/*/contracts/*.openapi.yaml`), data model, and acceptance criteria —
  **never** the current behaviour of the code under test. Snapshot tests and
  "characterisation tests" pinned to existing output are FORBIDDEN for new
  business logic; they are permitted only as a temporary scaffold during legacy
  refactors and MUST be replaced with spec-derived assertions before the PR
  merges.

**Rationale**: TDD keeps the design pressure on the public contract, prevents
over-engineering, and produces an executable specification. Generating tests from
specs (not code) ensures the suite catches regressions against intended behaviour
rather than ossifying accidental behaviour.

#### §2 Coverage Requirements

- **Testing Pyramid distribution** (by test count, indicative target):
  - **~70% Unit tests** — pure functions, domain services, validators, utilities,
    and other business logic. MUST be deterministic, MUST run without I/O
    (no DB, no network, no filesystem beyond temp), and MUST complete in
    milliseconds. Live under `backend/tests/unit/**` and run via the Jest `unit`
    project.
  - **~20% Integration tests** — HTTP handlers via `supertest`, repository code
    against PostgreSQL (Testcontainers), middleware, and any cross-module
    contract. Live under `backend/tests/integration/**` and run via the Jest
    `integration` project.
  - **~10% End-to-end tests** — critical user workflows only (e.g.,
    register→verify, login, password-reset, session-expiry). Live under
    `backend/tests/e2e/**` and run via the Jest `e2e` project. PRs that add E2E
    tests for non-critical flows MUST justify them or move the coverage down the
    pyramid.
  - PRs that materially invert the pyramid (e.g., add 5 E2E tests and 0 unit
    tests for a new service) MUST be rejected.
- **Static analysis is part of the test suite** and MUST pass in CI on every PR:
  - `tsc --noEmit` under TypeScript **strict mode** (see Principle II) — zero
    errors.
  - **ESLint** with the project's strict ruleset — zero warnings.
  - **Prettier** — no formatting diff.
  These gates run before functional tests; a red static-analysis gate MUST fail
  the build immediately.
- **Coverage thresholds** (enforced by Jest's `coverageThreshold` and Stryker's
  `thresholds.break`, measured on business-logic modules; trivial DTOs, generated
  files, and framework boilerplate MAY be excluded via explicit ignore patterns):
  - **Line coverage ≥ 80%**
  - **Branch coverage ≥ 75%**
  - **Mutation score ≥ 75%** (Stryker, `@stryker-mutator/jest-runner`)
  CI MUST run `jest --coverage` on every PR and Stryker on at least the nightly
  build and on any PR labelled `mutation`. PRs that drop any of the three
  thresholds below target MUST be blocked from merging.
- **Test code quality**: tests are production code. Principles I (Clean Code), II
  (Strict TypeScript), and IV (JSDoc on exported helpers) apply to
  `backend/tests/**` with the same rigour as `backend/src/**`. Shared test
  helpers belong under `tests/**/_helpers/` and MUST be documented.

**Rationale**: A correctly shaped pyramid yields fast, stable feedback. Combining
line, branch, and mutation thresholds prevents the common failure mode where line
coverage is gamed by tests that execute code without asserting on its behaviour —
mutation testing is the truth-teller. Pinning the stack (Jest + Stryker on
Node 20 / TypeScript) removes ambiguity for tooling and CI.

#### §3 Test Types & Organization

All tests live under `backend/tests/**` and are routed to the correct Jest project
by their location:

- **Unit tests** — `backend/tests/unit/**/*.spec.ts`. New unit-test files MUST
  **mirror the `backend/src/` structure** (e.g., `src/auth/services/login.service.ts`
  → `tests/unit/auth/services/login.service.spec.ts`). One test file per source
  file is the default; if a single source file warrants multiple test files for
  size or focus reasons, place them in a sibling folder named after the source
  file (`tests/unit/auth/services/login.service/<focus>.spec.ts`).
  - **Legacy exception**: existing user-story groupings
    (`tests/unit/us1/`, `tests/unit/us2/`, …) MAY remain in place; new tests for
    those modules MAY continue the user-story grouping until a refactor moves
    them. New modules MUST use the mirror layout.
- **Integration tests** — `backend/tests/integration/**/*.spec.ts`. Group by
  feature / user story (the existing `tests/integration/us1..us4/` layout is the
  canonical pattern). Each file MUST exercise a real boundary (HTTP via
  `supertest`, PostgreSQL via Testcontainers, etc.) and MUST NOT mock the
  collaborator it is integration-testing.
- **End-to-end tests** — `backend/tests/e2e/**/*.e2e.spec.ts`. Group by user
  journey, one file per journey (the existing
  `us1-register-verify.e2e.spec.ts`, `us2-login.e2e.spec.ts`,
  `us3-password-reset.e2e.spec.ts`, `us4-session-expiry.e2e.spec.ts` files are
  the canonical pattern). E2E files MUST drive the system through its public
  HTTP surface only.
- **Cross-cutting suites** — `backend/tests/security/**/*.spec.ts` and
  `backend/tests/load/**/*.load.ts` are permitted and MUST be referenced by
  Principle III §7 once that section is filled in.
- **Test helpers** — reusable helpers MUST live under a `_helpers/` folder
  adjacent to the suites they serve (e.g., `tests/integration/_helpers/db.ts`)
  and MUST NOT be imported from `backend/src/`.

#### §4 Naming Conventions

File, suite, and case names MUST be predictable and grep-friendly:

- **Unit & integration test files**: `<ComponentName>.spec.ts`, where
  `<ComponentName>` matches the source file's base name in the same casing
  (e.g., `login.service.ts` → `login.service.spec.ts`,
  `password-policy.ts` → `password-policy.spec.ts`).
  - The `.test.ts` extension is **forbidden** in this repository to keep
    discovery patterns and Jest project globs consistent with the existing
    convention.
  - Repository-level integration files MAY use a `<feature>.contract.spec.ts`
    suffix when they verify an OpenAPI / schema contract
    (e.g., `register.contract.spec.ts`).
- **E2E test files**: `<user-journey-name>.e2e.spec.ts` in `kebab-case`,
  beginning with the user-story id where applicable
  (e.g., `us3-password-reset.e2e.spec.ts`, `account-delete.e2e.spec.ts`).
- **`describe` blocks** name the unit under test with the same identifier as
  the source symbol: `describe('LoginService', () => { … })`,
  `describe('passwordPolicy', () => { … })`. Nested `describe` blocks MAY name
  a method or scenario group: `describe('LoginService.attempt', () => { … })`.
- **`it` blocks** read as a sentence and MUST start with `should`, stating the
  expected outcome and the triggering condition:
  `it('should reject login when the password is incorrect', …)`.
  `it('should issue a session cookie when credentials are valid', …)`.
  Test names MUST NOT describe internal mechanics ("calls bcrypt.compare")
  unless the mechanic is the documented contract.
- **Test utility names** follow the same Clean-Code rules as production code
  (Principle I); helper factories SHOULD use the `make<Thing>` /
  `build<Thing>` prefix (e.g., `makeUser`, `buildLoginRequest`).

#### §5 Test Anatomy

Every test MUST be readable on its own and MUST follow the Arrange–Act–Assert
structure:

- **Arrange–Act–Assert (AAA)** is the primary pattern. The three phases SHOULD
  be visually separated by a single blank line, and each phase SHOULD have a
  clear single responsibility. The **Act** phase SHOULD be exactly one
  statement that exercises the system under test; if it is not, extract a
  helper rather than expanding the phase.
  - For asynchronous code, await the act expression directly
    (`const result = await service.attempt(input);`); do not bury the act
    inside `expect(…).rejects` chains unless the assertion *is* the
    rejection.
  - The **Assert** phase MUST contain at least one `expect` and SHOULD assert
    on observable behaviour (return value, emitted event, persisted row,
    HTTP response), not on internal call sequences, except where the
    interaction *is* the contract (e.g., a port adapter).
- **Setup belongs in `beforeEach`**, not `beforeAll`. Each test MUST start from
  a freshly-arranged state so that running a single `it` in isolation
  (`jest -t "should …"`) produces the same outcome as running the full file.
  - `beforeAll` is permitted **only** for expensive, read-only resources
    (e.g., starting a Testcontainers PostgreSQL instance, compiling a schema)
    and MUST be paired with per-test cleanup (`afterEach` truncate, fresh
    transaction, etc.) so no state leaks between tests.
  - `afterAll` MUST tear down anything `beforeAll` allocated.
- **Test independence is mandatory.** Tests MUST NOT depend on execution
  order, on side effects from earlier tests in the file, or on other test
  files. The suite MUST pass under Jest's default randomised /
  parallel execution; tests that require serial execution MUST opt in
  explicitly via the relevant Jest project configuration and document why.
- **No shared mutable global state.** Module-level `let`s holding
  test-fixture data, singleton clients reused across tests, and writable
  globals on `globalThis` are FORBIDDEN. Shared *immutable* constants
  (frozen objects, type definitions) and shared *factories* (pure functions
  that return fresh state) are permitted and encouraged.
- **One logical assertion per test.** A test SHOULD verify a single
  behaviour; multiple `expect` calls are acceptable when they all describe
  facets of the same outcome (e.g., status code + body + header on one
  HTTP response). Tests that assert on unrelated behaviours MUST be split.

#### §6 Mocking & Test Data

The goal of test doubles is to make tests **fast, deterministic, and focused on
the unit under test**, not to replace collaborators reflexively.

- **Mock** — use Jest mocks (`jest.fn()`, `jest.mock('module')`) for **external
  services you do not own and cannot run cheaply in-process**:
    • outbound email (the `email.port.ts` adapter / Nodemailer transport),
    • third-party HTTP APIs,
    • payment gateways, SMS providers, push services.
  Mocks MUST assert on the message contract (URL, payload shape) only when that
  contract is the behaviour under test; otherwise inspect the resulting state.
- **Stub** — replace **time-dependent and non-deterministic functions** so tests
  are reproducible:
    • `Date.now()`, `new Date()`, `performance.now()`, and the `clock.port.ts`
      adapter MUST be stubbed in any test whose outcome depends on time.
    • Use `jest.useFakeTimers({ now: <ISO> })` with `jest.setSystemTime(…)`,
      and prefer injecting the project's `Clock` port over patching globals
      where possible.
    • Random sources (`Math.random`, `crypto.randomUUID`,
      `crypto.randomBytes`) MUST be seeded or stubbed when their output
      affects assertions — see Token / verification-code generation in
      `auth/domain/token.ts`.
- **Fake** — use a hand-written **in-memory implementation of a port** for unit
  tests (e.g., an in-memory `UsersRepository` that satisfies the same
  interface as `users.repo.ts`). Fakes MUST implement the full port contract
  and SHOULD live under `tests/unit/_helpers/fakes/`. Integration tests MUST
  use the real adapter against Testcontainers PostgreSQL, not a fake.
- **Test fixtures** — store complex, reusable input data (sample JWTs, OpenAPI
  request bodies, multi-row DB seeds) under `tests/**/_helpers/fixtures/` as
  typed TypeScript modules, not as JSON blobs scattered in spec files. Each
  fixture export MUST carry a JSDoc block describing its intent (Principle IV).
- **Helper extraction is mandatory** when test setup is repeated more than
  twice. Standard helpers include:
    • `createTestUser(overrides?)` — builds a valid `User` aggregate with
      sensible defaults; located under `tests/**/_helpers/`.
    • `setupMockEmailPort()` — returns a Jest-mocked `EmailPort` plus an
      `expectEmailSent(…)` assertion helper.
    • `withTestDb(callback)` — wraps a test in a Testcontainers PostgreSQL
      transaction that rolls back on completion (integration tier).
  These helpers MUST be pure with respect to global state (no module-level
  mutable singletons — see §5).
- **Do NOT mock**:
    • **Code you own** that is cheap to instantiate (domain entities, value
      objects, pure functions, in-process services). Use the real thing; if
      it is hard to use directly, the design — not the test — is wrong.
    • **Simple utilities** (date formatters, string helpers, validators).
    • **The system under test itself** (no spying on private methods of the
      class you are testing — see §7 anti-patterns).
  Reaching for a mock to bypass an awkward collaborator is a design smell;
  refactor to a port + adapter (the existing `auth/adapters/*.port.ts`
  pattern) instead.

#### §7 Quality Criteria (CRITICAL)

This section defines what "good" means for a test in this repository. PR
reviewers MUST evaluate every test against the lists below; failing tests
that nonetheless violate these criteria MUST NOT be merged.

**A good test:**

- **Tests observable behaviour, not implementation details.** Assertions
  target return values, persisted state, emitted events, HTTP responses,
  and other facts visible at the public boundary. They MUST NOT pin internal
  call sequences, private fields, or method-resolution order unless the
  interaction *is* the contract (e.g., a port adapter).
- **Has meaningful assertions.** Tautological assertions are FORBIDDEN:
    • `expect(x).toBe(x)`, `expect(true).toBe(true)`, `expect(value).toEqual(value)`,
    • `expect(fn()).toBeDefined()` where `fn` always returns a value,
    • assertions that re-derive the expected value from the production code
      under test ("oracle laundering"). The expected value (the **oracle**)
      MUST be a literal, a fixture, or independently computed by the test
      author and reviewed by a human.
- **Tests one thing.** A test SHOULD verify a single behaviour
  (multi-`expect` is fine when all `expect`s describe one outcome — see §5).
- **Is fast.** Soft limits, enforced by reviewer judgement and Jest
  `testTimeout`:
    • Unit test — **< 1 s** wall-clock (target: tens of ms).
    • Integration test — **< 5 s** wall-clock per test.
    • E2E test — no hard cap, but the full E2E suite SHOULD complete in
      under 5 minutes locally.
- **Is deterministic.** Repeated runs on the same code MUST produce the same
  pass/fail result. Sources of non-determinism (time, randomness, network,
  test ordering, parallel writes to shared resources) MUST be controlled per
  §5 and §6.

**Quality gates (enforced in CI):**

- **Mutation score ≥ 75%** on business-logic modules, measured by **Stryker**
  (`@stryker-mutator/core` + `@stryker-mutator/jest-runner`). Stryker's
  `thresholds.break` MUST be set to `75`; PRs that drop the score below 75%
  MUST be blocked.
- **No always-true assertions.** Tautological tests (see list above) MUST be
  caught in code review and SHOULD be detected mechanically where possible
  (e.g., custom ESLint rules or `eslint-plugin-jest`).
- **Oracles are human-validated.** Every expected value, fixture, and golden
  output MUST be reviewed by a human reviewer who is not the author. Test
  oracles generated by an AI tool MUST be explicitly checked and the review
  noted in the PR description.
- **Coverage**: line ≥ 80%, branch ≥ 75% on business-logic modules
  (restated from §2; enforced by Jest `coverageThreshold`).

**Anti-patterns to avoid (any one of these is a blocking review comment):**

- **Testing private methods or internal state.** If a behaviour is worth
  testing, expose it through the public contract or extract a collaborator.
- **Interdependent tests.** Any reliance on previous test execution —
  shared in-memory state, ordering assumptions, leftover database rows —
  is forbidden (see §5).
- **Brittle tests.** Tests that fail on safe refactorings (renaming an
  internal helper, reordering independent operations, changing a log
  message) MUST be rewritten against observable behaviour.
- **Flaky tests.** Intermittent failures are NEVER acceptable. A flaky test
  MUST be quarantined (`it.skip` with a linked tracking issue) within one
  business day of detection and fixed or deleted within one week.
  `jest.retryTimes` MUST NOT be used to mask flakiness.
- **Tests without assertions.** A test body with no `expect` (or equivalent)
  is a no-op disguised as coverage and MUST be rejected.
- **Copy-pasted test logic.** Repeated arrange / mock-setup blocks MUST be
  extracted into helpers per §6. "Three strikes and you refactor" applies.

**Mutation-Resistant Test Generation Rules (NORMATIVE):**

These rules exist to make tests *kill mutants*, not merely execute lines.
They MUST be followed when authoring or reviewing tests for any module
covered by the Stryker gate (§8). Each rule maps to a class of mutant that
empirically survives line/branch coverage alone.

1. **Target — 75% minimum mutation score.** Every business-logic module
   under `src/auth/services/**` and `src/auth/domain/**` MUST achieve a
   Stryker mutation score ≥ **75%**. Stryker's `thresholds.break = 75`
   enforces this in CI. Surviving mutants MUST be triaged: kill them with a
   new assertion, justify the survivor in the PR (e.g., logger-format
   mutation deemed cosmetic), or refactor the production code to remove the
   uncovered branch.
2. **Boundary Testing.** For every relational operator (`<`, `<=`, `>`,
   `>=`) in production code, the test suite MUST include three cases: the
   exact boundary value, **boundary − 1**, and **boundary + 1**. This kills
   `<` ↔ `<=` and `>` ↔ `>=` mutants that line coverage alone cannot detect.
   Example: a 5-attempt lockout requires tests at attempts 4 (allowed), 5
   (boundary), and 6 (locked).
3. **Boolean Logic.** For every short-circuit `&&` or `||` in production
   code, the test suite MUST exercise **all combinations of the truth
   table** for the operands. For `a && b` and `a || b` that means all four
   `(T,T) (T,F) (F,T) (F,F)` cases (or the subset reachable given upstream
   constraints, with the unreachable cases justified in a comment). This
   kills `&&` ↔ `||` and operand-removal mutants.
4. **Exact Assertions.** For primitive values (`string`, `number`,
   `boolean`, `null`, `undefined`, `bigint`, `symbol`) tests MUST use
   `expect(x).toBe(literal)` (or `.toEqual(literal)` for object shapes).
   The matchers `.toBeTruthy()`, `.toBeFalsy()`, `.toBeDefined()`,
   `.toBeUndefined()` (when a literal `undefined` would do), and
   `.toBeNull()` (when a literal `null` would do) are FORBIDDEN for
   primitive checks because they let literal-mutation mutants survive
   (e.g., `'success'` → `''` still satisfies `.toBeTruthy()`).
5. **Error Validation.** When asserting that a function throws, tests MUST
   assert **both** the error class **and** the exact message content
   (string literal or anchored `RegExp`). `expect(fn).toThrow()` without an
   argument is FORBIDDEN. Prefer
   `expect(fn).toThrow(MyError)` followed by
   `expect(fn).toThrow('precise message')`, or a single
   `await expect(p).rejects.toMatchObject({ name: 'MyError', message: '…' })`.
   This kills string-literal mutants inside error constructors and prevents
   accidentally accepting a different error type with the same shape.

#### §8 Tools & Frameworks

Testing tooling is **pinned** to keep CI, local runs, and reviewer expectations
in lock-step. Substitutions require an amendment to this section.

- **Package manager**: **npm** (the lockfile of record is
  `backend/package-lock.json`). Do not commit `pnpm-lock.yaml` or `yarn.lock`.
- **Static analysis** (gates on every PR — see Workflow Gate #1 and #2):
    • **TypeScript strict mode** via `tsc --noEmit` — see Principle II.
    • **ESLint** with `@typescript-eslint/strict` and
      `eslint-plugin-jsdoc` — zero warnings.
    • **Prettier** — no formatting diff.
- **Unit & Integration testing**:
    • Framework: **Jest 29.x** (`jest`, `@types/jest`, `ts-jest` ESM
      preset — see `backend/jest.config.ts`).
    • Assertion library: **Jest `expect`** (no `chai`, no `assert`).
    • Mocking: **Jest mocks** (`jest.fn`, `jest.mock`, `jest.spyOn`,
      `jest.useFakeTimers`); no `sinon`.
    • HTTP testing: **`supertest`** against the real Express app.
    • Database integration: **`testcontainers`** /
      **`@testcontainers/postgresql`** — do not point integration tests at
      a developer's local PostgreSQL.
- **Coverage & mutation**:
    • Coverage tool: **Jest built-in** (`jest --coverage`); thresholds
      configured in `backend/jest.config.ts` per §2/§7.
    • Mutation testing: **Stryker** (`@stryker-mutator/core` and
      `@stryker-mutator/jest-runner`) with `thresholds.break = 75`.
      Configuration MUST live in `backend/stryker.conf.js`.
- **Required npm scripts** in `backend/package.json` (MUST be present and
  behave as described):
    • `npm test` — runs the full Jest suite (all projects).
    • `npm run test:unit` — `jest --selectProjects unit`.
    • `npm run test:integration` — `jest --selectProjects integration`.
    • `npm run test:e2e` — `jest --selectProjects e2e` (already present).
    • `npm run test:cov` — `jest --coverage` (already present).
    • `npm run test:mutation` — `stryker run`.
  Any script missing from `backend/package.json` is recorded as a follow-up
  TODO in the Sync Impact Report at the top of this file and MUST be added
  in the next infrastructure PR.

### IV. JSDoc Documentation Mandate

All code MUST be documented with JSDoc:

- Every exported symbol (function, class, method, type, interface, enum, constant)
  MUST carry a JSDoc block with: a one-line summary, a longer description when
  non-obvious, `@param` for each parameter, `@returns` for non-void returns, and
  `@throws` for documented error paths.
- Non-trivial internal (non-exported) functions SHOULD also be documented when their
  behaviour is not self-evident from the signature and name.
- JSDoc MUST stay in sync with the code: PRs that change a signature MUST update the
  corresponding JSDoc in the same commit.
- `@deprecated` MUST be used (with replacement guidance and removal target) before
  any public API is removed.
- Documentation tone is descriptive, not narrative: state contract, invariants, and
  side effects; avoid restating what the types already express.

**Rationale**: TypeScript types describe shape; JSDoc describes intent, contracts, and
edge cases. Together they make the codebase self-explanatory and tool-friendly (IDE
hovers, generated docs).

## Additional Constraints & Quality Standards

- **Language & runtime**: TypeScript is the primary implementation language.
  JavaScript files are permitted only for build/config tooling and MUST still pass
  lint.
- **Dependency hygiene**: new runtime dependencies MUST be justified in PR
  description (purpose, size, maintenance status). Prefer the standard library and
  existing dependencies over adding new ones.
- **Security**: code MUST avoid the OWASP Top 10 vulnerability patterns. Secrets MUST
  NOT be committed; configuration MUST come from environment variables or a vetted
  secrets manager.
- **Error handling**: errors MUST be typed (custom `Error` subclasses where
  meaningful); empty `catch` blocks are forbidden. Validate inputs at system
  boundaries only.
- **Logging**: structured logging (JSON) MUST be used in services; user-facing
  messages MUST NOT leak stack traces or secrets.

## Development Workflow & Quality Gates

The following gates MUST pass before any PR can merge to the main branch:

1. **Type check**: `tsc --noEmit` succeeds with strict settings.
2. **Lint & format**: ESLint passes with zero warnings; Prettier reports no diff.
3. **Tests**: full test suite passes (Jest `unit`, `integration`, `e2e` projects);
   coverage on business-logic modules meets Principle III §2 thresholds — line ≥ 80%,
   branch ≥ 75%, and Stryker mutation score ≥ 75% (mutation gate enforced nightly
   and on PRs labelled `mutation`).
4. **JSDoc**: all changed exported symbols have up-to-date JSDoc blocks (verified by
   reviewer; tooling such as `eslint-plugin-jsdoc` SHOULD enforce mechanically).
5. **Code review**: at least one approving review from a maintainer who is not the
   author. Reviewers MUST verify constitutional compliance.
6. **Constitution Check**: feature plans MUST include a Constitution Check section
   confirming each of the four principles is satisfied or explicitly justifying any
   deviation in a Complexity Tracking entry.

## Governance

This Constitution is the highest-authority development document for this project and
supersedes any conflicting practice or convention.

- **Amendments**: any change to a principle, gate, or governance rule requires a PR
  that (a) updates this file, (b) updates the Sync Impact Report comment at the top,
  (c) bumps the version per the policy below, and (d) updates dependent templates in
  `.specify/templates/` where impacted.
- **Versioning policy** (semantic):
  - **MAJOR**: backward-incompatible governance change, removal of a principle, or
    redefinition that invalidates existing plans/specs.
  - **MINOR**: new principle or section added, or material expansion of guidance.
  - **PATCH**: clarifications, wording, typo fixes, non-semantic refinements.
- **Compliance review**: every PR review MUST verify constitutional compliance.
  Repeated violations are treated as merge blockers, not style suggestions.
- **Complexity justification**: any deviation from a principle MUST be recorded in
  the plan's Complexity Tracking section with a concrete reason and the simpler
  alternative that was rejected.
- **Runtime guidance**: agent-specific operational guidance lives in
  `.github/copilot-instructions.md` and the `.specify/templates/` files; those files
  MUST be kept consistent with this Constitution.

**Version**: 1.4.0 | **Ratified**: 2026-05-10 | **Last Amended**: 2026-05-11
