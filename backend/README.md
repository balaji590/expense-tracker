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

79 tests across 6 suites: database connectivity, schema constraints
(Phase 5.1), repository CRUD (Phase 5.1), app-level HTTP behavior,
authentication (Phase 5.2, 31 tests), and the Personal expense API
(Phase 5.4, 23 tests — see below).

---

## Personal Expense API (Phase 5.4)

Proves the full authenticated path: **Frontend → ApiRepository → this
API → PostgreSQL**, for a single user's own Personal expenses only. No
groups, invitations, balances, or settlements are exposed via this API yet.

### Endpoints

All four require a valid session (the existing Phase 5.2 cookie) — there
is no separate auth mechanism for this API.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/expenses` | List the authenticated user's Personal expenses |
| POST | `/api/expenses` | Create a new Personal expense |
| PUT | `/api/expenses/:id` | Update one of the authenticated user's own expenses |
| DELETE | `/api/expenses/:id` | Delete one of the authenticated user's own expenses |

### Personal group

Every user gets exactly one Personal group, created idempotently the
moment they first verify a magic link (`groupService.ensurePersonalGroup`,
called from `authService.verifyMagicLink`). A database-level partial
unique index (`idx_groups_one_personal_per_user`, migration 010)
guarantees this at the schema level even under a concurrent-login race —
logging in 1 or 100 times never creates more than one Personal group.

### Authorization / IDOR protection

Every expense operation resolves the caller's **own** Personal group from
`req.user.id` (set by `requireAuth` from the session — never from any
client-supplied value). An expense that exists but belongs to a different
user's group is treated as **not found (404)**, never `403 Forbidden` —
this is deliberate: a 403 would confirm the expense exists and just isn't
yours, which is exactly the information an attacker probing IDs shouldn't
get. Verified directly by test: a second authenticated user attempting to
read, update, or delete another user's expense ID gets a clean 404 with
the victim's data completely unaffected.

### Data mapping

Amounts are stored as `amount_paise` (integer, matching the same
paise-exact convention `js/balances.js` already uses on the frontend) and
converted to/from rupees only at the API boundary. `category` is stored as
plain text (`category_id` column, no FK) — categories remain a
frontend-defined global taxonomy, unchanged from every prior phase.
`isDemo` is never part of the API shape — it's a purely local "seeded
sample data" concept that has no server-side meaning.

`id`, `createdAt`, and `updatedAt` are always server-authoritative — a
client-supplied value for any of these in a request body is silently
ignored, never trusted (verified by test).

### Frontend integration

`js/repositories/apiRepository.js` implements the same Repository
contract as `LocalRepository` (`init`, `getAll`, `save`, plus the
item-level `addItem`/`updateItem`/`removeItem` extension from Phase 5.4 —
see `js/repositories/repository.js` for why that extension exists). Only
the `et_expenses` key is API-backed; every other collection (categories,
budgets, recurring, groups, settlements, settings) still delegates to
`LocalRepository` untouched — this is a Personal-expenses-only
proof-of-concept, not a full cloud migration.

**One non-obvious mapping worth knowing about:** the server assigns a real
UUID for each user's Personal group and identity, but the entire existing
frontend codebase (`State.getExpensesForGroup`, `State.activeGroupId()`,
every page that checks `e.paidBy === Storage.PERSONAL_USER_ID`) compares
against the fixed local constants `'group_personal'`/`'user_local'`.
`ApiRepository` maps every expense coming back from the server — rewriting
`groupId`/`addedBy`/`paidBy` to those local constants — so the rest of the
frontend never needs to know or care that a real UUID exists underneath.
This is exactly the kind of API-DTO-to-frontend-shape mapping this phase
asked to keep in the repository layer, out of any page.

### Enabling API mode

There is no build step, so "environment configuration" for the frontend
is a small runtime override (see `js/config.js`) — **always defaults to
local mode**:

```js
// In the browser console, or via localStorage directly:
localStorage.setItem('et_repository_mode', 'api');
localStorage.setItem('et_api_base_url', 'http://localhost:3001/api'); // optional, this is the default
location.reload();
```

To switch back: `localStorage.setItem('et_repository_mode', 'local')`.

**localStorage is never touched by this switch** — existing local data is
neither uploaded nor deleted. API mode simply starts reading/writing
Personal expenses through the server instead; every other collection
still reads from the same localStorage it always has.

### Getting a session (no Login UI yet)

This phase deliberately has no login page. To obtain a session for manual
testing:

```bash
curl -X POST http://localhost:3001/api/auth/magic-link \
  -H "Content-Type: application/json" -d '{"email":"you@example.com"}'
# → devMagicLink in the response (development mode only)

curl -c cookies.txt "http://localhost:3001/api/auth/verify?token=PASTE_TOKEN_HERE"
```

If testing through an actual browser (not curl) so the frontend can use
the cookie, open the `devMagicLink` URL directly in the same browser
you'll load the frontend in — the cookie is scoped to whichever origin
served it.

### Running the full stack locally

```bash
# Terminal 1 — backend
cd backend && npm start          # http://localhost:3001

# Terminal 2 — frontend (needs a real HTTP origin, not file://, for
# cookies/CORS to work correctly — file:// requests send a null Origin
# that the backend's CORS policy correctly rejects)
cd .. && python3 -m http.server 8080   # http://localhost:8080
```

Make sure `backend/.env`'s `CORS_ORIGIN` matches whatever origin you serve
the frontend from (defaults to `http://localhost:8080`).

### What's NOT here yet

Group API, invitations, shared-expense sync, balances/settlements API,
budgets/recurring/analytics API, a real Login UI, automatic localStorage
migration, offline sync, WebSockets — all explicitly deferred to later
phases, per the Phase 5.4 scope boundary.


