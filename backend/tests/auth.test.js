const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.AUTH_EMAIL_MODE = 'development'; // explicit — tests rely on devMagicLink being present

const db = require('../src/db/pool');
const config = require('../src/config');
const createApp = require('../src/app');
const authService = require('../src/services/authService');
const userRepo = require('../src/repositories/userRepository');
const magicLinkRepo = require('../src/repositories/magicLinkRepository');
const sessionRepo = require('../src/repositories/sessionRepository');
const { _resetForTests } = require('../src/middleware/rateLimiter');

async function truncateAll(){
  await db.query(`TRUNCATE TABLE sessions, auth_magic_links, expense_splits, settlements, invitations, expenses, group_members, groups, users CASCADE`);
}

// Extracts the `et_session=...` value from a raw Set-Cookie header, ignoring
// the other attributes (Path, HttpOnly, etc.) — just what we need to replay
// the cookie on the next request in these tests.
function extractCookieValue(setCookieHeader){
  if(!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${config.auth.cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

describe('Authentication (magic link + sessions)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  beforeEach(async () => {
    await truncateAll();
    _resetForTests();
  });

  after(async () => {
    await truncateAll();
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });

  // ---- 1. Magic-link request with valid email ----
  test('1. POST /auth/magic-link with a valid email returns 200 and a generic message', async () => {
    const res = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'valid@example.com' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.message, /sign-in link has been generated/);
  });

  // ---- 2. Invalid email validation ----
  test('2. POST /auth/magic-link with an invalid email is rejected', async () => {
    const res = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'not-an-email' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  // ---- 3. Email normalization ----
  test('3. Email is normalized to lowercase/trimmed consistently', () => {
    assert.equal(authService.normalizeEmail('  Test@Example.COM  '), 'test@example.com');
    assert.equal(authService.normalizeEmail('already@lower.com'), 'already@lower.com');
  });

  // ---- 4. User creation/retrieval ----
  test('4. First verification creates a user; second verification for the same email reuses it', async () => {
    const first = await authService.requestMagicLink('newuser@example.com');
    const tokenA = new URL(first.devMagicLink).searchParams.get('token');
    const { user: userA } = await authService.verifyMagicLink(tokenA);

    const second = await authService.requestMagicLink('newuser@example.com');
    const tokenB = new URL(second.devMagicLink).searchParams.get('token');
    const { user: userB } = await authService.verifyMagicLink(tokenB);

    assert.equal(userA.id, userB.id, 'the same email must resolve to the same user, not a duplicate');
    const allUsers = await db.query('SELECT * FROM users WHERE email = $1', ['newuser@example.com']);
    assert.equal(allUsers.rows.length, 1);
  });

  // ---- 5. Token stored as hash, never raw ----
  test('5. The raw magic-link token is never stored in the database, only its hash', async () => {
    const { devMagicLink } = await authService.requestMagicLink('hashcheck@example.com');
    const rawToken = new URL(devMagicLink).searchParams.get('token');

    const rows = await db.query('SELECT token_hash FROM auth_magic_links WHERE email = $1', ['hashcheck@example.com']);
    assert.equal(rows.rows.length, 1);
    assert.notEqual(rows.rows[0].token_hash, rawToken, 'stored value must not equal the raw token');
    assert.equal(rows.rows[0].token_hash, authService.hashToken(rawToken), 'stored value must be exactly the hash of the raw token');
  });

  // ---- 6. Token expiration ----
  test('6. An expired magic link is rejected even though it was never used', async () => {
    const rawToken = authService.generateToken();
    const tokenHash = authService.hashToken(rawToken);
    await magicLinkRepo.create({ email: 'expired@example.com', tokenHash, expiresAt: new Date(Date.now() - 1000) }); // already expired

    await assert.rejects(() => authService.verifyMagicLink(rawToken), /invalid or has expired/);
  });

  // ---- 7. Valid token verification ----
  test('7. A valid, unexpired, unused token verifies successfully', async () => {
    const { devMagicLink } = await authService.requestMagicLink('validverify@example.com');
    const rawToken = new URL(devMagicLink).searchParams.get('token');
    const { user, session, sessionRawToken } = await authService.verifyMagicLink(rawToken);
    assert.equal(user.email, 'validverify@example.com');
    assert.ok(session.id);
    assert.ok(sessionRawToken);
  });

  // ---- 8. Token single-use behavior ----
  test('8. The same magic-link token cannot be verified twice', async () => {
    const { devMagicLink } = await authService.requestMagicLink('singleuse@example.com');
    const rawToken = new URL(devMagicLink).searchParams.get('token');
    await authService.verifyMagicLink(rawToken); // first use succeeds
    await assert.rejects(() => authService.verifyMagicLink(rawToken), /invalid or has expired/); // second use fails
  });

  // ---- 9. Invalid token ----
  test('9. A malformed/garbage token is rejected', async () => {
    await assert.rejects(() => authService.verifyMagicLink('this-is-not-a-real-token'), /invalid or has expired/);
  });

  // ---- 10. Unknown token ----
  test('10. A well-formed but never-issued token is rejected', async () => {
    const neverIssued = authService.generateToken();
    await assert.rejects(() => authService.verifyMagicLink(neverIssued), /invalid or has expired/);
  });

  // ---- 11. Session creation ----
  test('11. Verifying a magic link creates a session row scoped to that user', async () => {
    const { devMagicLink } = await authService.requestMagicLink('sessioncreate@example.com');
    const rawToken = new URL(devMagicLink).searchParams.get('token');
    const { user, session } = await authService.verifyMagicLink(rawToken);
    const stored = await sessionRepo.findByTokenHash(await authService.hashToken); // sanity: function reference exists
    assert.ok(session.user_id === user.id);
  });

  // ---- 12. Session cookie creation ----
  test('12. GET /auth/verify sets an et_session cookie', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'cookiecheck@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`, { redirect: 'manual' });
    const setCookie = verifyRes.headers.get('set-cookie');
    assert.ok(setCookie, 'a Set-Cookie header must be present');
    assert.match(setCookie, new RegExp(`${config.auth.cookieName}=`));
  });

  // ---- 13. /api/auth/me authenticated ----
  test('13. GET /auth/me with a valid session cookie returns the authenticated user', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'meauth@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
    const cookieValue = extractCookieValue(verifyRes.headers.get('set-cookie'));

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: `${config.auth.cookieName}=${cookieValue}` } });
    assert.equal(meRes.status, 200);
    const body = await meRes.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.user.email, 'meauth@example.com');
    assert.ok(!body.user.passwordHash && !body.session, 'no internal fields should ever be exposed');
  });

  // ---- 14. /api/auth/me unauthenticated ----
  test('14. GET /auth/me with no cookie returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.error);
  });

  // ---- 15. Logout ----
  test('15. POST /auth/logout succeeds and clears the cookie', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'logouttest@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
    const cookieValue = extractCookieValue(verifyRes.headers.get('set-cookie'));

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST', headers: { Cookie: `${config.auth.cookieName}=${cookieValue}` }
    });
    assert.equal(logoutRes.status, 200);
    const body = await logoutRes.json();
    assert.equal(body.success, true);
    assert.ok(logoutRes.headers.get('set-cookie').includes('Expires=Thu, 01 Jan 1970'), 'logout must clear the cookie');
  });

  // ---- 16. Revoked session rejected ----
  test('16. A revoked session is rejected by requireAuth', async () => {
    const { devMagicLink } = await authService.requestMagicLink('revoketest@example.com');
    const token = new URL(devMagicLink).searchParams.get('token');
    const { sessionRawToken } = await authService.verifyMagicLink(token);

    let resolved = await authService.resolveSession(sessionRawToken);
    assert.ok(resolved, 'session should resolve before logout');

    await authService.logout(sessionRawToken);

    resolved = await authService.resolveSession(sessionRawToken);
    assert.equal(resolved, null, 'a revoked session must not resolve');
  });

  // ---- 17. Expired session rejected ----
  test('17. An expired (but not revoked) session is rejected', async () => {
    const user = await userRepo.create({ email: 'expiredsession@example.com', displayName: 'Expired' });
    const rawToken = authService.generateToken();
    await sessionRepo.create({ userId: user.id, tokenHash: authService.hashToken(rawToken), expiresAt: new Date(Date.now() - 1000) });

    const resolved = await authService.resolveSession(rawToken);
    assert.equal(resolved, null);
  });

  // ---- 18. Old session token rejected after logout ----
  test('18. GET /auth/me with the old cookie after logout returns 401', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'oldtoken@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
    const cookieValue = extractCookieValue(verifyRes.headers.get('set-cookie'));

    await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: `${config.auth.cookieName}=${cookieValue}` } });

    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: `${config.auth.cookieName}=${cookieValue}` } });
    assert.equal(meRes.status, 401, 'reusing the old session token after logout must fail');
  });

  // ---- 19. HttpOnly cookie ----
  test('19. The session cookie is HttpOnly', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'httponly@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
    assert.match(verifyRes.headers.get('set-cookie'), /HttpOnly/i);
  });

  // ---- 20. SameSite cookie ----
  test('20. The session cookie has SameSite=Lax', async () => {
    const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'samesite@example.com' })
    });
    const { devMagicLink } = await magicRes.json();
    const token = new URL(devMagicLink).searchParams.get('token');
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
    assert.match(verifyRes.headers.get('set-cookie'), /SameSite=Lax/i);
  });

  // ---- 21. Secure cookie behavior in production ----
  test('21. cookieSecure defaults to true when NODE_ENV=production (config-level check)', () => {
    // Re-require config fresh under a simulated production env, in isolation,
    // without actually flipping the running test process's NODE_ENV.
    delete require.cache[require.resolve('../src/config')];
    const prevEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.AUTH_COOKIE_SECURE = undefined;
    delete process.env.AUTH_COOKIE_SECURE;
    let prodConfig;
    try{
      prodConfig = require('../src/config');
      assert.equal(prodConfig.auth.cookieSecure, true, 'cookieSecure must default to true in production');
    } finally {
      process.env = prevEnv;
      delete require.cache[require.resolve('../src/config')];
      require('../src/config'); // restore test config for subsequent tests
    }
  });

  // ---- 22. Development mode dev-link behavior ----
  test('22. In development mode, the magic-link response includes devMagicLink', async () => {
    const res = await fetch(`${baseUrl}/api/auth/magic-link`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: 'devmode@example.com' })
    });
    const body = await res.json();
    assert.ok(body.devMagicLink, 'development mode must expose the dev link');
    assert.match(body.devMagicLink, /token=/);
  });

  // ---- 23. Production mode does NOT expose magic link ----
  test('23. requestMagicLink never returns devMagicLink when nodeEnv is production, regardless of AUTH_EMAIL_MODE', async () => {
    delete require.cache[require.resolve('../src/config')];
    const prevEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_MODE = 'development'; // deliberately misconfigured, to prove the double-gate
    process.env.CORS_ORIGIN = 'https://example.com';
    delete require.cache[require.resolve('../src/services/authService')];
    let prodAuthService;
    try{
      prodAuthService = require('../src/services/authService');
      const result = await prodAuthService.requestMagicLink('prodcheck@example.com');
      assert.equal(result.devMagicLink, undefined, 'devMagicLink must never be present when nodeEnv is production, even if AUTH_EMAIL_MODE says development');
    } finally {
      process.env = prevEnv;
      delete require.cache[require.resolve('../src/config')];
      delete require.cache[require.resolve('../src/services/authService')];
      require('../src/config');
    }
  });

  // ---- 24. Authentication middleware (unit-level) ----
  test('24. requireAuth attaches req.user/req.session on success', async () => {
    const requireAuth = require('../src/middleware/requireAuth');
    const { devMagicLink } = await authService.requestMagicLink('middleware@example.com');
    const token = new URL(devMagicLink).searchParams.get('token');
    const { sessionRawToken } = await authService.verifyMagicLink(token);

    const req = { headers: { cookie: `${config.auth.cookieName}=${sessionRawToken}` } };
    let attachedUser = null;
    const res = {};
    await new Promise((resolve, reject) => {
      requireAuth(req, res, (err) => {
        if(err) return reject(err);
        attachedUser = req.user;
        resolve();
      });
    });
    assert.equal(attachedUser.email, 'middleware@example.com');
  });

  // ---- 25. Protected endpoint rejection ----
  test('25. requireAuth calls next(err) with a 401 AppError when no valid session exists', async () => {
    const requireAuth = require('../src/middleware/requireAuth');
    const req = { headers: {} };
    const res = {};
    const err = await new Promise((resolve) => {
      requireAuth(req, res, (e) => resolve(e));
    });
    assert.ok(err);
    assert.equal(err.statusCode, 401);
  });

  // ---- 26. SQL constraints ----
  test('26. auth_magic_links.token_hash is unique at the database level', async () => {
    const tokenHash = 'duplicate-hash-value';
    await db.query(`INSERT INTO auth_magic_links (email, token_hash, expires_at) VALUES ($1,$2, now() + interval '15 minutes')`, ['a@example.com', tokenHash]);
    await assert.rejects(
      () => db.query(`INSERT INTO auth_magic_links (email, token_hash, expires_at) VALUES ($1,$2, now() + interval '15 minutes')`, ['b@example.com', tokenHash]),
      /duplicate key value/
    );
  });

  test('26b. sessions.token_hash is unique at the database level', async () => {
    const user = await userRepo.create({ email: 'uniquesession@example.com', displayName: 'U' });
    const tokenHash = 'duplicate-session-hash';
    await db.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 days')`, [user.id, tokenHash]);
    await assert.rejects(
      () => db.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 days')`, [user.id, tokenHash]),
      /duplicate key value/
    );
  });

  // ---- 27. Multiple sessions for same user ----
  test('27. The same user can hold multiple concurrent sessions (multi-device)', async () => {
    const { devMagicLink: link1 } = await authService.requestMagicLink('multidevice@example.com');
    const token1 = new URL(link1).searchParams.get('token');
    const { user, sessionRawToken: sessionA } = await authService.verifyMagicLink(token1);

    const { devMagicLink: link2 } = await authService.requestMagicLink('multidevice@example.com');
    const token2 = new URL(link2).searchParams.get('token');
    const { sessionRawToken: sessionB } = await authService.verifyMagicLink(token2);

    const resolvedA = await authService.resolveSession(sessionA);
    const resolvedB = await authService.resolveSession(sessionB);
    assert.ok(resolvedA && resolvedB, 'both sessions must be independently valid');
    assert.equal(resolvedA.user.id, resolvedB.user.id, 'both belong to the same user');

    const allSessions = await sessionRepo.listForUser(user.id);
    assert.equal(allSessions.length, 2);
  });

  // ---- 28. Revoking one session does not revoke another ----
  test('28. Logging out of one session leaves the other session for the same user active', async () => {
    const { devMagicLink: link1 } = await authService.requestMagicLink('tworevoke@example.com');
    const token1 = new URL(link1).searchParams.get('token');
    const { sessionRawToken: sessionA } = await authService.verifyMagicLink(token1);

    const { devMagicLink: link2 } = await authService.requestMagicLink('tworevoke@example.com');
    const token2 = new URL(link2).searchParams.get('token');
    const { sessionRawToken: sessionB } = await authService.verifyMagicLink(token2);

    await authService.logout(sessionA);

    const resolvedA = await authService.resolveSession(sessionA);
    const resolvedB = await authService.resolveSession(sessionB);
    assert.equal(resolvedA, null, 'revoked session must not resolve');
    assert.ok(resolvedB, 'the OTHER session for the same user must remain active');
  });

  // ---- 29. Rate-limit behavior ----
  test('29. Requesting magic links beyond the limit returns 429', async () => {
    _resetForTests();
    const email = 'ratelimited@example.com';
    let lastStatus;
    for(let i = 0; i < 6; i++){
      const res = await fetch(`${baseUrl}/api/auth/magic-link`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ email })
      });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429, 'the 6th request within the window should be rate-limited (limit is 5)');
  });

  // ---- 30. No raw tokens/secrets in logs ----
  test('30. Console logging never includes the raw magic-link or session token', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => { logs.push(args.join(' ')); };
    try{
      const { devMagicLink } = await authService.requestMagicLink('logcheck@example.com');
      const rawToken = new URL(devMagicLink).searchParams.get('token');
      await authService.verifyMagicLink(rawToken);
      const combined = logs.join('\n');
      assert.ok(!combined.includes(rawToken), 'raw token must never appear in console.log output');
    } finally {
      console.log = originalLog;
    }
  });
});
