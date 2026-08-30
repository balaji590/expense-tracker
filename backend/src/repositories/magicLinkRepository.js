const db = require('../db/pool');

async function create({ email, tokenHash, expiresAt }){
  const result = await db.query(
    `INSERT INTO auth_magic_links (email, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, tokenHash, expiresAt]
  );
  return result.rows[0];
}

async function findByTokenHash(tokenHash){
  const result = await db.query('SELECT * FROM auth_magic_links WHERE token_hash = $1', [tokenHash]);
  return result.rows[0] || null;
}

// Atomically marks the link used ONLY if it's currently unused and unexpired,
// in a single UPDATE...RETURNING. This is what makes single-use enforcement
// race-safe: if two requests race to verify the same token, Postgres's row
// locking means only one UPDATE can match `used_at IS NULL` and win — the
// second necessarily sees used_at already set and returns no row.
async function consumeIfValid(tokenHash){
  const result = await db.query(
    `UPDATE auth_magic_links
     SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING *`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

module.exports = { create, findByTokenHash, consumeIfValid };
