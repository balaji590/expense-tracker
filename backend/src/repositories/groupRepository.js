const db = require('../db/pool');

async function create({ name, type, createdBy }){
  const result = await db.query(
    `INSERT INTO groups (name, type, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, type, createdBy]
  );
  return result.rows[0];
}

async function findById(id){
  const result = await db.query('SELECT * FROM groups WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findPersonalGroupForUser(userId){
  const result = await db.query(
    `SELECT * FROM groups WHERE created_by = $1 AND type = 'personal' LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function listForUser(userId){
  const result = await db.query(
    `SELECT g.*, gm.role
     FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.user_id = $1 AND gm.removed_at IS NULL
     ORDER BY g.created_at`,
    [userId]
  );
  return result.rows;
}

async function rename(id, name){
  const result = await db.query(
    `UPDATE groups SET name = $2 WHERE id = $1 RETURNING *`,
    [id, name]
  );
  return result.rows[0] || null;
}

async function remove(id){
  // ON DELETE CASCADE on group_members/expenses/invitations/settlements
  // handles the cascade at the database level — no manual cleanup needed here.
  await db.query('DELETE FROM groups WHERE id = $1', [id]);
}

module.exports = { create, findById, findPersonalGroupForUser, listForUser, rename, remove };
