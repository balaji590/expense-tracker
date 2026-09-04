const db = require('../db/pool');

async function create({ groupId, fromUserId, toUserId, amountPaise, date, note, createdBy }){
  const result = await db.query(
    `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_paise, date, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [groupId, fromUserId, toUserId, amountPaise, date, note || null, createdBy]
  );
  return result.rows[0];
}

async function listForGroup(groupId){
  const result = await db.query(
    'SELECT * FROM settlements WHERE group_id = $1 ORDER BY date DESC',
    [groupId]
  );
  return result.rows;
}

module.exports = { create, listForGroup };
