# Feature Specification: User Authentication System

**Feature Branch**: `001-user-auth`  
**Created**: 2026-05-10  
**Status**: Draft  
**Input**: User description: "Create a user authentication system with: User registration (email/password), Login with JWT tokens, Password reset via email, Session management (24-hour expiry)"

## Clarifications

### Session 2026-05-10

- Q: Is email verification required before a newly registered account can log in? → A: Yes — verification required before login (pending → active state, single-use time-limited link).
- Q: How are session tokens validated and revoked? → A: Server-side session store; JWT carries an opaque session reference and every protected request looks up the session row (signature + not-revoked + not-expired).
- Q: What are the exact login-throttling thresholds? → A: 5 failed logins/account/5 min → 15 min account lockout; 20 failed logins/IP/5 min → 15 min IP throttle; counters reset on success or window expiry.
- Q: How is the session token transported between client and server? → A: `HttpOnly` + `Secure` + `SameSite=Lax` cookie; CSRF token required on state-changing endpoints.
- Q: What is the account-deletion and data-retention policy? → A: Self-service soft-delete → PII (email, password hash) anonymized within 30 days; security-event logs retained 12 months then purged; all sessions revoked immediately on deletion.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New user registers an account (Priority: P1)

A first-time visitor wants to create an account so they can access protected
features of the application. They provide an email address and a password,
agree to terms, and receive a verification email. After clicking the
verification link they can log in.

**Why this priority**: Without registration there is no user base. This is the
entry point of the entire feature; nothing else (login, reset, sessions) is
useful until users can be created. Delivering only this story still yields a
demonstrable, testable slice (accounts exist in the system).

**Independent Test**: Submit a registration form with a valid, unused email and
a strong password; verify that the account is persisted in a pending state,
the password is not stored in plaintext, a verification email is sent, and the
user receives a clear success confirmation that explains the verification
step. Follow the verification link and confirm the account becomes active.
Submit registration again with the same email and verify rejection.

**Acceptance Scenarios**:

1. **Given** no account exists for `alice@example.com`, **When** Alice submits
   the registration form with that email and a password meeting strength rules,
   **Then** a pending account is created, a single-use time-limited
   verification link is emailed to her, and Alice sees a success confirmation
   that instructs her to verify her email.
2. **Given** Alice has a pending account and opens an unexpired, unused
   verification link, **When** she completes the verification step, **Then**
   the account transitions to active and she may log in.
3. **Given** an account already exists for `alice@example.com` (pending or
   active), **When** Alice tries to register again with the same email,
   **Then** registration is rejected with a clear, non-enumerating message and
   no duplicate account is created.
4. **Given** Alice submits a password that fails the strength rules, **When**
   she submits the form, **Then** registration is rejected and the rules are
   shown.
5. **Given** Alice submits a syntactically invalid email, **When** she submits
   the form, **Then** registration is rejected with a validation error.
6. **Given** Alice's verification link has expired or has already been used,
   **When** she opens it, **Then** the request is rejected and she is offered
   a way to request a new verification email.

---

### User Story 2 - Returning user logs in (Priority: P1)

A registered user wants to authenticate so they can access their account. They
enter their email and password and, on success, receive an authentication token
that grants them access for the duration of a session.

**Why this priority**: Login is the second half of the MVP. Without it, accounts
can be created but not used. Together with Story 1 it delivers the minimum
viable feature.

**Independent Test**: Create a user (via Story 1), then submit valid
credentials and verify a session token is issued and the user is treated as
authenticated for protected operations. Submit invalid credentials and verify
rejection without revealing whether the email exists.

**Acceptance Scenarios**:

1. **Given** Alice has a verified (active) account, **When** she submits the
   correct email and password, **Then** the system issues an authentication
   token and her session is considered active.
2. **Given** Alice has registered but has not yet verified her email, **When**
   she submits her correct credentials, **Then** login is rejected with a
   clear "verify your email" message and no session is issued.
3. **Given** Alice submits a wrong password, **When** she attempts to log in,
   **Then** the system rejects the attempt with a generic error that does not
   disclose whether the email is registered.
4. **Given** Alice submits a non-existent email, **When** she attempts to log
   in, **Then** the system returns the same generic error as the wrong-password
   case (no account enumeration).
5. **Given** Alice has failed login N consecutive times within a short window,
   **When** she attempts again, **Then** the system temporarily throttles
   further attempts for that account/IP.

---

### User Story 3 - User resets a forgotten password (Priority: P2)

A registered user has forgotten their password and wants to regain access. They
request a reset, receive a one-time link by email, follow it, choose a new
password, and can then log in with the new credentials.

**Why this priority**: Critical for retention and support cost, but not strictly
required for an internal-demo MVP — Stories 1 & 2 can ship without it. Reset is
the next-most-valuable slice.

**Independent Test**: Request a reset for a known account; verify exactly one
time-limited link is sent to the registered email; follow the link, set a new
password, and confirm login succeeds with the new password and fails with the
old one.

**Acceptance Scenarios**:

1. **Given** Alice has an account, **When** she requests a password reset for
   her email, **Then** the system sends a single-use, time-limited reset link
   to her email and shows a generic confirmation regardless of whether the
   email exists.
2. **Given** Alice opens an unexpired, unused reset link, **When** she submits
   a new password meeting strength rules, **Then** her password is updated and
   the link is invalidated.
3. **Given** Alice's reset link has expired or has already been used, **When**
   she opens it, **Then** the request is rejected with a clear error and she is
   prompted to request a new link.
4. **Given** Alice's password has been reset, **When** any previously active
   session for her account is checked, **Then** those sessions are invalidated
   and re-authentication is required.

---

### User Story 4 - Session expires after 24 hours (Priority: P2)

An authenticated user's session must expire automatically 24 hours after it was
issued, requiring re-authentication afterwards. Users may also log out
explicitly to end their session immediately.

**Why this priority**: Required for the security posture promised by the
feature, but the system can launch internally with Stories 1 & 2 in place; this
slice hardens the production posture.

**Independent Test**: Issue a session and verify protected operations succeed
within 24 hours and are rejected after. Verify explicit logout immediately
invalidates the session.

**Acceptance Scenarios**:

1. **Given** Alice received an authentication token at time T, **When** she
   makes a protected request at any time before T + 24h, **Then** the request
   is accepted.
2. **Given** Alice's token was issued at T, **When** she makes a protected
   request after T + 24h, **Then** the request is rejected with an
   authentication-expired error and she is prompted to log in again.
3. **Given** Alice is logged in, **When** she chooses "log out", **Then** her
   current session is invalidated immediately and any further protected request
   with that token is rejected.
4. **Given** Alice has multiple active sessions (e.g., laptop and phone),
   **When** one session expires or is logged out, **Then** the others remain
   valid until their own expiry or explicit logout.

---

### Edge Cases

- **Concurrent registrations** with the same email arriving simultaneously:
  exactly one MUST succeed; the other receives the duplicate-email error.
- **Password reset request for an unknown email**: response MUST be
  indistinguishable from the success case to prevent account enumeration.
- **Reset link reuse**: a link MUST be invalid after first successful use.
- **Reset link tampering**: any modification to the link's token MUST cause it
  to be rejected.
- **Clock skew between issuer and verifier**: a small leeway (≤ 60 seconds) MAY
  be tolerated when checking expiry; sessions MUST never be accepted more than
  24h + leeway after issuance.
- **Token theft / replay**: stolen tokens remain a risk during their lifetime;
  explicit logout, password reset, and the 24h cap MUST all bound this exposure.
- **User attempts login while account is locked due to throttling**: response
  MUST clearly indicate temporary lock without disclosing whether the account
  exists.
- **Email delivery failure** for verification or reset email: the user-facing
  flow MUST surface a retry path; the system MUST NOT leave the user in a stuck
  state without recourse.
- **Disabled / deleted account**: any attempt to log in or reset MUST be
  rejected and existing sessions MUST be invalidated.
- **Verification link reuse / tampering**: a verification link MUST be invalid
  after first successful use and MUST be rejected if its token is modified.
- **Password reset for a pending (unverified) account**: a successful reset
  MUST also mark the account as verified (proof of email ownership) and
  transition it to active.

## Requirements *(mandatory)*

### Functional Requirements

**Registration**

- **FR-001**: System MUST allow a visitor to register an account using an email
  address and a password.
- **FR-002**: System MUST validate that the submitted email is syntactically
  valid before accepting registration.
- **FR-003**: System MUST reject registration when the email is already
  associated with an existing account, without disclosing existing-account
  presence to unauthenticated callers in a way that enables enumeration.
- **FR-004**: System MUST enforce password strength rules at registration
  (minimum length 12 characters; at least three of: lowercase, uppercase, digit,
  symbol; rejection of a maintained list of common weak passwords).
- **FR-005**: System MUST store passwords using a one-way, salted, modern
  password-hashing function; plaintext or reversible storage is forbidden.
- **FR-006**: System MUST treat email addresses as case-insensitive for
  uniqueness and lookup.
- **FR-006a**: System MUST create new accounts in a *pending* state and MUST
  send a single-use, time-limited email-verification link to the registered
  address. Verification links MUST expire after 24 hours and MUST be
  invalidated immediately upon successful use.
- **FR-006b**: System MUST allow a pending user to request a new verification
  email; previously issued, unused links MAY be invalidated when a new one is
  issued.
- **FR-006c**: A successful password reset for a pending account MUST also
  transition the account to *active* (since reset proves email ownership).

**Login**

- **FR-007**: System MUST allow a registered, *active* (email-verified) user
  to authenticate using their email and password. Pending (unverified)
  accounts MUST be rejected at login with a clear "verify your email" message,
  distinct from the generic invalid-credentials error.
- **FR-008**: System MUST issue a session token to the user on successful
  authentication.
- **FR-009**: System MUST return a generic error for failed login regardless of
  whether the email exists or the password is wrong (no account enumeration).
- **FR-010**: System MUST throttle repeated failed login attempts using two
  independent counters:
  - **Account-level**: after 5 consecutive failed logins for the same account
    within a 5-minute window, the account MUST be temporarily locked for
    15 minutes; further login attempts during the lockout MUST be rejected
    without reaching credential verification.
  - **Source-IP-level**: after 20 failed logins from the same source IP
    within a 5-minute window, that IP MUST be throttled for 15 minutes
    against the login endpoint.
  - **Reset behaviour**: a successful login MUST reset the account-level
    counter; both counters MUST otherwise reset when their respective
    rolling 5-minute window elapses without a new failure.
- **FR-011**: System MUST allow the user to log out, immediately invalidating
  the current session.

**Password reset**

- **FR-012**: System MUST allow a user to request a password reset by
  submitting their email address.
- **FR-013**: System MUST send a single-use, time-limited reset link to the
  email address on file when a reset is requested for an existing account.
- **FR-014**: System MUST present an identical, generic confirmation to the
  caller regardless of whether the submitted email is registered.
- **FR-015**: Reset links MUST expire after 30 minutes and MUST be invalidated
  immediately upon successful use.
- **FR-016**: System MUST require the new password to meet the same strength
  rules as registration (FR-004).
- **FR-017**: System MUST invalidate all existing sessions for the account upon
  a successful password reset.

**Session management**

- **FR-018**: A session token MUST be valid for exactly 24 hours from the time
  of issuance.
- **FR-019**: System MUST reject any protected request whose session token has
  expired, been revoked, or been tampered with, returning an
  authentication-required response. Verification on every protected request
  MUST include both signature validity AND a server-side session lookup
  confirming the session row exists, is not revoked, and is not past its
  recorded expires-at.
- **FR-020**: System MUST allow multiple concurrent sessions per user (e.g.,
  different devices), each with its own independent expiry.
- **FR-021**: System MUST allow administrative or self-service revocation of an
  individual session before its natural expiry (covers logout and
  reset-triggered invalidation).
- **FR-022**: Session tokens MUST be unforgeable: tampering with their contents
  MUST cause verification to fail.
- **FR-022a**: System MUST persist a server-side session record for each
  issued token. The token itself MUST carry only an opaque reference to that
  record (and any non-sensitive claims required for routing). Revocation MUST
  be effected by updating the server-side record; revoked sessions MUST be
  rejected on the very next protected request.
- **FR-022b**: Session tokens MUST be transported to browser clients in an
  `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to the application's
  origin. Tokens MUST NOT be readable by client-side JavaScript and MUST NOT
  be persisted in `localStorage` or `sessionStorage`.
- **FR-022c**: All state-changing endpoints (POST/PUT/PATCH/DELETE) that rely
  on the session cookie for authentication MUST additionally require a CSRF
  token bound to the session and verified server-side; requests missing or
  presenting a mismatched CSRF token MUST be rejected.

**Auditing & security**

- **FR-023**: System MUST log security-relevant events (registration, login
  success/failure, logout, password-reset request, password-reset completion,
  session revocation, account deletion) with timestamp, account identifier,
  and source IP, and MUST NOT log passwords or full tokens.
- **FR-023a**: Security-event logs MUST be retained for 12 months and MUST be
  purged automatically after that window.
- **FR-024**: System MUST transport all credentials, tokens, and reset links
  only over encrypted channels (TLS). On logout, the session cookie MUST be
  cleared (server response sets the cookie to expire immediately) in addition
  to revoking the server-side session record.

**Account deletion & retention**

- **FR-025**: System MUST allow an authenticated user to delete their own
  account.
- **FR-026**: On account deletion the system MUST immediately (a) mark the
  account as *disabled*, (b) revoke all of the user's active sessions, and
  (c) invalidate any outstanding password-reset and email-verification
  requests for the account.
- **FR-027**: Within 30 days of deletion the system MUST anonymize the
  account's personally identifiable information — email replaced with a
  non-reversible placeholder, password hash cleared — while preserving the
  account's surrogate identifier so historical audit references remain valid.
- **FR-028**: After PII anonymization, the (now anonymized) email value MUST
  NOT block re-registration: a new account MAY be created with the original
  email address.
### Key Entities *(include if feature involves data)*

- **User Account**: represents a person who can authenticate. Key attributes:
  unique identifier, email (unique, case-insensitive; cleared/anonymized after
  deletion), password hash (cleared after deletion), account status
  (pending / active / locked / disabled), created-at, verified-at,
  last-login-at, deleted-at, anonymized-at.
- **Email Verification Request**: a single-use, time-limited grant proving
  ownership of an email address at registration. Key attributes: opaque token,
  owning user, issued-at, expires-at (= issued + 24h), used-at (null until
  consumed).
- **Session**: represents an authenticated session bound to a user, persisted
  server-side as the source of truth for revocation. Key attributes: opaque
  session identifier (referenced by the issued token), owning user, issued-at,
  expires-at (= issued + 24h), revoked flag, revoked-at, revoke reason
  (logout / reset / admin / expired), source-IP/user-agent metadata for audit.
- **Password Reset Request**: a single-use, time-limited grant to set a new
  password. Key attributes: opaque token, owning user, issued-at, expires-at
  (= issued + 30m), used-at (null until consumed).
- **Security Event**: an audit record of a security-relevant action. Key
  attributes: event type, user reference (if applicable), timestamp, source IP,
  outcome (success/failure), reason code. Retained for 12 months then purged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can complete registration end-to-end (form submit →
  verification email received → link followed → account active) in under 5
  minutes on a typical broadband connection, with the verification email
  delivered within 60 seconds for 99% of requests.
- **SC-002**: A returning user can complete login (form submit → authenticated)
  in under 5 seconds at the 95th percentile under normal load.
- **SC-003**: A user who initiates a password reset receives the reset email
  within 60 seconds for 99% of requests.
- **SC-004**: 100% of successful logins issue a session that expires no later
  than 24 hours plus the documented clock-skew leeway after issuance.
- **SC-005**: 0 stored passwords or full session tokens appear in plaintext in
  logs, databases, or error reports (verified by automated scanning of these
  surfaces).
- **SC-006**: Account-enumeration probes (registration with existing email,
  login with unknown email, reset for unknown email) return responses that are
  indistinguishable in content and timing within ±100 ms at the 95th percentile.
- **SC-007**: After 5 consecutive failed login attempts on an account within 5
  minutes, the 6th attempt from any source is rejected without reaching
  credential verification, and the account remains locked for 15 minutes from
  the 5th failure.
- **SC-008**: After a successful password reset, 100% of pre-existing sessions
  for that account are rejected on their next protected request.
- **SC-009**: Authentication endpoints sustain at least 100 requests/second
  with a 95th-percentile latency under 500 ms during load testing.
- **SC-010**: 100% of account-deletion requests revoke all of the user's
  active sessions before the deletion-confirmation response is returned, and
  the account's PII is anonymized within 30 calendar days of the deletion
  request (verified by an automated retention job).

## Assumptions

- The application has access to an outbound transactional email service capable
  of delivering verification and reset emails reliably; configuring that
  service is a prerequisite, not part of this feature.
- The user's explicit choice of "JWT" for login tokens is honoured as the
  session-token mechanism; tokens are signed and verified using a secret/key
  managed outside this feature's scope. Tokens are used as opaque carriers of
  a session reference — a server-side session store is the source of truth
  for revocation and expiry, and is consulted on every protected request.
- Email is the sole identifier; usernames, phone numbers, and social/SSO
  providers are out of scope for this version.
- Multi-factor authentication is out of scope for this version and may be added
  later without breaking the contracts defined here.
- Password strength rules align with current NIST SP 800-63B guidance
  (length-first, no mandatory periodic rotation).
- All traffic is served over HTTPS; HTTP endpoints are either redirected or
  refused.
- Time is measured against the server's authoritative clock; small client/
  server clock skew (≤ 60 seconds) is tolerated for token verification.
- Rate-limiting infrastructure (or equivalent middleware) is available to
  implement FR-010 throttling.
- A "session" maps 1:1 to an issued token; there is no server-side sliding
  renewal in this version (token is fixed-lifetime). The server-side session
  record, not the token, is authoritative for liveness.
