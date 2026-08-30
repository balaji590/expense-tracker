CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  invited_email CITEXT NOT NULL,
  invited_by    UUID NOT NULL REFERENCES users(id),
  token_hash    TEXT NOT NULL UNIQUE,   -- hash only; the raw token is never stored (Phase 5 security design)
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')) DEFAULT 'pending',
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ
);

CREATE INDEX idx_invitations_email_status ON invitations(invited_email, status);

-- At most one PENDING invitation per (group, email) at a time — a second
-- invite attempt should update/resend the existing row, never create a duplicate.
CREATE UNIQUE INDEX idx_invitations_one_pending ON invitations(group_id, invited_email)
  WHERE status = 'pending';
