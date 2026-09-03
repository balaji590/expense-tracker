// Maps a DB row (snake_case, amount_paise) to the API response shape that
// mirrors the frontend's Expense fields.
//
// `splits` is an optional array of raw expense_splits rows (group_member_id,
// amount_paise). Personal expenses never have splits (Phase 5.4) and every
// existing call site for them calls toDto(row) with no second argument, so
// omitting it still yields splits: [] exactly as before — this extension is
// backward compatible, not a breaking change to the Personal expense API.
// Shared expenses (Phase 5.7) pass their expense_splits rows through here so
// the API response's splits use the same {memberId, amount} shape the
// frontend already builds and reads (js/pages/expenses.js), keyed by
// GroupMember.id (NOT User.id) exactly like the existing DB/frontend convention.
// isDemo is deliberately never present — it's a purely local/frontend
// "seeded sample data" flag, not a real persisted concept.
function toDto(row, splits){
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount_paise) / 100,
    date: new Date(row.date).toISOString(),
    category: row.category_id,
    paymentMethod: row.payment_method || '',
    notes: row.notes || '',
    tags: row.tags || [],
    groupId: row.group_id,
    addedBy: row.added_by,
    paidBy: row.paid_by,
    splitType: row.split_type,
    splits: (splits || []).map(s => ({
      memberId: s.group_member_id,
      amount: Number(s.amount_paise) / 100
    })),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  };
}

module.exports = { toDto };
