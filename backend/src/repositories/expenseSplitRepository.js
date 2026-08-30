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

async function deleteForExpense(expenseId){
  await db.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
}

module.exports = { createMany, listForExpense, deleteForExpense };
