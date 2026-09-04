-- Phase 5.8: settle-up.js allows the authenticated user to record a
-- settlement between any two OTHER group members (the "Paid by" / "Received
-- by" selects are not restricted to the caller themselves) -- so
-- from_user_id/to_user_id are the payer/payee, never a reliable stand-in for
-- who actually performed the action. created_by is the true audit identity,
-- always derived server-side from the authenticated session.
ALTER TABLE settlements ADD COLUMN created_by UUID REFERENCES users(id);

-- Backfill any pre-existing rows (none expected pre-launch, but this keeps
-- the migration safe to run against a database that already has data) by
-- assuming the payer recorded their own payment -- the closest available
-- approximation, since no real audit identity was ever captured before now.
UPDATE settlements SET created_by = from_user_id WHERE created_by IS NULL;

ALTER TABLE settlements ALTER COLUMN created_by SET NOT NULL;
