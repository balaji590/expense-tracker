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

function memberIdFor(members, userId){
  return members.find(m => m.user_id === userId).id;
}

async function createExpense(baseUrl, cookie, groupId, payload){
  return fetch(`${baseUrl}/api/groups/${groupId}/expenses`, {
    method: 'POST', headers: {...authHeader(cookie), 'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
}

describe('Shared Expenses API', () => {
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
  test('1. An authenticated active member can list shared expenses (empty initially)', async () => {
    const a = await loginAs(baseUrl, 'se1a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses`, { headers: authHeader(a.cookie) });
    assert.equal(res.status, 200);
    const { expenses } = await res.json();
    assert.deepEqual(expenses, []);
  });

  // ---- 2. non-member cannot list ----
  test('2. A non-member cannot list a group\'s expenses (404, IDOR-safe)', async () => {
    const a = await loginAs(baseUrl, 'se2a@example.com');
    const outsider = await loginAs(baseUrl, 'se2b@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses`, { headers: authHeader(outsider.cookie) });
    assert.equal(res.status, 404);
  });

  // ---- 3. member can create shared expense ----
  test('3. An active member can create a shared expense', async () => {
    const a = await loginAs(baseUrl, 'se3a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'none'
    });
    assert.equal(res.status, 201);
    const { expense } = await res.json();
    assert.equal(expense.name, 'Dinner');
    assert.equal(expense.amount, 100);
    assert.equal(expense.groupId, group.id);
    assert.equal(expense.paidBy, a.userId);
    assert.equal(expense.addedBy, a.userId);
  });

  // ---- 4. addedBy is server-derived ----
  test('4. addedBy is always the authenticated caller, never a client-supplied value', async () => {
    const a = await loginAs(baseUrl, 'se4c@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se4d@example.com');
    const res = await createExpense(baseUrl, b.cookie, group.id, {
      name: 'Snacks', amount: 50, date: new Date().toISOString(), category: 'food',
      paidBy: b.userId, splitType: 'none', addedBy: a.userId // attempted spoof
    });
    assert.equal(res.status, 201);
    const { expense } = await res.json();
    assert.equal(expense.addedBy, b.userId); // never a.userId, despite the spoof attempt
  });

  // ---- 5. paidBy must belong to group ----
  test('5. paidBy must reference an active member of the group', async () => {
    const a = await loginAs(baseUrl, 'se5a@example.com');
    const outsider = await loginAs(baseUrl, 'se5b@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: outsider.userId, splitType: 'none'
    });
    assert.equal(res.status, 400);
  });

  // ---- 6. split members must belong to group ----
  test('6. Split members must belong to the group (rejects a foreign member id)', async () => {
    const a = await loginAs(baseUrl, 'se6a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const otherOwner = await loginAs(baseUrl, 'se6b@example.com');
    const otherGroup = await createGroup(baseUrl, otherOwner.cookie, 'Other');
    const otherMembers = await getMembers(baseUrl, otherOwner.cookie, otherGroup.id);
    const foreignMemberId = otherMembers[0].id;

    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'custom', splits: [{ memberId: foreignMemberId, amount: 100 }]
    });
    assert.equal(res.status, 400);
  });

  // ---- 7. invalid split total rejected ----
  test('7. A custom split whose total does not match the expense amount is rejected', async () => {
    const a = await loginAs(baseUrl, 'se7a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const myMemberId = memberIdFor(members, a.userId);

    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'custom', splits: [{ memberId: myMemberId, amount: 60 }]
    });
    assert.equal(res.status, 400);
  });

  // ---- 8. negative split rejected ----
  test('8. A negative custom split amount is rejected', async () => {
    const a = await loginAs(baseUrl, 'se8a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const myMemberId = memberIdFor(members, a.userId);

    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'custom', splits: [{ memberId: myMemberId, amount: -100 }]
    });
    assert.equal(res.status, 400);
  });

  // ---- 9. cross-group expense access blocked (GET via wrong group id would 404, but expense lookup is via PUT/DELETE) ----
  test('9. Fetching another group\'s expense list never exposes a foreign expense', async () => {
    const a = await loginAs(baseUrl, 'se9a@example.com');
    const groupA = await createGroup(baseUrl, a.cookie, 'GroupA');
    const groupB = await createGroup(baseUrl, a.cookie, 'GroupB');
    await createExpense(baseUrl, a.cookie, groupA.id, {
      name: 'A-expense', amount: 10, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    const res = await fetch(`${baseUrl}/api/groups/${groupB.id}/expenses`, { headers: authHeader(a.cookie) });
    const { expenses } = await res.json();
    assert.equal(expenses.length, 0);
  });

  // ---- 10. cross-group update blocked ----
  test('10. Updating an expense via a different group\'s URL is blocked (404)', async () => {
    const a = await loginAs(baseUrl, 'se10a@example.com');
    const groupA = await createGroup(baseUrl, a.cookie, 'GroupA');
    const groupB = await createGroup(baseUrl, a.cookie, 'GroupB');
    const createRes = await createExpense(baseUrl, a.cookie, groupA.id, {
      name: 'A-expense', amount: 10, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    const { expense } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${groupB.id}/expenses/${expense.id}`, {
      method: 'PUT', headers: {...authHeader(a.cookie), 'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Hacked' })
    });
    assert.equal(res.status, 404);
  });

  // ---- 11. cross-group delete blocked ----
  test('11. Deleting an expense via a different group\'s URL is blocked (404)', async () => {
    const a = await loginAs(baseUrl, 'se11a@example.com');
    const groupA = await createGroup(baseUrl, a.cookie, 'GroupA');
    const groupB = await createGroup(baseUrl, a.cookie, 'GroupB');
    const createRes = await createExpense(baseUrl, a.cookie, groupA.id, {
      name: 'A-expense', amount: 10, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    const { expense } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${groupB.id}/expenses/${expense.id}`, { method: 'DELETE', headers: authHeader(a.cookie) });
    assert.equal(res.status, 404);
  });

  // ---- 12. member can update expense ----
  test('12. A member can update a shared expense they did not create', async () => {
    const a = await loginAs(baseUrl, 'se12a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se12b@example.com');
    const createRes = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    const { expense } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses/${expense.id}`, {
      method: 'PUT', headers: {...authHeader(b.cookie), 'Content-Type':'application/json'}, body: JSON.stringify({ name: 'Dinner (updated)' })
    });
    assert.equal(res.status, 200);
    const { expense: updated } = await res.json();
    assert.equal(updated.name, 'Dinner (updated)');
  });

  // ---- 13. member can delete expense ----
  test('13. A member can delete a shared expense they did not create', async () => {
    const a = await loginAs(baseUrl, 'se13a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se13b@example.com');
    const createRes = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    const { expense } = await createRes.json();
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses/${expense.id}`, { method: 'DELETE', headers: authHeader(b.cookie) });
    assert.equal(res.status, 204);
    const listRes = await fetch(`${baseUrl}/api/groups/${group.id}/expenses`, { headers: authHeader(a.cookie) });
    const { expenses } = await listRes.json();
    assert.equal(expenses.length, 0);
  });

  // ---- 14. removed member cannot be selected for new expense ----
  test('14. A removed member cannot be selected as paidBy or in splits for a NEW expense', async () => {
    const a = await loginAs(baseUrl, 'se14a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se14b@example.com');
    const membersBefore = await getMembers(baseUrl, a.cookie, group.id);
    const bMemberId = memberIdFor(membersBefore, b.userId);

    // Remove b from the group
    await fetch(`${baseUrl}/api/groups/${group.id}/members/${bMemberId}`, { method: 'DELETE', headers: authHeader(a.cookie) });

    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: b.userId, splitType: 'none'
    });
    assert.equal(res.status, 400);
  });

  // ---- 15. historical expense with removed member remains readable ----
  test('15. An expense referencing a since-removed member remains readable', async () => {
    const a = await loginAs(baseUrl, 'se15a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se15b@example.com');
    const membersBefore = await getMembers(baseUrl, a.cookie, group.id);
    const bMemberId = memberIdFor(membersBefore, b.userId);

    const createRes = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: b.userId, splitType: 'custom',
      splits: [{ memberId: memberIdFor(membersBefore, a.userId), amount: 50 }, { memberId: bMemberId, amount: 50 }]
    });
    assert.equal(createRes.status, 201);
    const { expense } = await createRes.json();

    await fetch(`${baseUrl}/api/groups/${group.id}/members/${bMemberId}`, { method: 'DELETE', headers: authHeader(a.cookie) });

    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses`, { headers: authHeader(a.cookie) });
    assert.equal(res.status, 200);
    const { expenses } = await res.json();
    const found = expenses.find(e => e.id === expense.id);
    assert.ok(found, 'the historical expense should still be listed');
    assert.equal(found.paidBy, b.userId);
    assert.equal(found.splits.length, 2);
  });

  // ---- 15b. editing an existing expense may keep (not newly add) a removed member ----
  test('15b. Editing that expense can keep the removed member\'s existing split reference', async () => {
    const a = await loginAs(baseUrl, 'se15c@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se15d@example.com');
    const membersBefore = await getMembers(baseUrl, a.cookie, group.id);
    const aMemberId = memberIdFor(membersBefore, a.userId);
    const bMemberId = memberIdFor(membersBefore, b.userId);

    const createRes = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'custom',
      splits: [{ memberId: aMemberId, amount: 50 }, { memberId: bMemberId, amount: 50 }]
    });
    const { expense } = await createRes.json();

    await fetch(`${baseUrl}/api/groups/${group.id}/members/${bMemberId}`, { method: 'DELETE', headers: authHeader(a.cookie) });

    // Edit unrelated field (notes) while resending the SAME splits (including
    // the now-removed member) — this must be allowed (grandfathered).
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/expenses/${expense.id}`, {
      method: 'PUT', headers: {...authHeader(a.cookie), 'Content-Type':'application/json'},
      body: JSON.stringify({ notes: 'settled later', splitType: 'custom', splits: [{ memberId: aMemberId, amount: 50 }, { memberId: bMemberId, amount: 50 }] })
    });
    assert.equal(res.status, 200);
    const { expense: updated } = await res.json();
    assert.equal(updated.splits.length, 2);
  });

  // ---- 16. PostgreSQL persistence survives reload ----
  test('16. Created expenses and splits persist in PostgreSQL and are readable after a fresh query', async () => {
    const a = await loginAs(baseUrl, 'se16a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const myMemberId = memberIdFor(members, a.userId);
    const createRes = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'equal', splits: [{ memberId: myMemberId }]
    });
    assert.equal(createRes.status, 201);
    const { expense } = await createRes.json();

    const dbExpense = await db.query('SELECT * FROM expenses WHERE id = $1', [expense.id]);
    assert.equal(dbExpense.rows.length, 1);
    assert.equal(Number(dbExpense.rows[0].amount_paise), 10000);
    const dbSplits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.id]);
    assert.equal(dbSplits.rows.length, 1);
    assert.equal(Number(dbSplits.rows[0].amount_paise), 10000);
  });

  // ---- 17. malformed payloads rejected safely ----
  test('17. A malformed payload (missing required fields) is rejected with 400, not a 500', async () => {
    const a = await loginAs(baseUrl, 'se17a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await createExpense(baseUrl, a.cookie, group.id, { splitType: 'bogus-type' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
    assert.equal(body.error.toLowerCase().includes('stack'), false);
  });

  // ---- 18. IDOR attempts fail ----
  test('18. A non-member attempting to create an expense in a group they do not belong to gets 404', async () => {
    const a = await loginAs(baseUrl, 'se18a@example.com');
    const outsider = await loginAs(baseUrl, 'se18b@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const res = await createExpense(baseUrl, outsider.cookie, group.id, {
      name: 'Sneaky', amount: 10, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    assert.equal(res.status, 404);
  });

  // ---- 19. personal expense behavior remains unchanged ----
  test('19. The Personal expense API is entirely unaffected by shared-expense changes', async () => {
    const a = await loginAs(baseUrl, 'se19a@example.com');
    const res = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST', headers: {...authHeader(a.cookie), 'Content-Type':'application/json'},
      body: JSON.stringify({ name: 'Coffee', amount: 5, date: new Date().toISOString(), category: 'food' })
    });
    assert.equal(res.status, 201);
    const { expense } = await res.json();
    assert.equal(expense.splits.length, 0);
    assert.equal(expense.splitType, 'none');
    assert.equal(expense.addedBy, a.userId);
    assert.equal(expense.paidBy, a.userId);

    const listRes = await fetch(`${baseUrl}/api/expenses`, { headers: authHeader(a.cookie) });
    const { expenses } = await listRes.json();
    assert.equal(expenses.length, 1);
  });

  // ---- 20. shared-expense API refuses the Personal group ----
  test('20. Using the shared-expense API against the Personal group is rejected (403)', async () => {
    const a = await loginAs(baseUrl, 'se20a@example.com');
    const groupsRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    const { groups } = await groupsRes.json();
    const personalGroup = groups.find(g => g.type === 'personal');
    const res = await createExpense(baseUrl, a.cookie, personalGroup.id, {
      name: 'Should not work', amount: 10, date: new Date().toISOString(), category: 'food', paidBy: a.userId, splitType: 'none'
    });
    assert.equal(res.status, 403);
  });

  // ---- 21. equal split is recomputed server-side, not trusted from client ----
  test('21. Equal split amounts are recomputed server-side (client amounts, if any, are ignored)', async () => {
    const a = await loginAs(baseUrl, 'se21a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const b = await inviteAndAccept(baseUrl, a.cookie, group.id, 'se21b@example.com');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const aMemberId = memberIdFor(members, a.userId);
    const bMemberId = memberIdFor(members, b.userId);

    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Snacks', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'equal',
      splits: [{ memberId: aMemberId, amount: 999 }, { memberId: bMemberId, amount: 1 }] // bogus client amounts
    });
    assert.equal(res.status, 201);
    const { expense } = await res.json();
    const total = expense.splits.reduce((s, sp) => s + sp.amount, 0);
    assert.equal(Math.round(total * 100), 10000);
    expense.splits.forEach(sp => assert.equal(sp.amount, 50));
  });

  // ---- 22. duplicate member in splits rejected ----
  test('22. A duplicate member id within splits is rejected', async () => {
    const a = await loginAs(baseUrl, 'se22a@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Trip');
    const members = await getMembers(baseUrl, a.cookie, group.id);
    const myMemberId = memberIdFor(members, a.userId);
    const res = await createExpense(baseUrl, a.cookie, group.id, {
      name: 'Dinner', amount: 100, date: new Date().toISOString(), category: 'food',
      paidBy: a.userId, splitType: 'custom',
      splits: [{ memberId: myMemberId, amount: 50 }, { memberId: myMemberId, amount: 50 }]
    });
    assert.equal(res.status, 400);
  });
});
