CREATE TABLE expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  amount_paise   BIGINT NOT NULL CHECK (amount_paise > 0),  -- integer paise, matching the frontend's balances.js convention
  date           DATE NOT NULL,
  category_id    TEXT NOT NULL,        -- categories remain a global, frontend-defined taxonomy — no FK table yet
  payment_method TEXT,
  notes          TEXT,
  tags           TEXT[] NOT NULL DEFAULT '{}',
  added_by       UUID NOT NULL REFERENCES users(id),  -- User identity — matches existing frontend convention
  paid_by        UUID NOT NULL REFERENCES users(id),  -- User identity — matches existing frontend convention
  split_type     TEXT NOT NULL CHECK (split_type IN ('none', 'equal', 'custom')) DEFAULT 'none',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_group_date ON expenses(group_id, date);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
