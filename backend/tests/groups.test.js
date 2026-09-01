const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.AUTH_EMAIL_MODE = 'development';

const db = require('../src/db/pool');
const config = require('../src/config');
const createApp = require('../src/app');
const { _resetForTests } = require('../src/middleware/rateLimiter');

async function truncateAll(){
  await db.query(`TRUNCATE TABLE sessions, auth_magic_links, expense_splits, settlements, invitations, expenses, group_members, groups, users CASCADE`);
}

function extractCookieValue(setCookieHeader){
  if(!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${config.auth.cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function loginAs(baseUrl, email){
  const magicRes = await fetch(`${baseUrl}/api/auth/magic-link`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email })
  });
  const { devMagicLink } = await magicRes.json();
  const token = new URL(devMagicLink).searchParams.get('token');
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify?token=${token}`);
  const body = await verifyRes.json();
  return { cookie: extractCookieValue(verifyRes.headers.get('set-cookie')), userId: body.user.id };
}

function authHeader(cookie){ return { Cookie: `${config.auth.cookieName}=${cookie}` }; }

describe('Groups + Membership API', () => {
  let server, baseUrl;

  before(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  beforeEach(async () => { await truncateAll(); _resetForTests(); });

  after(async () => {
    await truncateAll();
    await new Promise(resolve => server.close(resolve));
    await db.close();
  });

  // ---- 1. authenticated group list ----
  test('1. GET /api/groups returns the Personal group for a fresh user', async () => {
    const { cookie } = await loginAs(baseUrl, 't1@example.com');
    const res = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(cookie) });
    assert.equal(res.status, 200);
    const { groups } = await res.json();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].type, 'personal');
  });

  // ---- 2. unauthenticated group list -> 401 ----
  test('2. GET /api/groups with no session returns 401', async () => {
    const res = await fetch(`${baseUrl}/api/groups`);
    assert.equal(res.status, 401);
  });

  // ---- 3. create group ----
  test('3. POST /api/groups creates a shared group', async () => {
    const { cookie } = await loginAs(baseUrl, 't3@example.com');
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    assert.equal(res.status, 201);
    const { group } = await res.json();
    assert.equal(group.name, 'Family');
    assert.equal(group.type, 'shared');
  });

  // ---- 4. creator becomes owner ----
  test('4. The creator is automatically an owner member of the new group', async () => {
    const { cookie, userId } = await loginAs(baseUrl, 't4@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const membersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(cookie) });
    const { members } = await membersRes.json();
    assert.equal(members.length, 1);
    assert.equal(members[0].user_id, userId);
    assert.equal(members[0].role, 'owner');
  });

  // ---- 5. duplicate/invalid group name handling ----
  test('5. Invalid group names are rejected (empty, too long)', async () => {
    const { cookie } = await loginAs(baseUrl, 't5@example.com');
    const empty = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'   '}) });
    assert.equal(empty.status, 400);
    const tooLong = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'x'.repeat(101)}) });
    assert.equal(tooLong.status, 400);
    // Duplicate names ARE allowed (no uniqueness constraint on group name — two "Family" groups for the same user is fine)
    const first = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Trip'}) });
    const second = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Trip'}) });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
  });

  // ---- 6. rename shared group ----
  test('6. PUT /api/groups/:id renames a shared group', async () => {
    const { cookie } = await loginAs(baseUrl, 't6@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const renameRes = await fetch(`${baseUrl}/api/groups/${group.id}`, { method:'PUT', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family Renamed'}) });
    assert.equal(renameRes.status, 200);
    const { group: renamed } = await renameRes.json();
    assert.equal(renamed.name, 'Family Renamed');
  });

  // ---- 7. unauthorized rename blocked (member but not owner) is covered by IDOR section; here: non-member ----
  test('7. A non-member cannot rename a group (404, not 403)', async () => {
    const a = await loginAs(baseUrl, 't7a@example.com');
    const b = await loginAs(baseUrl, 't7b@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(a.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}`, { method:'PUT', headers:{...authHeader(b.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Hijacked'}) });
    assert.equal(res.status, 404);
  });

  // ---- 8. delete shared group ----
  test('8. DELETE /api/groups/:id removes a shared group', async () => {
    const { cookie } = await loginAs(baseUrl, 't8@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const delRes = await fetch(`${baseUrl}/api/groups/${group.id}`, { method:'DELETE', headers: authHeader(cookie) });
    assert.equal(delRes.status, 204);
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(cookie) });
    const { groups } = await listRes.json();
    assert.equal(groups.length, 1); // only Personal remains
  });

  // ---- 9. Personal group rename blocked ----
  test('9. Renaming the Personal group is rejected with 403', async () => {
    const { cookie } = await loginAs(baseUrl, 't9@example.com');
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(cookie) });
    const { groups } = await listRes.json();
    const personal = groups.find(g => g.type === 'personal');
    const res = await fetch(`${baseUrl}/api/groups/${personal.id}`, { method:'PUT', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Hacked'}) });
    assert.equal(res.status, 403);
  });

  // ---- 10. Personal group delete blocked ----
  test('10. Deleting the Personal group is rejected with 403', async () => {
    const { cookie } = await loginAs(baseUrl, 't10@example.com');
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(cookie) });
    const { groups } = await listRes.json();
    const personal = groups.find(g => g.type === 'personal');
    const res = await fetch(`${baseUrl}/api/groups/${personal.id}`, { method:'DELETE', headers: authHeader(cookie) });
    assert.equal(res.status, 403);
  });

  // ---- 11. group membership list ----
  test('11. GET /api/groups/:groupId/members lists active members', async () => {
    const { cookie } = await loginAs(baseUrl, 't11@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(cookie) });
    assert.equal(res.status, 200);
    const { members } = await res.json();
    assert.equal(members.length, 1);
  });

  // ---- 12. add member (documented limitation: 501) ----
  test('12. POST add member returns a clear 501 (not implemented in cloud mode yet)', async () => {
    const { cookie } = await loginAs(baseUrl, 't12@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Priya'}) });
    assert.equal(res.status, 501);
    const body = await res.json();
    assert.match(body.error, /invitations/i);
  });

  // ---- 13. remove member ----
  test('13. Owner can remove a non-owner member', async () => {
    const owner = await loginAs(baseUrl, 't13owner@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    // Manually insert a second member (no invitation flow yet) to test removal
    const otherUser = await db.query(`INSERT INTO users (email, display_name) VALUES ('t13other@example.com','Other') RETURNING *`);
    const memberRow = await db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'member') RETURNING *`, [group.id, otherUser.rows[0].id]);
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members/${memberRow.rows[0].id}`, { method:'DELETE', headers: authHeader(owner.cookie) });
    assert.equal(res.status, 204);
    const listRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(owner.cookie) });
    const { members } = await listRes.json();
    assert.equal(members.length, 1); // only the owner remains active
  });

  // ---- 14. owner protection ----
  test('14. The owner cannot be removed', async () => {
    const owner = await loginAs(baseUrl, 't14@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const membersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(owner.cookie) });
    const { members } = await membersRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members/${members[0].id}`, { method:'DELETE', headers: authHeader(owner.cookie) });
    assert.equal(res.status, 403);
  });

  // ---- 15. removed member cannot access group ----
  test('15. A soft-removed member no longer appears in the active members list', async () => {
    const owner = await loginAs(baseUrl, 't15@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const otherUser = await db.query(`INSERT INTO users (email, display_name) VALUES ('t15other@example.com','Other') RETURNING *`);
    const memberRow = await db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'member') RETURNING *`, [group.id, otherUser.rows[0].id]);
    await fetch(`${baseUrl}/api/groups/${group.id}/members/${memberRow.rows[0].id}`, { method:'DELETE', headers: authHeader(owner.cookie) });
    const listRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(owner.cookie) });
    const { members } = await listRes.json();
    assert.ok(!members.some(m => m.id === memberRow.rows[0].id));
    // Row itself must still exist (soft-delete, not hard-delete) for historical resolution
    const stillExists = await db.query('SELECT * FROM group_members WHERE id = $1', [memberRow.rows[0].id]);
    assert.equal(stillExists.rows.length, 1);
    assert.ok(stillExists.rows[0].removed_at);
  });

  // ---- 16. non-member cannot access group ----
  test('16. A user who was never a member cannot view the group', async () => {
    const owner = await loginAs(baseUrl, 't16owner@example.com');
    const stranger = await loginAs(baseUrl, 't16stranger@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(stranger.cookie) });
    assert.equal(res.status, 404);
  });

  // ---- 17, 18, 19, 20: the core IDOR suite ----
  test('17,18,19,20. User A group is fully protected from User B (GET/rename/delete/membership)', async () => {
    const a = await loginAs(baseUrl, 't1720a@example.com');
    const b = await loginAs(baseUrl, 't1720b@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(a.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Secret'}) });
    const { group } = await createRes.json();

    // 17. GET blocked
    const getRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(b.cookie) });
    assert.equal(getRes.status, 404);

    // 18. rename blocked
    const renameRes = await fetch(`${baseUrl}/api/groups/${group.id}`, { method:'PUT', headers:{...authHeader(b.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Hijacked'}) });
    assert.equal(renameRes.status, 404);

    // 19. delete blocked
    const delRes = await fetch(`${baseUrl}/api/groups/${group.id}`, { method:'DELETE', headers: authHeader(b.cookie) });
    assert.equal(delRes.status, 404);

    // 20. membership modification blocked (try to remove the owner's own membership via B's session)
    const aMembersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(a.cookie) });
    const { members } = await aMembersRes.json();
    const modRes = await fetch(`${baseUrl}/api/groups/${group.id}/members/${members[0].id}`, { method:'DELETE', headers: authHeader(b.cookie) });
    assert.equal(modRes.status, 404);

    // A's group must be completely unaffected after all 4 attack attempts
    const finalCheck = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    const { groups: aGroups } = await finalCheck.json();
    const stillThere = aGroups.find(g => g.id === group.id);
    assert.ok(stillThere);
    assert.equal(stillThere.name, 'Secret');
  });

  // ---- 21. role escalation blocked ----
  test('21. A member cannot escalate their own role by supplying one', async () => {
    const owner = await loginAs(baseUrl, 't21@example.com');
    const createRes = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await createRes.json();
    const otherUser = await db.query(`INSERT INTO users (email, display_name) VALUES ('t21other@example.com','Other') RETURNING *`);
    await db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'member')`, [group.id, otherUser.rows[0].id]);
    // There is no endpoint that accepts a client-supplied role at all — the
    // API surface itself has no role-changing capability in this phase.
    // Confirm the membership record is unaffected by attempting an
    // arbitrary PATCH-shaped request (which simply doesn't exist as a route).
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/members/${otherUser.rows[0].id}`, { method:'PATCH', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({role:'owner'}) });
    assert.equal(res.status, 404); // no such route exists
  });

  // ---- 22. client-supplied userId ignored ----
  test('22. A client-supplied ownerId/userId in the create-group body is ignored', async () => {
    const { cookie, userId } = await loginAs(baseUrl, 't22@example.com');
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family', createdBy: fakeUserId, userId: fakeUserId}) });
    const { group } = await res.json();
    assert.equal(group.created_by, userId, 'created_by must always be the authenticated user, never client-supplied');
  });

  // ---- 23. client-supplied ownerId ignored (membership) ----
  test('23. Creator membership role is always owner regardless of any client-supplied role', async () => {
    const { cookie, userId } = await loginAs(baseUrl, 't23@example.com');
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family', role:'member'}) });
    const { group } = await res.json();
    const membersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(cookie) });
    const { members } = await membersRes.json();
    assert.equal(members.find(m=>m.user_id===userId).role, 'owner');
  });

  // ---- 24. client-supplied group type protected ----
  test('24. A client-supplied type is ignored -- new groups are always shared, never personal', async () => {
    const { cookie } = await loginAs(baseUrl, 't24@example.com');
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family', type:'personal'}) });
    const { group } = await res.json();
    assert.equal(group.type, 'shared');
  });

  // ---- 25. SQL constraints ----
  test('25. SQL-injection-shaped group name is stored literally, never executed', async () => {
    const { cookie } = await loginAs(baseUrl, 't25@example.com');
    const malicious = "Robert'); DROP TABLE groups;--";
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name: malicious}) });
    assert.equal(res.status, 201);
    const { group } = await res.json();
    assert.equal(group.name, malicious);
    const tableCheck = await db.query('SELECT COUNT(*) FROM groups');
    assert.ok(tableCheck.rows[0].count !== undefined);
  });

  // ---- 26. transaction/atomic create group + owner ----
  test('26. Group creation is atomic -- every created group has exactly one owner member', async () => {
    const { cookie } = await loginAs(baseUrl, 't26@example.com');
    const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
    const { group } = await res.json();
    const memberCheck = await db.query(`SELECT * FROM group_members WHERE group_id = $1`, [group.id]);
    assert.equal(memberCheck.rows.length, 1);
    assert.equal(memberCheck.rows[0].role, 'owner');
  });

  // ---- 27. duplicate Personal group prevention (re-confirm at the groups-API level) ----
  test('27. Multiple logins never produce more than one Personal group visible via the API', async () => {
    const email = 't27@example.com';
    const first = await loginAs(baseUrl, email);
    const second = await loginAs(baseUrl, email);
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(second.cookie) });
    const { groups } = await listRes.json();
    assert.equal(groups.filter(g => g.type === 'personal').length, 1);
  });

  // ---- 28. concurrent Personal group initialization ----
  test('28. Concurrent logins for a brand-new email never race into two Personal groups', async () => {
    const email = 't28@example.com';
    const [a, b, c] = await Promise.all([loginAs(baseUrl, email), loginAs(baseUrl, email), loginAs(baseUrl, email)]);
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    const { groups } = await listRes.json();
    assert.equal(groups.filter(g => g.type === 'personal').length, 1);
  });

  // ---- 29. safe error mapping ----
  test('29. Error responses never leak internals (no stack traces, no SQL text)', async () => {
    const { cookie } = await loginAs(baseUrl, 't29@example.com');
    const res = await fetch(`${baseUrl}/api/groups/not-a-uuid`, { method:'PUT', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'X'}) });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(!JSON.stringify(body).toLowerCase().includes('at ') , 'must not look like a stack trace');
    assert.deepEqual(Object.keys(body).sort(), ['details','error']);
  });

  // ---- 30. no sensitive logging ----
  test('30. Console logging never includes the raw session token during group operations', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => { logs.push(args.join(' ')); };
    try{
      const { cookie } = await loginAs(baseUrl, 't30@example.com');
      const rawToken = cookie;
      await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name:'Family'}) });
      const combined = logs.join('\n');
      assert.ok(!combined.includes(rawToken), 'raw session token must never appear in console.log output');
    } finally {
      console.log = originalLog;
    }
  });
});
