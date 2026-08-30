const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const createApp = require('../src/app');
const db = require('../src/db/pool');

describe('Express app', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    server = app.listen(0); // OS-assigned free port, avoids clashing with a real dev server
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address();
    baseUrl = `http://localhost:${port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });

  test('GET /api/health returns 200 and reports the database as connected', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.database, 'connected');
    assert.ok(body.timestamp);
  });

  test('GET /api/does-not-exist returns 404 with a clear error body', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /No route/);
  });

  test('security headers are present (helmet)', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.ok(res.headers.get('x-content-type-options'), 'helmet should set X-Content-Type-Options');
    assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By should be removed');
  });
});
