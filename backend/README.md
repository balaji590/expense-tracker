# ExpenseTracker Backend (Phase 5.1 — skeleton, no auth yet)

Node.js + Express + PostgreSQL backend foundation. This phase provides the
database schema, connection layer, and a health-check endpoint only —
no authentication, no invitations, no business-logic API routes yet, and
the existing frontend has not been changed or wired up to call this at all.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or reachable via network)

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit .env with your real local database credentials — never commit this file
```

Create the databases referenced by your `.env` (one for normal use, one
dedicated to tests so a test run can never touch real data):

```bash
psql -c "CREATE USER expensetracker WITH PASSWORD 'your_password_here';"
psql -c "CREATE DATABASE expensetracker_dev OWNER expensetracker;"
psql -c "CREATE DATABASE expensetracker_test OWNER expensetracker;"
```

## Running migrations

Migrations live in `../database/migrations/*.sql` and are applied in
filename order. The runner tracks what's already been applied in a
`schema_migrations` table, so it's always safe to re-run — already-applied
files are skipped automatically.

```bash
npm run migrate              # applies to the database named in .env's DB_NAME
NODE_ENV=test npm run migrate  # applies to TEST_DB_NAME instead
```

To add a new migration later: create the next-numbered `.sql` file in
`database/migrations/` (e.g. `008_add_something.sql`) and run `npm run
migrate` again — only the new file will be applied.

## Running the server

```bash
npm start        # node src/server.js
npm run dev       # same, with --watch for auto-restart on file changes
```

Verify it's up:

```bash
curl http://localhost:3001/api/health
# {"status":"ok","database":"connected","timestamp":"..."}
```

## Running tests

```bash
npm test
```

Tests run against `TEST_DB_NAME` (never your dev database) and truncate
their own tables before/after each suite, so they're safe to re-run
repeatedly. Covers: database connectivity, every schema constraint (unique,
foreign key, check, cascade-delete), the repository layer's CRUD methods,
and the Express app's health/404/security-header behavior via real HTTP
requests.

## What's intentionally NOT here yet

Group/expense/balance/settlement API routes, invitation emails, real email
delivery, frontend login integration, OAuth, password authentication, or
JWTs (see "Authentication" below for why sessions were chosen over JWTs).
The existing `localStorage`-based frontend is completely untouched and
unaware this backend exists.

---

## Authentication (Phase 5.2)

Passwordless magic-link authentication with server-side sessions. No
passwords, no JWTs — sessions are opaque tokens looked up against a
PostgreSQL table, which makes instant revocation (logout, "log out
everywhere") trivial in a way stateless JWTs are not.

### How it works

1. `POST /api/auth/magic-link` with `{"email": "you@example.com"}`.
   A single-use, 256-bit random token is generated; only its SHA-256 hash
   is stored (in `auth_magic_links`, keyed by **email**, not `user_id` —
   the user account itself is only created at successful verification, so
   an email that requests a link but never clicks it never leaves a
   phantom user row behind). The response is always the same generic
   message regardless of whether the email has an account, to avoid
   account-enumeration.
2. **Development mode only** (`AUTH_EMAIL_MODE=development`, and only
   when `NODE_ENV` is not `production` — see the security note below),
   the response also includes `devMagicLink`, a ready-to-click URL, so you
   can test the whole flow with no real email provider. **No real email is
   ever sent in this phase.**
3. `GET /api/auth/verify?token=...` — hashes the supplied token and
   atomically marks it used only if it's currently unused and unexpired
   (a single `UPDATE ... WHERE used_at IS NULL AND expires_at > now()
   RETURNING *`, which is what makes single-use enforcement race-safe: two
   concurrent verification attempts for the same token can never both
   succeed). Finds-or-creates the user by email, creates a session, and
   sets the `et_session` HttpOnly cookie.
4. `GET /api/auth/me` (requires the cookie) returns `{authenticated, user}`
   or a `401` if there's no valid session.
5. `POST /api/auth/logout` revokes the current session and clears the
   cookie. The old cookie value stops working immediately — it isn't just
   deleted client-side, the server-side session row is marked revoked.

### Trying it locally

```bash
# 1. Request a link
curl -X POST http://localhost:3001/api/auth/magic-link \
  -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
# → {"message":"...", "devMagicLink":"http://localhost:3001/api/auth/verify?token=..."}

# 2. "Click" it (capture the cookie)
curl -c cookies.txt "http://localhost:3001/api/auth/verify?token=PASTE_TOKEN_HERE"

# 3. Call an authenticated endpoint
curl -b cookies.txt http://localhost:3001/api/auth/me

# 4. Log out
curl -b cookies.txt -X POST http://localhost:3001/api/auth/logout
```

### Sessions

`sessions` table: `id, user_id, token_hash, created_at, expires_at,
revoked_at, last_seen_at`. Only the hash of the session token is stored —
the raw token lives only in the HttpOnly cookie, never in the database or
in a log line. A user can hold multiple simultaneous sessions (one per
device/browser); revoking one never affects the others. Default lifetime
is 30 days from creation (`AUTH_SESSION_TTL_DAYS`), independent of
activity — there is no sliding-expiration/refresh mechanism in this phase.

### Cookie

Name `et_session` (`AUTH_COOKIE_NAME`). Always `HttpOnly` (never readable
from JavaScript — the frontend cannot and should not read this) and
`SameSite=Lax`. `Secure` defaults to `true` automatically when
`NODE_ENV=production`, and to `false` in development (so it works over
plain `http://localhost`) — override explicitly via `AUTH_COOKIE_SECURE`
only if you have a specific reason to.

### Environment variables (see `.env.example` for the full list with comments)

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_MAGIC_LINK_TTL_MINUTES` | 15 | How long a requested link stays valid |
| `AUTH_SESSION_TTL_DAYS` | 30 | How long a session stays valid from creation |
| `AUTH_EMAIL_MODE` | `development` | `development` exposes `devMagicLink`; **never set to `development` in a real deployment** |
| `AUTH_DEV_BASE_URL` | `http://localhost:3001` | Base URL used to build the dev-mode link |
| `AUTH_COOKIE_NAME` | `et_session` | Session cookie name |
| `AUTH_COOKIE_SECURE` | auto (`true` in production) | Override the cookie's `Secure` attribute |

### Development vs. production behavior

- **Development:** `devMagicLink` is returned in the API response so you
  can test without an email provider. Cookie is not `Secure` by default
  (works over plain HTTP on localhost).
- **Production:** `devMagicLink` is **never** returned — this is
  double-gated in `authService.js` (requires *both*
  `AUTH_EMAIL_MODE === 'development'` *and* `NODE_ENV !== 'production'`),
  so a misconfigured `AUTH_EMAIL_MODE` alone can never leak a real token.
  Cookie is `Secure` by default (HTTPS only). `CORS_ORIGIN` must be
  explicitly set — there is no silent localhost fallback in production.
  **Real email delivery is not implemented in this phase** — shipping this
  to production as-is means no one can actually receive a magic link,
  since nothing sends the email yet. That integration is a later phase.

### Rate limiting

`POST /api/auth/magic-link` is rate-limited (5 requests per 15 minutes,
keyed by IP+email) by a small in-memory limiter
(`src/middleware/rateLimiter.js`). **This is explicitly not sufficient for
a real production deployment**: it's per-process, in-memory state, so it
resets on restart and doesn't share counters across multiple server
instances. It exists to establish the middleware boundary and prevent
trivial local abuse. A production deployment needs a shared store (Redis)
or a rate limiter enforced at the edge/proxy layer. `GET /api/auth/verify`
is deliberately not separately rate-limited — its 256-bit tokens make
brute-forcing a valid one infeasible regardless of request rate.

### CSRF

Cookie-based auth with `SameSite=Lax` already blocks most cross-site
CSRF vectors for this phase's endpoints: `POST /auth/logout` has no
sensitive side effect even in the worst case (an attacker could only log
the victim out), and `GET /auth/verify` doesn't rely on an existing
session to do its work (it creates one). **This is not yet a general CSRF
solution.** Once Phase 5.3+ adds real state-changing endpoints (creating
expenses, recording settlements, etc.), every mutating request behind
`requireAuth` needs an explicit CSRF token (e.g. double-submit cookie or
a custom header the frontend sets) before going to production —
`SameSite=Lax` alone is not a complete CSRF defense once real financial
mutations are involved.

### CORS

Reviewed and unchanged in mechanism from Phase 5.1, but now enforced more
strictly: `CORS_ORIGIN` is read from the environment as before, but in
production there is no fallback — an unset `CORS_ORIGIN` throws at
startup rather than silently defaulting. Never configured as `*`, since
`credentials: true` (required for cookies to be sent cross-origin) is
incompatible with a wildcard origin by browser spec.

### Security summary

- Tokens (magic-link and session) are 256-bit cryptographically random,
  generated via Node's `crypto.randomBytes`.
- Only SHA-256 hashes are ever persisted — raw tokens exist only in the
  generated URL or the HttpOnly cookie, never in the database, never
  logged (verified by test).
- Single-use enforcement for magic links is race-safe (atomic
  `UPDATE...RETURNING`, not a check-then-update).
- Sessions are individually revocable; logout revokes exactly one session
  and never affects others for the same user.
- No account-enumeration: the magic-link request response is identical
  regardless of whether the email has an existing account.
- Every auth response is checked to confirm it never includes a raw
  token, a token hash, or any other internal field beyond
  `{id, email, displayName}`.

## Testing

```bash
npm test
```

60 tests across 5 suites: database connectivity, schema constraints
(Phase 5.1), repository CRUD (Phase 5.1), app-level HTTP behavior, and
authentication (31 tests — magic-link request/validation, email
normalization, hash-only token storage, expiration, single-use
enforcement, session creation/resolution/revocation, cookie attributes
(`HttpOnly`, `SameSite`, production `Secure` default), the
development/production dev-link gating, the `requireAuth` middleware
directly, database-level uniqueness constraints on both new tables,
multi-session-per-user independence, rate limiting, and a check that no
raw token ever appears in a log line).

