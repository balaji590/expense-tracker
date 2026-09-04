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
  return { cookie: extractCookieValue(verifyRes.headers.get('set-cookie')), userId: body.user.id, email };
}

function authHeader(cookie){ return { Cookie: `${config.auth.cookieName}=${cookie}` }; }

async function createGroup(baseUrl, cookie, name){
  const res = await fetch(`${baseUrl}/api/groups`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({name}) });
  const { group } = await res.json();
  return group;
}

function extractToken(devInvitationLink){
  return devInvitationLink.split('/invitations/')[1].split('/preview')[0];
}

async function inviteAndAccept(baseUrl, ownerCookie, groupId, inviteeEmail){
  const inviteRes = await fetch(`${baseUrl}/api/groups/${groupId}/invitations`, {
    method: 'POST', headers: {...authHeader(ownerCookie), 'Content-Type':'application/json'}, body: JSON.stringify({ email: inviteeEmail })
  });
  const inviteBody = await inviteRes.json();
  const token = extractToken(inviteBody.devInvitationLink);
  const invitee = await loginAs(baseUrl, inviteeEmail);
  const acceptRes = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method: 'POST', headers: authHeader(invitee.cookie) });
  assert.equal(acceptRes.status, 200, 'invitation accept should succeed in test setup');
  return invitee;
}

async function getMembers(baseUrl, cookie, groupId){
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/members`, { headers: authHeader(cookie) });
  const { members } = await res.json();
  return members;
}

async function createExpense(baseUrl, cookie, groupId, payload){
  return fetch(`${baseUrl}/api/groups/${groupId}/expenses`, {
    method: 'POST', headers: {...authHeader(cookie), 'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
}

async function createSettlement(baseUrl, cookie, groupId, payload){
  return fetch(`${baseUrl}/api/groups/${groupId}/settlements`, {
    method: 'POST', headers: {...authHeader(cookie), 'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
}

// Sets up: A and B in a shared group, A pays a ₹500 expense split equally
// (A owes B ₹250 after... wait -- equal split means A paid 500, owes 250 of
// it themselves, so A is owed 250 net from B). To get "A owes B", have B be
// the payer instead: B pays ₹500 split equally between A and B -> A owes B ₹250.
async function setupAOwesB(baseUrl, ownerEmail, friendEmail, amount){
  const a = await loginAs(baseUrl, ownerEmail);
  const group = await createGroup(baseUrl, a.cookie, 'Trip');
  const b = await inviteAndAccept(baseUrl, a.cookie, group.id, friendEmail);
  const members = await getMembers(baseUrl, a.cookie, group.id);
  const aMemberId = members.find(m => m.user_id === a.userId).id;
  const bMemberId = members.find(m => m.user_id === b.userId).id;

  // B pays the full amount, split equally -> A ends up owing B half.
  await createExpense(baseUrl, b.cookie, group.id, {
    name: 'Dinner', amount, date: new Date().toISOString(), category: 'food',
    paidBy: b.userId, splitType: 'equal', splits: [{ memberId: aMemberId }, { memberId: bMemberId }]
  });

  return { a, b, group, aMemberId, bMemberId };
}

describe('Settlements API', () => {
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

  // ---- 1. authenticated member can list ----
  test('1. An authenticated active member can list settlements (empty initially)', async () => {
    const a = await loginAs(baseUrl, 'st1a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(a.cookie) });
    assert.equal(res.status, 200);
    const { settlements } = await res.json();
    assert.deepEqual(settlements, []);
  });

  // ---- 2. non-member cannot list ----
  test('2. A non-member cannot list a group\'s settlements (404, IDOR-safe)', async () => {
    const a = await loginAs(baseUrl, 'st2a@example.com');
    const outsider = await loginAs(baseUrl, 'st2b@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(outsider.cookie) });
    assert.equal(res.status, 404);
  });

  // ---- 3. member can create settlement (valid direction) ----
  test('3. A member can create a valid settlement matching the current balance direction', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st3a@example.com', 'st3b@example.com', 500);
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 200, date: new Date().toISOString()
    });
    const body = await res.json();
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body.settlement.fromUserId, a.userId);
    assert.equal(body.settlement.toUserId, b.userId);
    assert.equal(body.settlement.amount, 200);
  });

  // ---- 4. createdBy is server-derived ----
  test('4. createdBy is always the authenticated caller, never trusted from the client, even when recording on someone else\'s behalf', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st4a@example.com', 'st4b@example.com', 500);
    // B (a valid, active member) records the settlement on A's behalf --
    // the existing app explicitly allows this (settle-up.js lets any member
    // pick any fromUserId/toUserId pair).
    const res = await createSettlement(baseUrl, b.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString(), createdBy: a.userId // spoof attempt
    });
    assert.equal(res.status, 201);
    const { settlement } = await res.json();
    assert.equal(settlement.createdBy, b.userId, 'createdBy must be the authenticated caller (B), never the spoofed value nor fromUserId');
  });

  // ---- 5. payer must belong to group ----
  test('5. fromUserId must be an active member of the group', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st5a@example.com', 'st5b@example.com', 500);
    const outsider = await loginAs(baseUrl, 'st5c@example.com');
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: outsider.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 6. payee must belong to group ----
  test('6. toUserId must be an active member of the group', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st6a@example.com', 'st6b@example.com', 500);
    const outsider = await loginAs(baseUrl, 'st6c@example.com');
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: outsider.userId, amount: 100, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 7. removed member cannot be used for new settlement ----
  test('7. A removed member cannot be used as fromUserId or toUserId for a NEW settlement', async () => {
    const { a, b, group, bMemberId } = await setupAOwesB(baseUrl, 'st7a@example.com', 'st7b@example.com', 500);
    await fetch(`${baseUrl}/api/groups/${group.id}/members/${bMemberId}`, { method: 'DELETE', headers: authHeader(a.cookie) });
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 8. invalid amount rejected ----
  test('8. A non-numeric/invalid amount is rejected', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st8a@example.com', 'st8b@example.com', 500);
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 'not-a-number', date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 9. zero amount rejected ----
  test('9. A zero settlement amount is rejected', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st9a@example.com', 'st9b@example.com', 500);
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 0, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 10. negative amount rejected ----
  test('10. A negative settlement amount is rejected', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st10a@example.com', 'st10b@example.com', 500);
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: -50, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 11. over-settlement rejected ----
  test('11. Over-settlement (amount exceeds what is owed) is rejected: A owes B ₹250, A→B ₹300 fails', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st11a@example.com', 'st11b@example.com', 500); // A owes B 250
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 300, date: new Date().toISOString()
    });
    assert.equal(res.status, 400);
  });

  // ---- 11b. exact-amount settlement is valid ----
  test('11b. Settling the exact outstanding amount (₹250) is valid', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st11ca@example.com', 'st11cb@example.com', 500); // A owes B 250
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: a.userId, toUserId: b.userId, amount: 250, date: new Date().toISOString()
    });
    assert.equal(res.status, 201);
  });

  // ---- 11c. wrong-direction settlement rejected (the core Phase 5.8 clarification) ----
  test('11c. Wrong-direction settlement is rejected: A owes B, so B→A is rejected even for a valid amount/members', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st11da@example.com', 'st11db@example.com', 500); // A owes B 250
    const res = await createSettlement(baseUrl, a.cookie, group.id, {
      fromUserId: b.userId, toUserId: a.userId, amount: 100, date: new Date().toISOString()
    });
    assert.equal(res.status, 400, 'B does not owe A anything, so this direction must be rejected regardless of amount');
  });

  // ---- 12. cross-group create blocked ----
  test('12. Creating a settlement in a group the caller is not a member of is blocked (404)', async () => {
    const a = await loginAs(baseUrl, 'st12a@example.com');
    const other = await loginAs(baseUrl, 'st12x@example.com'); // distinct from `a`, so fromUserId !== toUserId
    const outsider = await loginAs(baseUrl, 'st12b@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await createSettlement(baseUrl, outsider.cookie, group.id, {
      fromUserId: a.userId, toUserId: other.userId, amount: 10, date: new Date().toISOString()
    });
    assert.equal(res.status, 404);
  });

  // ---- 13. cross-group read blocked ----
  test('13. Reading another group\'s settlements as a non-member is blocked (404)', async () => {
    const { a, group } = await setupAOwesB(baseUrl, 'st13a@example.com', 'st13b@example.com', 500);
    const outsider = await loginAs(baseUrl, 'st13c@example.com');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(outsider.cookie) });
    assert.equal(res.status, 404);
  });

  // ---- 14. cross-group mutation blocked (no PUT/DELETE exist, so this is: a settlement created in Group A never appears when reading Group B) ----
  test('14. A settlement recorded in Group A never appears in an unrelated Group B\'s list', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st14a@example.com', 'st14b@example.com', 500);
    await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString() });
    const groupB = await createGroup(baseUrl, a.cookie, 'Unrelated Group B');
    const res = await fetch(`${baseUrl}/api/groups/${groupB.id}/settlements`, { headers: authHeader(a.cookie) });
    const { settlements } = await res.json();
    assert.equal(settlements.length, 0);
  });

  // ---- 15. PostgreSQL persistence survives refresh/reload ----
  test('15. A created settlement persists in PostgreSQL and is readable via a fresh query', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st15a@example.com', 'st15b@example.com', 500);
    const createRes = await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 200, date: new Date().toISOString() });
    const { settlement } = await createRes.json();

    const dbRow = await db.query('SELECT * FROM settlements WHERE id = $1', [settlement.id]);
    assert.equal(dbRow.rows.length, 1);
    assert.equal(Number(dbRow.rows[0].amount_paise), 20000);
    assert.equal(dbRow.rows[0].created_by, a.userId);

    const listRes = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(a.cookie) });
    const { settlements } = await listRes.json();
    assert.equal(settlements.length, 1);
  });

  // ---- 16. historical settlements remain available after member removal ----
  test('16. Historical settlements remain readable after the counterparty is removed from the group', async () => {
    const { a, b, group, bMemberId } = await setupAOwesB(baseUrl, 'st16a@example.com', 'st16b@example.com', 500);
    await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString() });
    await fetch(`${baseUrl}/api/groups/${group.id}/members/${bMemberId}`, { method: 'DELETE', headers: authHeader(a.cookie) });
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(a.cookie) });
    assert.equal(res.status, 200);
    const { settlements } = await res.json();
    assert.equal(settlements.length, 1, 'the historical settlement must remain visible even though the payee was later removed');
  });

  // ---- 17. balance calculation after settlement matches local behavior ----
  test('17. Balance after a settlement matches the existing paid-owed+settled formula: A owes B 250, settle 200, remaining owed = 50', async () => {
    const { a, b, group, aMemberId, bMemberId } = await setupAOwesB(baseUrl, 'st17a@example.com', 'st17b@example.com', 500);
    await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 200, date: new Date().toISOString() });

    // Recompute using the same raw data the client would (expenses+settlements) via the API.
    const settlementsRes = await fetch(`${baseUrl}/api/groups/${group.id}/settlements`, { headers: authHeader(a.cookie) });
    const { settlements } = await settlementsRes.json();
    const expensesRes = await fetch(`${baseUrl}/api/groups/${group.id}/expenses`, { headers: authHeader(a.cookie) });
    const { expenses } = await expensesRes.json();

    const paidByA = expenses.filter(e=>e.paidBy===a.userId).reduce((s,e)=>s+e.amount,0);
    const owedByA = expenses.flatMap(e=>e.splits).filter(s=>s.memberId===aMemberId).reduce((s,sp)=>s+sp.amount,0);
    const settledByA = settlements.reduce((s,st)=> st.fromUserId===a.userId ? s+st.amount : (st.toUserId===a.userId ? s-st.amount : s), 0);
    const balanceA = paidByA - owedByA + settledByA;
    assert.equal(Math.round(balanceA*100)/100, -50, 'A should now owe exactly ₹50 more (250 owed - 200 settled)');
  });

  // ---- 18. multiple settlements accumulate correctly ----
  test('18. Multiple settlements accumulate: A owes B 500, settle 200 then 100, next over-settlement cap reflects both', async () => {
    const { a, b, group } = await setupAOwesB(baseUrl, 'st18a@example.com', 'st18b@example.com', 1000); // A owes B 500
    const r1 = await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 200, date: new Date().toISOString() });
    assert.equal(r1.status, 201);
    const r2 = await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 100, date: new Date().toISOString() });
    assert.equal(r2.status, 201);
    // Remaining owed = 500 - 200 - 100 = 200. Settling 250 now must fail; 200 must succeed.
    const rTooMuch = await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 250, date: new Date().toISOString() });
    assert.equal(rTooMuch.status, 400);
    const rExact = await createSettlement(baseUrl, a.cookie, group.id, { fromUserId: a.userId, toUserId: b.userId, amount: 200, date: new Date().toISOString() });
    assert.equal(rExact.status, 201);
  });

  // ---- 19. Personal expense/balance behavior remains unchanged ----
  test('19. The Personal expense API and Personal group are entirely unaffected; settlements API rejects the Personal group', async () => {
    const a = await loginAs(baseUrl, 'st19a@example.com');
    const other = await loginAs(baseUrl, 'st19x@example.com'); // distinct from `a`
    const groupsRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    const { groups } = await groupsRes.json();
    const personalGroup = groups.find(g => g.type === 'personal');

    const res = await createSettlement(baseUrl, a.cookie, personalGroup.id, {
      fromUserId: a.userId, toUserId: other.userId, amount: 10, date: new Date().toISOString()
    });
    assert.equal(res.status, 403, 'settlements are only meaningful for shared groups');

    const expRes = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST', headers: {...authHeader(a.cookie), 'Content-Type':'application/json'},
      body: JSON.stringify({ name: 'Coffee', amount: 5, date: new Date().toISOString(), category: 'food' })
    });
    assert.equal(expRes.status, 201, 'Personal expense creation must be entirely unaffected by Phase 5.8');
  });
});
