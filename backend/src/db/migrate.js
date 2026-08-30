/*
 * Minimal migration runner — no external migration framework, per the
 * "avoid unnecessary dependencies" instruction. Applies every .sql file in
 * database/migrations/ in filename order, recording each one in a
 * schema_migrations table so re-running this script is always safe
 * (already-applied files are skipped, never re-run).
 *
 * Usage: node src/db/migrate.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../config');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

async function ensureMigrationsTable(pool){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename     TEXT PRIMARY KEY,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(pool){
  const result = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(result.rows.map(r => r.filename));
}

async function runMigrations(){
  const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password
  });

  try{
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // filenames are zero-padded/prefixed, so lexical sort == intended order

    let appliedCount = 0;
    for(const file of files){
      if(applied.has(file)){
        console.log(`skip   ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`applied ${file}`);
        appliedCount++;
      }catch(err){
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
      }finally{
        client.release();
      }
    }

    console.log(appliedCount === 0 ? 'Database already up to date.' : `Applied ${appliedCount} migration(s).`);
  } finally {
    await pool.end();
  }
}

if(require.main === module){
  runMigrations().catch(err => {
    console.error('Migration run failed:', err.message);
    process.exit(1);
  });
}

module.exports = { runMigrations };
