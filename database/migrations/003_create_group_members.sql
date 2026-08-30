CREATE TABLE group_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ,             -- NULL = active. Never hard-deleted, matching the frontend's Phase 4 soft-delete.
  UNIQUE (group_id, user_id)
);

-- Partial indexes: the overwhelmingly common query is "active members of this
-- group" / "active groups for this user" — index only the rows that matter for that.
CREATE INDEX idx_group_members_group_active ON group_members(group_id) WHERE removed_at IS NULL;
CREATE INDEX idx_group_members_user_active ON group_members(user_id) WHERE removed_at IS NULL;
