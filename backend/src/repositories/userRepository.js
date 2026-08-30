const db = require('../db/pool');

async function create({ email, displayName, passwordHash = null }){
  const result = await db.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, displayName, passwordHash]
  );
  return result.rows[0];
}

async function findById(id){
  const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function findByEmail(email){
  const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

module.exports = { create, findById, findByEmail };
