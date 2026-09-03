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

// Same rows as listForGroup, but also brings back each member's email and
// display_name (joined from users). Before real invitations existed, every
// membership row belonged to the caller themselves, so the frontend never
// needed this — it always just showed "Me". Now that a group can have real
// OTHER members (Phase 5.6 invitations), the frontend needs a way to learn
// who they actually are in order to show correct Paid By / Added By
// attribution for shared expenses (Phase 5.7). Purely additive: listForGroup
// itself is untouched, and every existing caller keeps using it unchanged.
async function listForGroupWithUserInfo(groupId, { includeRemoved = false } = {}){
  const clause = includeRemoved ? '' : 'AND gm.removed_at IS NULL';
  const result = await db.query(
    `SELECT gm.*, u.email, u.display_name
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1 ${clause}
     ORDER BY gm.joined_at`,
    [groupId]
  );
  return result.rows;
}

module.exports = { create, findById, listForGroup, listForGroupWithUserInfo, softRemove };
