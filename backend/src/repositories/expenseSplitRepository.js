const db = require('../db/pool');

async function createMany(expenseId, splits){
  // splits: [{groupMemberId, amountPaise}]. Inserted inside the caller's own
  // transaction when called alongside expense creation (service layer concern).
  const rows = [];
  for(const split of splits){
    const result = await db.query(
      `INSERT INTO expense_splits (expense_id, group_member_id, amount_paise)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [expenseId, split.groupMemberId, split.amountPaise]
    );
    rows.push(result.rows[0]);
  }
  return rows;
}

async function listForExpense(expenseId){
  const result = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expenseId]);
  return result.rows;
}

// Bulk variant of listForExpense — used by shared-expense listing (many
// expenses at once) to avoid an N+1 query pattern (one SELECT per expense).
// Returns a Map keyed by expense_id so callers can do a simple .get(id) per
// row with an empty-array fallback for expenses that have no splits.
async function listForExpenses(expenseIds){
  if(!expenseIds || expenseIds.length === 0) return new Map();
  const result = await db.query(
    'SELECT * FROM expense_splits WHERE expense_id = ANY($1::uuid[])',
    [expenseIds]
  );
  const map = new Map();
  for(const row of result.rows){
    if(!map.has(row.expense_id)) map.set(row.expense_id, []);
    map.get(row.expense_id).push(row);
  }
  return map;
}

async function deleteForExpense(expenseId){
  await db.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
}

module.exports = { createMany, listForExpense, listForExpenses, deleteForExpense };
