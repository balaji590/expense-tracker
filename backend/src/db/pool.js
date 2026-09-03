const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  // A background/idle client emitted an error (e.g. connection dropped).
  // Never let this crash the process silently swallowed elsewhere.
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params){
  return pool.query(text, params);
}

async function getClient(){
  return pool.connect();
}

async function healthCheck(){
  const result = await pool.query('SELECT 1 AS ok');
  return result.rows[0].ok === 1;
}

async function close(){
  await pool.end();
}

module.exports = { pool, query, getClient, healthCheck, close };
