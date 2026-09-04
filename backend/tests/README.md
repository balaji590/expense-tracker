# Backend tests

## Why `npm test` runs with `--test-concurrency=1`

Every test file in this folder truncates shared PostgreSQL tables (`users`,
`groups`, `group_members`, `expenses`, `settlements`, etc.) in its
`before`/`beforeEach` hooks, against the *same* database (`TEST_DB_NAME`).

Node's built-in test runner (`node --test`) runs separate test **files**
concurrently by default (up to `os.availableParallelism()` — i.e. your CPU
core count). On a machine with more than one core, two test files' `TRUNCATE
... CASCADE` calls can genuinely overlap in time, which causes:

- PostgreSQL deadlocks (`deadlock detected`, error code `40P01`), and/or
- one file wiping out a user/group that another file just created moments
  earlier (surfacing as confusing errors like `Cannot read properties of
  undefined (reading 'id')` in `loginAs`, or foreign-key violations like
  `groups_created_by_fkey` pointing at a user that "isn't in the users
  table" — it *was*, until a concurrent file's truncate removed it).

This is why `package.json`'s `test` script explicitly passes
`--test-concurrency=1`: it forces test **files** to run one at a time, so
each file's truncate-then-seed sequence never overlaps with another file's.
Tests *within* a single file still run in their normal declared order via
`describe`/`test`, so this has no effect on per-file test structure — only
on which files can execute at the same moment as each other.

If you ever see intermittent deadlocks or "phantom missing row" errors while
running the suite, check that this flag hasn't been dropped from the `test`
script before assuming it's an application bug.
