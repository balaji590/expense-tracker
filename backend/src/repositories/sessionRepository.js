const db = require('../db/pool');

async function create({ userId, tokenHash, expiresAt }){
  const result = await db.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
}

// Only returns a session that is neither revoked nor expired — callers never
// need to re-check those conditions themselves.
async function findActiveByTokenHash(tokenHash){
  const result = await db.query(
    `SELECT * FROM sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

async function findByTokenHash(tokenHash){
  const result = await db.query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

async function listForUser(userId){
  const result = await db.query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at', [userId]);
  return result.rows;
}

async function touchLastSeen(id){
  await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id]);
}

// Revokes exactly one session by its own token — never touches any other
// session for the same user (verified explicitly in tests).
async function revokeByTokenHash(tokenHash){
  const result = await db.query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING *`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

module.exports = { create, findActiveByTokenHash, findByTokenHash, listForUser, touchLastSeen, revokeByTokenHash };
