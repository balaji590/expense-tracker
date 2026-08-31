-- Guarantees a user can never end up with two 'personal' groups, even under
-- concurrent requests (e.g. two near-simultaneous magic-link verifications
-- for a brand-new user). This is what lets ensurePersonalGroup() be safely
-- idempotent: on a race, one INSERT wins and the other fails this
-- constraint, and the caller just re-fetches the winning row.
CREATE UNIQUE INDEX idx_groups_one_personal_per_user ON groups(created_by)
  WHERE type = 'personal';
