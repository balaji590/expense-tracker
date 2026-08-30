CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  token_hash    TEXT NOT NULL UNIQUE,   -- hash only — the raw session token lives only in the HttpOnly cookie
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,             -- NULL = active. Set on logout. Independent per-session (Phase 5.2 test: revoking one session never revokes another).
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
