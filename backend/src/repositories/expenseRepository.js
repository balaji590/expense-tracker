const db = require('../db/pool');

async function create({ groupId, name, amountPaise, date, categoryId, paymentMethod, notes, tags, addedBy, paidBy, splitType }){
  const result = await db.query(
    `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, payment_method, notes, tags, added_by, paid_by, split_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [groupId, name, amountPaise, date, categoryId, paymentMethod || null, notes || null, tags || [], addedBy, paidBy, splitType || 'none']
  );
  return result.rows[0];
}

async function findById(id){
  const result = await db.query('SELECT * FROM expenses WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function listForGroupMonth(groupId, year, month){
  // Half-open date range — correct across month/year boundaries without
  // needing date-string formatting tricks.
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  const result = await db.query(
    `SELECT * FROM expenses WHERE group_id = $1 AND date >= $2 AND date < $3 ORDER BY date DESC`,
    [groupId, start, end]
  );
  return result.rows;
}

// All of a group's expenses, no month filter — used by the Personal expense
// API's GET /api/expenses, which mirrors localStorage's "give me everything"
// semantics (each page does its own month-filtering client-side).
async function listForGroup(groupId){
  const result = await db.query(
    'SELECT * FROM expenses WHERE group_id = $1 ORDER BY date DESC',
    [groupId]
  );
  return result.rows;
}

// Only these columns may ever be updated via update(). patch keys are used
// to build column names directly into the SQL text (not just parameter
// values) — without this whitelist, a caller that ever passed through
// unsanitized client input as patch keys would have a real SQL-injection
// surface. The service layer must build `patch` from known fields only;
// this is defense-in-depth in case that discipline is ever missed.
const UPDATABLE_COLUMNS = new Set([
  'name', 'amount_paise', 'date', 'category_id', 'payment_method', 'notes', 'tags'
]);

async function update(id, patch){
  const fields = [];
  const values = [];
  let i = 1;
  for(const [key, value] of Object.entries(patch)){
    if(!UPDATABLE_COLUMNS.has(key)){
      throw new Error(`Refusing to update non-whitelisted column: ${key}`);
    }
    fields.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }
  if(fields.length === 0){
    return findById(id);
  }
  fields.push(`updated_at = now()`);
  values.push(id);
  const result = await db.query(
    `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function remove(id){
  await db.query('DELETE FROM expenses WHERE id = $1', [id]);
}

module.exports = { create, findById, listForGroupMonth, listForGroup, update, remove };
