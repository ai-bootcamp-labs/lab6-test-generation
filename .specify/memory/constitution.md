<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: Initial ratification of the project constitution. All placeholder
tokens replaced with concrete principles and governance rules.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Clean Code (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. TypeScript Strict Mode (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Testing Pyramid with 80% Business-Logic Coverage (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. JSDoc Documentation Mandate
  - [PRINCIPLE_5_NAME] → (removed; user requested four principles)

Added sections:
  - Additional Constraints & Quality Standards
  - Development Workflow & Quality Gates

Removed sections:
  - None (placeholder section 5 consolidated into the four ratified principles)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md  (Constitution Check section is generic and
       compatible; gates will reference these four principles at planning time)
  - ✅ .specify/templates/spec-template.md  (no constitutional references; compatible)
  - ✅ .specify/templates/tasks-template.md (compatible; testing/documentation tasks
       map to Principles III and IV)
  - ✅ .specify/templates/checklist-template.md (compatible)
  - ✅ .github/prompts/speckit.constitution.prompt.md (no edits required)

Follow-up TODOs:
  - None. Ratification date set to today since no prior adoption record exists.
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

### III. Testing Pyramid with 80% Business-Logic Coverage (NON-NEGOTIABLE)

Tests MUST follow the testing-pyramid distribution and meet enforced coverage gates:

- **Pyramid shape**: a healthy mix dominated by fast unit tests, supported by a
  smaller layer of integration tests, and capped by a thin layer of end-to-end tests.
  As guidance, target roughly 70% unit, 20% integration, 10% E2E by test count; PRs
  that invert the pyramid (e.g., E2E-heavy) MUST be justified.
- **Unit tests** MUST be deterministic, isolated from I/O, and run in milliseconds.
- **Integration tests** MUST cover module boundaries: HTTP handlers, database access,
  external service contracts, and shared schemas.
- **End-to-end tests** MUST cover critical user journeys only.
- **Coverage gate**: business-logic modules (domain services, use-cases, calculation
  and validation logic) MUST maintain **≥ 80% line and branch coverage**. Coverage
  is measured and enforced in CI; PRs that drop coverage below the threshold MUST be
  blocked. Trivial code (DTOs, generated files, framework boilerplate) MAY be
  excluded via explicit ignore patterns.
- **TDD is RECOMMENDED**: writing tests before implementation is the preferred
  default for business logic; bug fixes MUST include a failing regression test first.

**Rationale**: A correctly shaped pyramid yields fast feedback and stable CI, while an
80% threshold targeted at business logic ensures correctness where it matters without
forcing low-value tests on trivial code.

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
3. **Tests**: full test suite passes; coverage on business-logic modules ≥ 80% line
   and branch.
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

**Version**: 1.0.0 | **Ratified**: 2026-05-10 | **Last Amended**: 2026-05-10
