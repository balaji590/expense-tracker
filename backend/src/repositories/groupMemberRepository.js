const db = require('../db/pool');

async function create({ groupId, userId, role }){
  const result = await db.query(
    `INSERT INTO group_members (group_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [groupId, userId, role]
  );
  return result.rows[0];
}

async function findById(id){
  const result = await db.query('SELECT * FROM group_members WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function listForGroup(groupId, { includeRemoved = false } = {}){
  const clause = includeRemoved ? '' : 'AND removed_at IS NULL';
  const result = await db.query(
    `SELECT * FROM group_members WHERE group_id = $1 ${clause} ORDER BY joined_at`,
    [groupId]
  );
  return result.rows;
}

// Soft-delete only — never a hard DELETE. This is what preserves historical
// paidBy/split references after someone leaves a group (Phase 4 requirement).
async function softRemove(id){
  const result = await db.query(
    `UPDATE group_members SET removed_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { create, findById, listForGroup, softRemove };
