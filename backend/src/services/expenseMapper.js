// Maps a DB row (snake_case, amount_paise) to the API response shape that
// mirrors the frontend's Expense fields. Personal expenses never have
// splits in this phase, so splits is always []. isDemo is deliberately
// never present — it's a purely local/frontend "seeded sample data" flag,
// not a real persisted concept.
function toDto(row){
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
    splits: [],
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined
  };
}

module.exports = { toDto };
