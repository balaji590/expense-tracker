const db = require('../db/pool');

async function create({ groupId, invitedEmail, invitedBy, tokenHash, expiresAt }){
  const result = await db.query(
    `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [groupId, invitedEmail, invitedBy, tokenHash, expiresAt]
  );
  return result.rows[0];
}

async function findByTokenHash(tokenHash){
  const result = await db.query('SELECT * FROM invitations WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

async function findPending(groupId, invitedEmail){
  const result = await db.query(
    `SELECT * FROM invitations WHERE group_id = $1 AND invited_email = $2 AND status = 'pending'`,
    [groupId, invitedEmail]
  );
  return result.rows[0] || null;
}

async function markAccepted(id){
  const result = await db.query(
    `UPDATE invitations SET status = 'accepted', accepted_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

async function markRevoked(id){
  const result = await db.query(
    `UPDATE invitations SET status = 'revoked' WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { create, findByTokenHash, findPending, markAccepted, markRevoked };
