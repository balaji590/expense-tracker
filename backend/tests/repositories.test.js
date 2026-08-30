const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const db = require('../src/db/pool');
const userRepo = require('../src/repositories/userRepository');
const groupRepo = require('../src/repositories/groupRepository');
const memberRepo = require('../src/repositories/groupMemberRepository');
const expenseRepo = require('../src/repositories/expenseRepository');
const splitRepo = require('../src/repositories/expenseSplitRepository');
const settlementRepo = require('../src/repositories/settlementRepository');

async function truncateAll(){
  await db.query(`TRUNCATE TABLE expense_splits, settlements, invitations, expenses, group_members, groups, users CASCADE`);
}

describe('Repositories', () => {
  before(truncateAll);
  after(async () => {
    await truncateAll();
    await db.close();
  });

  test('userRepository: create + findById + findByEmail', async () => {
    const user = await userRepo.create({ email: 'repo-user@example.com', displayName: 'Repo User' });
    assert.ok(user.id);
    assert.equal(user.email, 'repo-user@example.com');

    const byId = await userRepo.findById(user.id);
    assert.equal(byId.email, user.email);

    const byEmail = await userRepo.findByEmail('repo-user@example.com');
    assert.equal(byEmail.id, user.id);

    const missing = await userRepo.findById('00000000-0000-0000-0000-000000000000');
    assert.equal(missing, null);
  });

  test('groupRepository: create, listForUser, rename, remove', async () => {
    const owner = await userRepo.create({ email: 'group-owner@example.com', displayName: 'Owner' });
    const group = await groupRepo.create({ name: 'Family', type: 'shared', createdBy: owner.id });
    await memberRepo.create({ groupId: group.id, userId: owner.id, role: 'owner' });

    const groups = await groupRepo.listForUser(owner.id);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].name, 'Family');
    assert.equal(groups[0].role, 'owner');

    const renamed = await groupRepo.rename(group.id, 'Family Renamed');
    assert.equal(renamed.name, 'Family Renamed');

    await groupRepo.remove(group.id);
    const afterDelete = await groupRepo.findById(group.id);
    assert.equal(afterDelete, null);
  });

  test('groupMemberRepository: softRemove excludes from active list but row persists', async () => {
    const owner = await userRepo.create({ email: 'member-owner@example.com', displayName: 'Owner' });
    const other = await userRepo.create({ email: 'member-other@example.com', displayName: 'Other' });
    const group = await groupRepo.create({ name: 'Roommates', type: 'shared', createdBy: owner.id });
    await memberRepo.create({ groupId: group.id, userId: owner.id, role: 'owner' });
    const otherMember = await memberRepo.create({ groupId: group.id, userId: other.id, role: 'member' });

    let active = await memberRepo.listForGroup(group.id);
    assert.equal(active.length, 2);

    await memberRepo.softRemove(otherMember.id);

    active = await memberRepo.listForGroup(group.id);
    assert.equal(active.length, 1, 'removed member should not appear in the active list');

    const withRemoved = await memberRepo.listForGroup(group.id, { includeRemoved: true });
    assert.equal(withRemoved.length, 2, 'removed member should still be resolvable when explicitly requested');

    const stillExists = await memberRepo.findById(otherMember.id);
    assert.ok(stillExists, 'soft-removed row must still exist');
    assert.ok(stillExists.removed_at, 'removed_at must be set');
  });

  test('expenseRepository: create, listForGroupMonth, update, remove', async () => {
    const owner = await userRepo.create({ email: 'exp-owner@example.com', displayName: 'Owner' });
    const group = await groupRepo.create({ name: 'Trip', type: 'shared', createdBy: owner.id });

    const expense = await expenseRepo.create({
      groupId: group.id, name: 'Hotel', amountPaise: 500000, date: '2026-08-15',
      categoryId: 'cat_travel', addedBy: owner.id, paidBy: owner.id, splitType: 'none'
    });
    assert.equal(expense.amount_paise, '500000'); // BIGINT comes back as string from pg driver — expected

    const monthList = await expenseRepo.listForGroupMonth(group.id, 2026, 8);
    assert.equal(monthList.length, 1);

    const otherMonthList = await expenseRepo.listForGroupMonth(group.id, 2026, 9);
    assert.equal(otherMonthList.length, 0, 'expense from August must not appear in September');

    const updated = await expenseRepo.update(expense.id, { amount_paise: 600000 });
    assert.equal(updated.amount_paise, '600000');
    assert.notEqual(updated.updated_at.getTime(), updated.created_at.getTime(), 'updated_at should change on update');

    await expenseRepo.remove(expense.id);
    const afterDelete = await expenseRepo.findById(expense.id);
    assert.equal(afterDelete, null);
  });

  test('expenseSplitRepository: createMany + listForExpense, split across a real group member', async () => {
    const owner = await userRepo.create({ email: 'split-owner@example.com', displayName: 'Owner' });
    const friend = await userRepo.create({ email: 'split-friend@example.com', displayName: 'Friend' });
    const group = await groupRepo.create({ name: 'Split Test', type: 'shared', createdBy: owner.id });
    const ownerMember = await memberRepo.create({ groupId: group.id, userId: owner.id, role: 'owner' });
    const friendMember = await memberRepo.create({ groupId: group.id, userId: friend.id, role: 'member' });

    const expense = await expenseRepo.create({
      groupId: group.id, name: 'Dinner', amountPaise: 240000, date: '2026-08-15',
      categoryId: 'cat_food', addedBy: owner.id, paidBy: owner.id, splitType: 'equal'
    });

    await splitRepo.createMany(expense.id, [
      { groupMemberId: ownerMember.id, amountPaise: 120000 },
      { groupMemberId: friendMember.id, amountPaise: 120000 }
    ]);

    const splits = await splitRepo.listForExpense(expense.id);
    assert.equal(splits.length, 2);
    const total = splits.reduce((sum, s) => sum + Number(s.amount_paise), 0);
    assert.equal(total, 240000, 'splits must sum exactly to the expense amount');
  });

  test('settlementRepository: create + listForGroup, newest first', async () => {
    const owner = await userRepo.create({ email: 'settle-owner@example.com', displayName: 'Owner' });
    const friend = await userRepo.create({ email: 'settle-friend@example.com', displayName: 'Friend' });
    const group = await groupRepo.create({ name: 'Settle Test', type: 'shared', createdBy: owner.id });

    await settlementRepo.create({ groupId: group.id, fromUserId: friend.id, toUserId: owner.id, amountPaise: 50000, date: '2026-08-01' });
    await settlementRepo.create({ groupId: group.id, fromUserId: friend.id, toUserId: owner.id, amountPaise: 30000, date: '2026-08-10' });

    const list = await settlementRepo.listForGroup(group.id);
    assert.equal(list.length, 2);
    assert.equal(list[0].amount_paise, '30000', 'most recent settlement should be first');
  });
});
