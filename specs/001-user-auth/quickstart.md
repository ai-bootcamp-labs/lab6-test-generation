# Quickstart — User Authentication System

**Feature**: 001-user-auth · **Branch**: `001-user-auth` · **Date**: 2026-05-10

This quickstart shows how to bring up the auth backend locally and exercise
the four user stories from the spec. Treat it as the integration smoke test
for the feature.

---

## Prerequisites

- Node.js **20 LTS**
- Docker (for the local Postgres container)
- A POSIX shell or PowerShell

## 1. Install & configure

```bash
cd backend
npm ci
cp .env.example .env
```

Edit `.env`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://auth:auth@localhost:5432/auth
JWT_SECRET=replace-me-with-32-bytes-of-random
COOKIE_DOMAIN=localhost
SMTP_URL=smtp://localhost:1025          # MailHog or similar in dev
PASSWORD_BCRYPT_COST=12
```

## 2. Start Postgres + MailHog

```bash
docker compose up -d        # postgres on :5432, mailhog on :8025 / :1025
npm run db:migrate
```

## 3. Run the service

```bash
npm run dev                 # ts-node-dev, watches src/
```

Server is up at `http://localhost:3000`. All endpoints documented in
[`contracts/auth-api.openapi.yaml`](contracts/auth-api.openapi.yaml).

## 4. Run the test suites

```bash
npm test                    # jest: unit + integration + e2e
npm run test:cov            # with coverage; CI gate ≥ 80% on services/domain
```

---

## Story walk-through (smoke test)

### Story 1 — Register & verify

```bash
# 1.1 Register
curl -i -X POST http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Correct-Horse-Battery-9!"}'
# → 201 Created; pending account; verification email visible at http://localhost:8025

# 1.2 Pull the verification token from MailHog (or stdout in test mode), then:
curl -i -X POST http://localhost:3000/auth/verify-email \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$VERIFY_TOKEN\"}"
# → 204 No Content
```

### Story 2 — Login & inspect session

```bash
# 2.1 Login (cookie jar captures auth_session + csrf_token)
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Correct-Horse-Battery-9!"}'
# → 200 OK; Set-Cookie: auth_session=...; HttpOnly; Secure; SameSite=Lax

# 2.2 Verify the session is live
curl -i -b cookies.txt http://localhost:3000/auth/session
# → 200 OK; { userId, expiresAt }
```

### Story 3 — Password reset

```bash
# 3.1 Request reset (response is identical for known + unknown emails)
curl -i -X POST http://localhost:3000/auth/password-reset/request \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com"}'
# → 202 Accepted

# 3.2 Pull RESET_TOKEN from MailHog
curl -i -X POST http://localhost:3000/auth/password-reset/confirm \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"New-Battery-Horse-12!\"}"
# → 204 No Content; all of Alice's sessions are now revoked.

# 3.3 Old session no longer works
curl -i -b cookies.txt http://localhost:3000/auth/session
# → 401 Unauthorized
```

### Story 4 — 24-hour expiry & explicit logout

```bash
# 4.1 Log in fresh
curl -i -c cookies.txt -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"New-Battery-Horse-12!"}'

# 4.2 Read CSRF cookie value into $CSRF, then logout
CSRF=$(awk '$6=="csrf_token"{print $7}' cookies.txt)
curl -i -b cookies.txt -X POST http://localhost:3000/auth/logout \
  -H "X-CSRF-Token: $CSRF"
# → 204 No Content

# 4.3 Session is dead immediately
curl -i -b cookies.txt http://localhost:3000/auth/session
# → 401 Unauthorized
```

For the 24-hour expiry path, the integration tests use an injectable `Clock`
port so wall-clock time does not need to advance — see
`tests/integration/session-expiry.spec.ts`.

---

## Account self-deletion

```bash
curl -i -b cookies.txt -X DELETE http://localhost:3000/auth/account \
  -H "X-CSRF-Token: $CSRF"
# → 204 No Content
# All sessions revoked; account marked disabled; PII anonymization scheduled
# by the daily retention job (D13) to run within 30 days.
```

---

## Coverage check

```bash
npm run test:cov
# Reports:
#   File                                    | % Stmts | % Branch | % Funcs | % Lines
#   src/auth/services/**                    |  ≥80    |  ≥80     |  ≥80    |  ≥80
# CI fails if any service or domain module drops below 80% line OR branch.
```

---

## Constitution-aligned acceptance criteria for this feature

- [ ] `npx tsc --noEmit` passes (Principle II)
- [ ] `npm run lint` passes with zero warnings (Principle I)
- [ ] `npm test` passes; coverage on `src/auth/{services,domain}/**` ≥ 80%
      line and branch (Principle III)
- [ ] `eslint-plugin-jsdoc` reports zero missing-doc errors on exported
      symbols (Principle IV)
- [ ] All 4 user stories above run green via `npm run test:e2e`
