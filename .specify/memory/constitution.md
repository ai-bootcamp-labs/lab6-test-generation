<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR — Principle III is replaced by an expanded
"III. Testing Principles (NON-NEGOTIABLE)" that adds Test-Driven Development as a
hard requirement (was RECOMMENDED), introduces a dedicated stack (Jest + Stryker on
Node.js/TypeScript), and adds mutation-score and branch-coverage targets. Previously
mandated rules (testing pyramid, ≥ 80% line coverage on business logic) are
preserved or strengthened, so existing plans remain valid — this is an expansion of
guidance, not a backward-incompatible redefinition. Sections 3–8 of the Testing
Principles are reserved for follow-up amendments and explicitly marked as such.

Modified principles:
  - III. Testing Pyramid with 80% Business-Logic Coverage (NON-NEGOTIABLE)
      → III. Testing Principles (NON-NEGOTIABLE)
        · §1 Testing Philosophy (TDD / RED-GREEN-REFACTOR / spec-first)
        · §2 Coverage Requirements (pyramid + tooling + 80/75/75 thresholds)

Added sections:
  - Principle III §1 "Testing Philosophy"
  - Principle III §2 "Coverage Requirements"
  - Reserved placeholders for Principle III §3–§8 (to be filled in future amendments)

Removed sections:
  - None.

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md  (Constitution Check remains generic; new
       coverage thresholds are read at gate-evaluation time)
  - ✅ .specify/templates/spec-template.md  (no constitutional references; compatible)
  - ✅ .specify/templates/tasks-template.md (compatible; TDD ordering already aligns
       with §1 — tests precede implementation tasks)
  - ✅ .specify/templates/checklist-template.md (compatible)
  - ⚠ .github/copilot-instructions.md / SpecKit prompt files (no edits required now,
       but reviewers SHOULD verify TDD/mutation guidance is reflected if those files
       are regenerated)

Follow-up TODOs:
  - TODO(TESTING_PRINCIPLES_3_TO_8): user has signalled 6 additional Testing
    Principle sections will be added in subsequent amendments. Each addition is
    expected to be a MINOR bump unless it relaxes or removes an existing rule.
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

#### §3 Reserved — Test Structure & Naming

TODO(TESTING_PRINCIPLES_3): to be defined in a follow-up amendment.

#### §4 Reserved — Test Data & Fixtures

TODO(TESTING_PRINCIPLES_4): to be defined in a follow-up amendment.

#### §5 Reserved — Mocking & Test Doubles

TODO(TESTING_PRINCIPLES_5): to be defined in a follow-up amendment.

#### §6 Reserved — Performance & Determinism

TODO(TESTING_PRINCIPLES_6): to be defined in a follow-up amendment.

#### §7 Reserved — Security & Contract Testing

TODO(TESTING_PRINCIPLES_7): to be defined in a follow-up amendment.

#### §8 Reserved — CI Integration & Reporting

TODO(TESTING_PRINCIPLES_8): to be defined in a follow-up amendment.

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

**Version**: 1.1.0 | **Ratified**: 2026-05-10 | **Last Amended**: 2026-05-11
