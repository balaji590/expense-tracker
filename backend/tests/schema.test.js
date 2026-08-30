const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const db = require('../src/db/pool');

async function truncateAll(){
  // CASCADE + RESTART IDENTITY not needed (UUID PKs), but CASCADE handles FK order for us.
  await db.query(`
    TRUNCATE TABLE expense_splits, settlements, invitations, expenses, group_members, groups, users
    CASCADE
  `);
}

async function makeUser(email = `user-${Date.now()}-${Math.random()}@example.com`){
  const result = await db.query(
    `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING *`,
    [email, 'Test User']
  );
  return result.rows[0];
}

async function makeGroup(createdBy, type = 'shared'){
  const result = await db.query(
    `INSERT INTO groups (name, type, created_by) VALUES ($1, $2, $3) RETURNING *`,
    ['Test Group', type, createdBy]
  );
  return result.rows[0];
}

async function makeMember(groupId, userId, role = 'member'){
  const result = await db.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) RETURNING *`,
    [groupId, userId, role]
  );
  return result.rows[0];
}

describe('Schema constraints', () => {
  before(truncateAll);
  after(async () => {
    await truncateAll();
    await db.close();
  });

  test('users.email is unique', async () => {
    const email = 'dup@example.com';
    await makeUser(email);
    await assert.rejects(
      () => db.query(`INSERT INTO users (email, display_name) VALUES ($1, $2)`, [email, 'Second']),
      /duplicate key value/
    );
  });

  test('groups.type only accepts personal or shared', async () => {
    const owner = await makeUser();
    await assert.rejects(
      () => db.query(`INSERT INTO groups (name, type, created_by) VALUES ($1, $2, $3)`, ['X', 'bogus', owner.id]),
      /violates check constraint/
    );
  });

  test('groups.created_by must reference an existing user (FK)', async () => {
    await assert.rejects(
      () => db.query(`INSERT INTO groups (name, type, created_by) VALUES ($1, $2, $3)`,
        ['X', 'shared', '00000000-0000-0000-0000-000000000000']),
      /violates foreign key constraint/
    );
  });

  test('group_members enforces UNIQUE(group_id, user_id) — no duplicate membership', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    await makeMember(group.id, owner.id, 'owner');
    await assert.rejects(
      () => db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)`,
        [group.id, owner.id, 'member']),
      /duplicate key value/
    );
  });

  test('group_members.role only accepts owner/admin/member/viewer', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    await assert.rejects(
      () => db.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)`,
        [group.id, owner.id, 'superuser']),
      /violates check constraint/
    );
  });

  test('group_members.removed_at defaults to NULL (active)', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    const member = await makeMember(group.id, owner.id, 'owner');
    assert.equal(member.removed_at, null);
  });

  test('invitations: only one PENDING invite per (group, email) at a time', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    const insertInvite = () => db.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
      [group.id, 'invitee@example.com', owner.id, `hash-${Math.random()}`]
    );
    await insertInvite();
    await assert.rejects(insertInvite, /duplicate key value/);
  });

  test('invitations: a second invite IS allowed once the first is no longer pending', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    const first = await db.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days') RETURNING *`,
      [group.id, 'someone@example.com', owner.id, `hash-${Math.random()}`]
    );
    await db.query(`UPDATE invitations SET status = 'revoked' WHERE id = $1`, [first.rows[0].id]);
    // Now a fresh pending invite to the same (group, email) should succeed.
    await db.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
      [group.id, 'someone@example.com', owner.id, `hash-${Math.random()}`]
    );
  });

  test('expenses.amount_paise must be > 0', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    await assert.rejects(
      () => db.query(
        `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, added_by, paid_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [group.id, 'Bad expense', 0, '2026-08-01', 'cat_food', owner.id, owner.id]
      ),
      /violates check constraint/
    );
  });

  test('expenses.split_type only accepts none/equal/custom', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    await assert.rejects(
      () => db.query(
        `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, added_by, paid_by, split_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [group.id, 'Bad split', 1000, '2026-08-01', 'cat_food', owner.id, owner.id, 'percentage']
      ),
      /violates check constraint/
    );
  });

  test('expense_splits.group_member_id must reference an existing group_member (FK)', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    const expense = await db.query(
      `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, added_by, paid_by, split_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'equal') RETURNING *`,
      [group.id, 'Dinner', 2000, '2026-08-01', 'cat_food', owner.id, owner.id]
    );
    await assert.rejects(
      () => db.query(
        `INSERT INTO expense_splits (expense_id, group_member_id, amount_paise) VALUES ($1, $2, $3)`,
        [expense.rows[0].id, '00000000-0000-0000-0000-000000000000', 1000]
      ),
      /violates foreign key constraint/
    );
  });

  test('settlements: from_user_id and to_user_id must differ', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    await assert.rejects(
      () => db.query(
        `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_paise, date)
         VALUES ($1, $2, $2, $3, $4)`,
        [group.id, owner.id, 500, '2026-08-01']
      ),
      /violates check constraint/
    );
  });

  test('settlements.amount_paise must be > 0', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const group = await makeGroup(owner.id);
    await assert.rejects(
      () => db.query(
        `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_paise, date)
         VALUES ($1, $2, $3, $4, $5)`,
        [group.id, owner.id, member.id, -100, '2026-08-01']
      ),
      /violates check constraint/
    );
  });

  test('deleting a group cascades to group_members, expenses, invitations, settlements', async () => {
    const owner = await makeUser();
    const member = await makeUser();
    const group = await makeGroup(owner.id);
    await makeMember(group.id, owner.id, 'owner');
    const expense = await db.query(
      `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, added_by, paid_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [group.id, 'To be cascaded', 1000, '2026-08-01', 'cat_food', owner.id, owner.id]
    );
    await db.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '7 days')`,
      [group.id, 'invitee2@example.com', owner.id, `hash-${Math.random()}`]
    );
    await db.query(
      `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_paise, date)
       VALUES ($1, $2, $3, $4, $5)`,
      [group.id, owner.id, member.id, 500, '2026-08-01']
    );

    await db.query('DELETE FROM groups WHERE id = $1', [group.id]);

    const members = await db.query('SELECT * FROM group_members WHERE group_id = $1', [group.id]);
    const expenses = await db.query('SELECT * FROM expenses WHERE group_id = $1', [group.id]);
    const invitations = await db.query('SELECT * FROM invitations WHERE group_id = $1', [group.id]);
    const settlements = await db.query('SELECT * FROM settlements WHERE group_id = $1', [group.id]);

    assert.equal(members.rows.length, 0, 'group_members should cascade-delete');
    assert.equal(expenses.rows.length, 0, 'expenses should cascade-delete');
    assert.equal(invitations.rows.length, 0, 'invitations should cascade-delete');
    assert.equal(settlements.rows.length, 0, 'settlements should cascade-delete');
    // Users themselves must NOT be deleted just because a group was.
    const ownerStillExists = await db.query('SELECT * FROM users WHERE id = $1', [owner.id]);
    assert.equal(ownerStillExists.rows.length, 1, 'users must survive group deletion');
  });

  test('deleting an expense cascades to its expense_splits', async () => {
    const owner = await makeUser();
    const group = await makeGroup(owner.id);
    const member = await makeMember(group.id, owner.id, 'owner');
    const expense = await db.query(
      `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, added_by, paid_by, split_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'equal') RETURNING id`,
      [group.id, 'Dinner', 2000, '2026-08-01', 'cat_food', owner.id, owner.id]
    );
    await db.query(
      `INSERT INTO expense_splits (expense_id, group_member_id, amount_paise) VALUES ($1, $2, $3)`,
      [expense.rows[0].id, member.id, 2000]
    );

    await db.query('DELETE FROM expenses WHERE id = $1', [expense.rows[0].id]);

    const splits = await db.query('SELECT * FROM expense_splits WHERE expense_id = $1', [expense.rows[0].id]);
    assert.equal(splits.rows.length, 0);
  });

  test('UUID primary keys are auto-generated on every table', async () => {
    const owner = await makeUser();
    assert.match(owner.id, /^[0-9a-f-]{36}$/i);
    const group = await makeGroup(owner.id);
    assert.match(group.id, /^[0-9a-f-]{36}$/i);
    const member = await makeMember(group.id, owner.id, 'owner');
    assert.match(member.id, /^[0-9a-f-]{36}$/i);
  });
});
