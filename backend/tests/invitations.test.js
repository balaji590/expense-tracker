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

async function invite(baseUrl, cookie, groupId, email){
  const res = await fetch(`${baseUrl}/api/groups/${groupId}/invitations`, { method:'POST', headers:{...authHeader(cookie),'Content-Type':'application/json'}, body: JSON.stringify({email}) });
  const body = await res.json();
  return { status: res.status, body, token: body.devInvitationLink ? extractToken(body.devInvitationLink) : null };
}

describe('Invitations API', () => {
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

  // ---- 1. create invitation ----
  test('1. Owner creates an invitation successfully', async () => {
    const a = await loginAs(baseUrl, 'i1@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { status, body } = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    assert.equal(status, 201);
    assert.equal(body.invitation.email, 'friend@example.com');
    assert.equal(body.invitation.status, 'pending');
    assert.ok(body.devInvitationLink);
  });

  // ---- 2. normalize email ----
  test('2. Invited email is normalized to lowercase/trimmed', async () => {
    const a = await loginAs(baseUrl, 'i2@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { body } = await invite(baseUrl, a.cookie, group.id, '  Friend@EXAMPLE.com  ');
    assert.equal(body.invitation.email, 'friend@example.com');
  });

  // ---- 3. invalid email ----
  test('3. Invalid email is rejected', async () => {
    const a = await loginAs(baseUrl, 'i3@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { status } = await invite(baseUrl, a.cookie, group.id, 'not-an-email');
    assert.equal(status, 400);
  });

  // ---- 4. owner can invite ----
  test('4. Owner can invite', async () => {
    const a = await loginAs(baseUrl, 'i4@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { status } = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    assert.equal(status, 201);
  });

  // ---- 5. member cannot invite ----
  test('5. A non-owner member cannot invite', async () => {
    const owner = await loginAs(baseUrl, 'i5owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const member = await loginAs(baseUrl, 'i5member@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, member.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(member.cookie) });
    const { status } = await invite(baseUrl, member.cookie, group.id, 'thirdparty@example.com');
    assert.equal(status, 403);
  });

  // ---- 6. non-member cannot invite ----
  test('6. A non-member cannot invite into someone else\'s group', async () => {
    const owner = await loginAs(baseUrl, 'i6owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const stranger = await loginAs(baseUrl, 'i6stranger@example.com');
    const { status } = await invite(baseUrl, stranger.cookie, group.id, 'x@example.com');
    assert.equal(status, 404);
  });

  // ---- 7. Personal group invitation blocked ----
  test('7. Inviting into the Personal group is rejected with 403', async () => {
    const a = await loginAs(baseUrl, 'i7@example.com');
    const listRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    const { groups } = await listRes.json();
    const personal = groups.find(g => g.type === 'personal');
    const { status } = await invite(baseUrl, a.cookie, personal.id, 'x@example.com');
    assert.equal(status, 403);
  });

  // ---- 8. duplicate pending invitation ----
  test('8. A duplicate invitation to the same email replaces the old one (new token, still exactly one pending row)', async () => {
    const a = await loginAs(baseUrl, 'i8@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const first = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    const second = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    assert.equal(second.status, 201);
    assert.notEqual(first.token, second.token, 'a fresh token must be issued');
    const pendingCount = await db.query(`SELECT COUNT(*) FROM invitations WHERE group_id=$1 AND invited_email='friend@example.com' AND status='pending'`, [group.id]);
    assert.equal(pendingCount.rows[0].count, '1');
    // The OLD token must no longer work
    const oldAttempt = await fetch(`${baseUrl}/api/invitations/${first.token}/preview`);
    assert.equal(oldAttempt.status, 400);
  });

  // ---- 9. already-member invitation blocked ----
  test('9. Inviting an email that already belongs to an active member is rejected', async () => {
    const owner = await loginAs(baseUrl, 'i9owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const member = await loginAs(baseUrl, 'i9member@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, member.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(member.cookie) });
    const { status } = await invite(baseUrl, owner.cookie, group.id, member.email);
    assert.equal(status, 409);
  });

  // ---- 10. token stored as hash ----
  test('10. The raw invitation token is never stored, only its hash', async () => {
    const a = await loginAs(baseUrl, 'i10@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { token } = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    const rows = await db.query(`SELECT token_hash FROM invitations WHERE group_id=$1`, [group.id]);
    assert.notEqual(rows.rows[0].token_hash, token);
    const crypto = require('crypto');
    assert.equal(rows.rows[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'));
  });

  // ---- 11. raw token not logged ----
  test('11. Console logging never includes the raw invitation token', async () => {
    const logs = [];
    const originalLog = console.log;
    console.log = (...args) => { logs.push(args.join(' ')); };
    try{
      const a = await loginAs(baseUrl, 'i11@example.com');
      const group = await createGroup(baseUrl, a.cookie, 'Family');
      const { token } = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
      assert.ok(!logs.join('\n').includes(token));
    } finally { console.log = originalLog; }
  });

  // ---- 12. valid acceptance ----
  test('12. A valid invitation is accepted successfully', async () => {
    const owner = await loginAs(baseUrl, 'i12owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i12recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.role, 'member');
  });

  // ---- 13. wrong authenticated user blocked ----
  test('13. A different authenticated user cannot accept someone else\'s invitation', async () => {
    const owner = await loginAs(baseUrl, 'i13owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const { token } = await invite(baseUrl, owner.cookie, group.id, 'wife@example.com');
    const wrongUser = await loginAs(baseUrl, 'husband@example.com');
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(wrongUser.cookie) });
    assert.equal(res.status, 403);
    // The invitation must still be usable by the real recipient afterward
    const preview = await fetch(`${baseUrl}/api/invitations/${token}/preview`);
    assert.equal(preview.status, 200);
  });

  // ---- 14. unauthenticated acceptance blocked ----
  test('14. Accepting without authentication returns 401', async () => {
    const owner = await loginAs(baseUrl, 'i14@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const { token } = await invite(baseUrl, owner.cookie, group.id, 'friend@example.com');
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST' });
    assert.equal(res.status, 401);
  });

  // ---- 15. expired invitation blocked ----
  test('15. An expired invitation cannot be accepted', async () => {
    const owner = await loginAs(baseUrl, 'i15@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i15recipient@example.com');
    const crypto = require('crypto');
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at) VALUES ($1,$2,$3,$4, now() - interval '1 day')`,
      [group.id, recipient.email, owner.userId, tokenHash]
    );
    const res = await fetch(`${baseUrl}/api/invitations/${rawToken}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    assert.equal(res.status, 400);
  });

  // ---- 16. revoked invitation blocked ----
  test('16. A revoked invitation cannot be accepted', async () => {
    const owner = await loginAs(baseUrl, 'i16@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i16recipient@example.com');
    const { token, body } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/groups/${group.id}/invitations/${body.invitation.id}`, { method:'DELETE', headers: authHeader(owner.cookie) });
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    assert.equal(res.status, 400);
  });

  // ---- 17. accepted invitation cannot be reused ----
  test('17. An already-accepted invitation cannot be used again', async () => {
    const owner = await loginAs(baseUrl, 'i17@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i17recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const second = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    assert.equal(second.status, 400);
  });

  // ---- 18. acceptance creates membership ----
  test('18. Acceptance creates an active GroupMember row', async () => {
    const owner = await loginAs(baseUrl, 'i18@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i18recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const rows = await db.query(`SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2`, [group.id, recipient.userId]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].removed_at, null);
  });

  // ---- 19. correct member role ----
  test('19. The accepted member has role=member, never owner', async () => {
    const owner = await loginAs(baseUrl, 'i19@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i19recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const body = await res.json();
    assert.equal(body.member.role, 'member');
  });

  // ---- 20. owner remains owner ----
  test('20. The inviter\'s own role is unaffected by someone accepting', async () => {
    const owner = await loginAs(baseUrl, 'i20@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i20recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const membersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(owner.cookie) });
    const { members } = await membersRes.json();
    assert.equal(members.find(m=>m.user_id===owner.userId).role, 'owner');
  });

  // ---- 21. invitation marked accepted ----
  test('21. The invitation record itself is marked accepted with a timestamp', async () => {
    const owner = await loginAs(baseUrl, 'i21@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i21recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const rows = await db.query(`SELECT * FROM invitations WHERE group_id=$1`, [group.id]);
    assert.equal(rows.rows[0].status, 'accepted');
    assert.ok(rows.rows[0].accepted_at);
  });

  // ---- 22. owner can list pending invitations ----
  test('22. Owner can list pending invitations', async () => {
    const a = await loginAs(baseUrl, 'i22@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    await invite(baseUrl, a.cookie, group.id, 'friend1@example.com');
    await invite(baseUrl, a.cookie, group.id, 'friend2@example.com');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/invitations`, { headers: authHeader(a.cookie) });
    assert.equal(res.status, 200);
    const { invitations } = await res.json();
    assert.equal(invitations.length, 2);
    assert.ok(!('token' in invitations[0]) && !('tokenHash' in invitations[0]));
  });

  // ---- 23. non-owner cannot list ----
  test('23. A non-owner member cannot list invitations', async () => {
    const owner = await loginAs(baseUrl, 'i23owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const member = await loginAs(baseUrl, 'i23member@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, member.email);
    await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(member.cookie) });
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/invitations`, { headers: authHeader(member.cookie) });
    assert.equal(res.status, 403);
  });

  // ---- 24. owner can revoke ----
  test('24. Owner can revoke a pending invitation', async () => {
    const a = await loginAs(baseUrl, 'i24@example.com');
    const group = await createGroup(baseUrl, a.cookie, 'Family');
    const { body } = await invite(baseUrl, a.cookie, group.id, 'friend@example.com');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/invitations/${body.invitation.id}`, { method:'DELETE', headers: authHeader(a.cookie) });
    assert.equal(res.status, 204);
  });

  // ---- 25. non-owner cannot revoke ----
  test('25. A non-owner member cannot revoke invitations', async () => {
    const owner = await loginAs(baseUrl, 'i25owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const member = await loginAs(baseUrl, 'i25member@example.com');
    const { token: memberToken } = await invite(baseUrl, owner.cookie, group.id, member.email);
    await fetch(`${baseUrl}/api/invitations/${memberToken}/accept`, { method:'POST', headers: authHeader(member.cookie) });
    const { body } = await invite(baseUrl, owner.cookie, group.id, 'thirdparty@example.com');
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/invitations/${body.invitation.id}`, { method:'DELETE', headers: authHeader(member.cookie) });
    assert.equal(res.status, 403);
  });

  // ---- 26. concurrent acceptance ----
  test('26. Two simultaneous acceptance attempts result in exactly one success', async () => {
    const owner = await loginAs(baseUrl, 'i26@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i26recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) }),
      fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) })
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 400], 'exactly one must succeed, the other must fail');
  });

  // ---- 27. duplicate membership prevention ----
  test('27. Concurrent acceptance never creates two membership rows', async () => {
    const owner = await loginAs(baseUrl, 'i27@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i27recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await Promise.all([
      fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) }),
      fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) })
    ]);
    const rows = await db.query(`SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2`, [group.id, recipient.userId]);
    assert.equal(rows.rows.length, 1);
  });

  // ---- 28. removed member re-invitation ----
  test('28. Re-inviting a removed member reactivates their original membership row (not a new one) only upon acceptance', async () => {
    const owner = await loginAs(baseUrl, 'i28@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i28recipient@example.com');
    const first = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    await fetch(`${baseUrl}/api/invitations/${first.token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const membersRes = await fetch(`${baseUrl}/api/groups/${group.id}/members`, { headers: authHeader(owner.cookie) });
    const { members } = await membersRes.json();
    const originalMemberId = members.find(m=>m.user_id===recipient.userId).id;

    // Remove them
    await fetch(`${baseUrl}/api/groups/${group.id}/members/${originalMemberId}`, { method:'DELETE', headers: authHeader(owner.cookie) });
    // Not automatically reactivated just by removal+re-invite -- must require explicit acceptance
    const afterRemoveInvite = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    const stillRemoved = await db.query(`SELECT * FROM group_members WHERE id=$1`, [originalMemberId]);
    assert.ok(stillRemoved.rows[0].removed_at, 'must remain removed until the new invitation is actually accepted');

    // Now accept the new invitation
    await fetch(`${baseUrl}/api/invitations/${afterRemoveInvite.token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    const reactivated = await db.query(`SELECT * FROM group_members WHERE id=$1`, [originalMemberId]);
    assert.equal(reactivated.rows[0].removed_at, null, 'the SAME membership row must be reactivated, preserving historical identity');
    const allMemberRows = await db.query(`SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2`, [group.id, recipient.userId]);
    assert.equal(allMemberRows.rows.length, 1, 'must not create a second membership row');
  });

  // ---- 29. IDOR group manipulation ----
  test('29. A user cannot create an invitation by manipulating groupId to target another user\'s group', async () => {
    const owner = await loginAs(baseUrl, 'i29owner@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const attacker = await loginAs(baseUrl, 'i29attacker@example.com');
    const { status } = await invite(baseUrl, attacker.cookie, group.id, 'x@example.com');
    assert.equal(status, 404);
    const check = await db.query(`SELECT COUNT(*) FROM invitations WHERE group_id=$1`, [group.id]);
    assert.equal(check.rows[0].count, '0');
  });

  // ---- 30. invited_email tampering ----
  test('30. invited_email cannot be changed after token creation -- no endpoint accepts such a patch', async () => {
    const owner = await loginAs(baseUrl, 'i30@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const { body } = await invite(baseUrl, owner.cookie, group.id, 'original@example.com');
    // No PATCH/PUT route exists for invitations at all
    const res = await fetch(`${baseUrl}/api/groups/${group.id}/invitations/${body.invitation.id}`, { method:'PATCH', headers:{...authHeader(owner.cookie),'Content-Type':'application/json'}, body: JSON.stringify({email:'changed@example.com'}) });
    assert.equal(res.status, 404);
    const stillOriginal = await db.query(`SELECT invited_email FROM invitations WHERE id=$1`, [body.invitation.id]);
    assert.equal(stillOriginal.rows[0].invited_email, 'original@example.com');
  });

  // ---- 31. production dev-link leakage prevention ----
  test('31. devInvitationLink is never present when nodeEnv is production, even if AUTH_EMAIL_MODE says development', async () => {
    delete require.cache[require.resolve('../src/config')];
    const prevEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EMAIL_MODE = 'development';
    process.env.CORS_ORIGIN = 'https://example.com';
    delete require.cache[require.resolve('../src/services/invitationService')];
    delete require.cache[require.resolve('../src/services/groupService')];
    let prodInvitationService, prodGroupService, prodUserRepo;
    try{
      prodInvitationService = require('../src/services/invitationService');
      prodGroupService = require('../src/services/groupService');
      prodUserRepo = require('../src/repositories/userRepository');
      const owner = await prodUserRepo.create({ email: 'prodowner@example.com', displayName: 'Owner' });
      const group = await prodGroupService.createGroup(owner.id, 'Family');
      const result = await prodInvitationService.createInvitation(owner.id, group.group.id, 'friend@example.com');
      assert.equal(result.devInvitationLink, undefined, 'devInvitationLink must never be present when nodeEnv is production');
    } finally {
      process.env = prevEnv;
      delete require.cache[require.resolve('../src/config')];
      delete require.cache[require.resolve('../src/services/invitationService')];
      delete require.cache[require.resolve('../src/services/groupService')];
      require('../src/config');
    }
  });

  // ---- 32. safe error mapping ----
  test('32. Error responses never leak internals', async () => {
    const a = await loginAs(baseUrl, 'i32@example.com');
    const res = await fetch(`${baseUrl}/api/groups/not-a-uuid/invitations`, { method:'POST', headers:{...authHeader(a.cookie),'Content-Type':'application/json'}, body: JSON.stringify({email:'x@example.com'}) });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['details','error']);
  });

  // ---- 33. transaction rollback ----
  test('33. A failed acceptance leaves no partial membership behind', async () => {
    const owner = await loginAs(baseUrl, 'i33@example.com');
    const group = await createGroup(baseUrl, owner.cookie, 'Family');
    const recipient = await loginAs(baseUrl, 'i33recipient@example.com');
    const { token } = await invite(baseUrl, owner.cookie, group.id, recipient.email);
    // Consume it directly to force the accept endpoint's transaction to fail cleanly
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.query(`UPDATE invitations SET status='accepted' WHERE token_hash=$1`, [tokenHash]);
    const res = await fetch(`${baseUrl}/api/invitations/${token}/accept`, { method:'POST', headers: authHeader(recipient.cookie) });
    assert.equal(res.status, 400);
    const rows = await db.query(`SELECT * FROM group_members WHERE group_id=$1 AND user_id=$2`, [group.id, recipient.userId]);
    assert.equal(rows.rows.length, 0, 'no membership must be created when the transaction correctly fails');
  });

  // ---- 34, 35, 36: existing test suites still pass (spot-checked here, full suites run separately) ----
  test('34,35,36. Existing auth/groups/expenses functionality is unaffected (spot check)', async () => {
    const a = await loginAs(baseUrl, 'spotcheck@example.com');
    const meRes = await fetch(`${baseUrl}/api/auth/me`, { headers: authHeader(a.cookie) });
    assert.equal(meRes.status, 200);
    const groupsRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeader(a.cookie) });
    assert.equal(groupsRes.status, 200);
    const expensesRes = await fetch(`${baseUrl}/api/expenses`, { headers: authHeader(a.cookie) });
    assert.equal(expensesRes.status, 200);
  });
});
