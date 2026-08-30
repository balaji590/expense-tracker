CREATE TABLE expense_splits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id       UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  group_member_id  UUID NOT NULL REFERENCES group_members(id),  -- GroupMember identity, NOT User — matches existing convention
  amount_paise     BIGINT NOT NULL CHECK (amount_paise >= 0)
);

CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);
CREATE INDEX idx_expense_splits_member ON expense_splits(group_member_id);
