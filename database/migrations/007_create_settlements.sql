CREATE TABLE settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES users(id),
  to_user_id    UUID NOT NULL REFERENCES users(id),
  amount_paise  BIGINT NOT NULL CHECK (amount_paise > 0),
  date          DATE NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id != to_user_id)
);

CREATE INDEX idx_settlements_group ON settlements(group_id);
