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

No authentication, sessions, or invitation emails (Phase 5.2+). No API
routes beyond `/api/health` — the repository layer exists and is tested,
but isn't yet wired to any business-logic routes. No frontend changes of
any kind — the existing `localStorage`-based app is completely untouched
and unaware this backend exists.
