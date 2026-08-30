const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const db = require('../src/db/pool');

describe('Database connectivity', () => {
  after(async () => {
    await db.close();
  });

  test('pool can execute a basic query', async () => {
    const result = await db.query('SELECT 1 + 1 AS sum');
    assert.equal(result.rows[0].sum, 2);
  });

  test('healthCheck() returns true when connected', async () => {
    const ok = await db.healthCheck();
    assert.equal(ok, true);
  });

  test('required Postgres extensions are installed', async () => {
    const result = await db.query(`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext')`);
    const names = result.rows.map(r => r.extname).sort();
    assert.deepEqual(names, ['citext', 'pgcrypto']);
  });

  test('gen_random_uuid() is callable', async () => {
    const result = await db.query('SELECT gen_random_uuid() AS id');
    assert.match(result.rows[0].id, /^[0-9a-f-]{36}$/i);
  });
});
