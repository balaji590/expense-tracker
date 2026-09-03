/* sharedExpenseService: Phase 5.7 — Shared Expenses Cloud Synchronization.
 *
 * Mirrors expenseService.js's shape and conventions (validate -> resolve ->
 * mutate), but for a group's SHARED expenses rather than the caller's own
 * Personal group. The key differences from expenseService.js:
 *   - groupId comes from the client (a URL param) and MUST be validated
 *     server-side on every call (via groupService.getGroupAndMembership) —
 *     unlike Personal expenses, where the group is always resolved from the
 *     session and a client can never influence it at all.
 *   - Every expense additionally carries paidBy/splitType/splits, which must
 *     be validated against the group's actual active membership — never
 *     trusted from the client.
 *   - addedBy is still always the authenticated caller's own id — never
 *     taken from the client, exactly like Personal expenses.
 */
const db = require('../db/pool');
const expenseRepo = require('../repositories/expenseRepository');
const splitRepo = require('../repositories/expenseSplitRepository');
const memberRepo = require('../repositories/groupMemberRepository');
const groupService = require('./groupService');
const { toDto } = require('./expenseMapper');
const { ValidationError, NotFoundError, ForbiddenError } = require('../errors');

const SPLIT_TYPES = ['none', 'equal', 'custom'];

function validateCoreFields(body, { partial = false } = {}, errors){
  if(!partial || body.name !== undefined){
    if(typeof body.name !== 'string' || !body.name.trim()) errors.push('name is required and must be a non-empty string');
  }
  if(!partial || body.amount !== undefined){
    const amt = Number(body.amount);
    if(!Number.isFinite(amt) || amt <= 0) errors.push('amount is required and must be a positive number');
  }
  if(!partial || body.date !== undefined){
    if(!body.date || Number.isNaN(Date.parse(body.date))) errors.push('date is required and must be a valid date');
  }
  if(!partial || body.category !== undefined){
    if(typeof body.category !== 'string' || !body.category.trim()) errors.push('category is required and must be a non-empty string');
  }
  if(body.paymentMethod !== undefined && typeof body.paymentMethod !== 'string') errors.push('paymentMethod must be a string');
  if(body.notes !== undefined && typeof body.notes !== 'string') errors.push('notes must be a string');
  if(body.tags !== undefined && !Array.isArray(body.tags)) errors.push('tags must be an array of strings');
}

function validateSplitType(splitType, errors){
  if(splitType !== undefined && !SPLIT_TYPES.includes(splitType)){
    errors.push('splitType must be one of: none, equal, custom');
  }
}

// The single place that resolves "does this group exist, is the caller an
// active member, and is it actually a SHARED group" — every shared-expense
// operation below goes through this first. Reuses groupService's existing
// IDOR-safe convention (getGroupAndMembership: non-member and non-existent
// group are both a 404) rather than reimplementing membership resolution.
// The Personal group has its own dedicated API (expenseService.js), which
// always resolves the group from the session and never trusts a client-
// supplied groupId at all — so a request hitting THIS API for the Personal
// group is a caller/client bug, not an authorization question, hence 403
// (the group's existence isn't in question — the caller IS an active member
// of it) rather than 404.
async function resolveSharedGroup(userId, groupId){
  const { group, membership } = await groupService.getGroupAndMembership(userId, groupId);
  if(group.type !== 'shared'){
    throw new ForbiddenError('Use the personal expenses API for the Personal group');
  }
  return { group, membership };
}

async function getActiveMembers(groupId){
  const rows = await memberRepo.listForGroup(groupId); // active only, default
  return {
    byUserId: new Map(rows.map(m => [m.user_id, m])),
    byId: new Map(rows.map(m => [m.id, m])),
    rows
  };
}

// paidBy must be a real users.id belonging to an ACTIVE member of this
// group. `grandfatheredUserId` (edits only) allows keeping an expense's
// existing paidBy even if that member has since been removed — but never
// lets a removed member be newly selected. Mirrors the frontend's
// resolveMembersForForm convention (js/pages/expenses.js).
function validatePaidBy(paidBy, activeMembers, errors, { grandfatheredUserId } = {}){
  if(typeof paidBy !== 'string' || !paidBy){
    errors.push('paidBy is required and must reference an active member of this group');
    return;
  }
  if(activeMembers.byUserId.has(paidBy)) return;
  if(grandfatheredUserId && paidBy === grandfatheredUserId) return;
  errors.push('paidBy must reference an active member of this group');
}

// Splits arrive as [{memberId, amount}] where memberId is a
// group_members.id (NOT a users.id) — matching the existing DB convention
// (expense_splits.group_member_id) and the existing frontend convention
// (js/pages/expenses.js builds splits keyed by GroupMember.id). Every
// member referenced must belong to THIS group's active membership, unless
// grandfathered (edits only) by already being referenced in the expense
// being edited — never lets a crafted payload pull in another group's
// member id, and never lets a removed member be newly selected.
//
// For splitType 'equal', the server recomputes the split itself — client-
// sent amounts for 'equal' are never trusted, only which members are
// included. This intentionally mirrors js/calculations.js's equalSplit
// exactly (integer-paise math, leftover paise assigned to the first N
// members in array order) so the persisted amounts always match what the
// frontend already showed the user in its own live preview.
//
// For splitType 'custom', every amount must be validated server-side
// (never rely on frontend validation): positive, and the total must
// exactly equal the expense amount (compared in integer paise).
function validateAndNormalizeSplits(splitType, splits, amountRupees, activeMembers, errors, { grandfatheredMemberIds } = {}){
  if(splitType === 'none' || splitType === undefined){
    return [];
  }
  if(!Array.isArray(splits) || splits.length === 0){
    errors.push('splits is required for equal/custom split types');
    return [];
  }

  const grandfathered = grandfatheredMemberIds || new Set();
  const seen = new Set();
  const normalized = [];
  for(const s of splits){
    const memberId = s && s.memberId;
    if(typeof memberId !== 'string' || !memberId){
      errors.push('each split must reference a valid memberId');
      continue;
    }
    if(seen.has(memberId)){
      errors.push('duplicate member in splits');
      continue;
    }
    seen.add(memberId);
    if(!activeMembers.byId.has(memberId) && !grandfathered.has(memberId)){
      errors.push('splits may only reference active members of this group');
      continue;
    }
    normalized.push({ memberId, amountRupees: Number(s.amount) });
  }
  if(errors.length) return [];

  if(splitType === 'equal'){
    const amountPaise = Math.round(Number(amountRupees) * 100);
    const memberIds = normalized.map(n => n.memberId);
    const base = Math.floor(amountPaise / memberIds.length);
    const remainder = amountPaise - base * memberIds.length;
    return memberIds.map((memberId, i) => ({
      groupMemberId: memberId,
      amountPaise: base + (i < remainder ? 1 : 0)
    }));
  }

  // custom
  let totalPaise = 0;
  const result = [];
  for(const n of normalized){
    if(!Number.isFinite(n.amountRupees) || n.amountRupees <= 0){
      errors.push('each custom split amount must be a positive number');
      continue;
    }
    const paise = Math.round(n.amountRupees * 100);
    totalPaise += paise;
    result.push({ groupMemberId: n.memberId, amountPaise: paise });
  }
  if(errors.length) return [];

  const expensePaise = Math.round(Number(amountRupees) * 100);
  if(totalPaise !== expensePaise){
    errors.push('split total must exactly equal the expense amount');
    return [];
  }
  return result;
}

// IDOR guard, same convention as expenseService.js's
// assertOwnedPersonalExpense: an expense that exists but belongs to a
// DIFFERENT group must be indistinguishable from one that doesn't exist at
// all — always NotFoundError (404), never ForbiddenError (403).
async function assertGroupExpense(groupId, expenseId){
  const row = await expenseRepo.findById(expenseId);
  if(!row || row.group_id !== groupId){
    throw new NotFoundError('Expense not found');
  }
  return row;
}

async function listSharedExpenses(userId, groupId){
  await resolveSharedGroup(userId, groupId);
  const rows = await expenseRepo.listForGroup(groupId);
  if(rows.length === 0) return [];
  const splitsByExpense = await splitRepo.listForExpenses(rows.map(r => r.id));
  return rows.map(row => toDto(row, splitsByExpense.get(row.id) || []));
}

async function createSharedExpense(userId, groupId, body){
  const errors = [];
  validateCoreFields(body, {}, errors);
  validateSplitType(body.splitType, errors);
  await resolveSharedGroup(userId, groupId);
  const activeMembers = await getActiveMembers(groupId);
  validatePaidBy(body.paidBy, activeMembers, errors);
  const splitType = body.splitType || 'none';
  const normalizedSplits = validateAndNormalizeSplits(splitType, body.splits, body.amount, activeMembers, errors);
  if(errors.length) throw new ValidationError('Invalid expense data', errors);

  const client = await db.getClient();
  try{
    await client.query('BEGIN');
    const expenseResult = await client.query(
      `INSERT INTO expenses (group_id, name, amount_paise, date, category_id, payment_method, notes, tags, added_by, paid_by, split_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        groupId, body.name.trim(), Math.round(Number(body.amount) * 100), body.date.slice(0, 10), body.category,
        body.paymentMethod || null, body.notes || null, body.tags || [],
        userId, // addedBy — always the authenticated caller, never from the client
        body.paidBy, splitType
      ]
    );
    const expense = expenseResult.rows[0];

    const splitRows = [];
    for(const s of normalizedSplits){
      const r = await client.query(
        `INSERT INTO expense_splits (expense_id, group_member_id, amount_paise) VALUES ($1, $2, $3) RETURNING *`,
        [expense.id, s.groupMemberId, s.amountPaise]
      );
      splitRows.push(r.rows[0]);
    }

    await client.query('COMMIT');
    return toDto(expense, splitRows);
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{
    client.release();
  }
}

async function updateSharedExpense(userId, groupId, expenseId, body){
  const errors = [];
  validateCoreFields(body, { partial: true }, errors);
  validateSplitType(body.splitType, errors);
  await resolveSharedGroup(userId, groupId);
  const existing = await assertGroupExpense(groupId, expenseId); // ownership check BEFORE any write
  const activeMembers = await getActiveMembers(groupId);
  const existingSplits = await splitRepo.listForExpense(expenseId);

  let paidByToUse = existing.paid_by;
  if(body.paidBy !== undefined){
    validatePaidBy(body.paidBy, activeMembers, errors, { grandfatheredUserId: existing.paid_by });
    paidByToUse = body.paidBy;
  }

  // If the caller touches amount, splitType, or splits at all, the full
  // split set is re-validated and recomputed together — the existing
  // frontend always resends splitType + the full splits array alongside
  // amount on every save (js/pages/expenses.js's bindForm), so this never
  // surprises a real caller, and it avoids ever leaving stale split rows
  // that no longer match a changed amount or splitType.
  let splitTypeToUse = existing.split_type;
  let normalizedSplits = null; // null = leave the splits table untouched
  if(body.splitType !== undefined || body.splits !== undefined || body.amount !== undefined){
    splitTypeToUse = body.splitType !== undefined ? body.splitType : existing.split_type;
    const amountForSplit = body.amount !== undefined ? body.amount : Number(existing.amount_paise) / 100;
    const grandfatheredMemberIds = new Set(existingSplits.map(s => s.group_member_id));
    normalizedSplits = validateAndNormalizeSplits(splitTypeToUse, body.splits, amountForSplit, activeMembers, errors, { grandfatheredMemberIds });
  }

  if(errors.length) throw new ValidationError('Invalid expense data', errors);

  const patch = {};
  if(body.name !== undefined) patch.name = body.name.trim();
  if(body.amount !== undefined) patch.amount_paise = Math.round(Number(body.amount) * 100);
  if(body.date !== undefined) patch.date = body.date.slice(0, 10);
  if(body.category !== undefined) patch.category_id = body.category;
  if(body.paymentMethod !== undefined) patch.payment_method = body.paymentMethod;
  if(body.notes !== undefined) patch.notes = body.notes;
  if(body.tags !== undefined) patch.tags = body.tags;
  if(body.paidBy !== undefined) patch.paid_by = paidByToUse;
  if(body.splitType !== undefined) patch.split_type = splitTypeToUse;

  const client = await db.getClient();
  try{
    await client.query('BEGIN');

    let updatedExpense = existing;
    if(Object.keys(patch).length > 0){
      const fields = [];
      const values = [];
      let i = 1;
      for(const [key, value] of Object.entries(patch)){
        fields.push(`${key} = $${i}`);
        values.push(value);
        i++;
      }
      fields.push('updated_at = now()'); // server-side always, never client-supplied
      values.push(expenseId);
      const updateResult = await client.query(
        `UPDATE expenses SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
        values
      );
      updatedExpense = updateResult.rows[0];
    }

    let finalSplitRows = existingSplits;
    if(normalizedSplits !== null){
      await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
      finalSplitRows = [];
      for(const s of normalizedSplits){
        const r = await client.query(
          `INSERT INTO expense_splits (expense_id, group_member_id, amount_paise) VALUES ($1, $2, $3) RETURNING *`,
          [expenseId, s.groupMemberId, s.amountPaise]
        );
        finalSplitRows.push(r.rows[0]);
      }
    }

    await client.query('COMMIT');
    return toDto(updatedExpense, finalSplitRows);
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{
    client.release();
  }
}

// Permission model note (Phase 5.7): the spec explicitly says not to invent
// an owner-only expense model and to follow the existing app convention
// when ambiguous. The existing frontend (js/pages/expenses.js) applies no
// addedBy-based restriction to editing/deleting an expense — any signed-in
// user acting within a group can edit/delete any expense in it. Delete
// therefore only requires ACTIVE membership (already enforced by
// resolveSharedGroup + assertGroupExpense), exactly like update — no
// additional ownership check is added here, matching documented existing
// behavior rather than introducing a stricter rule.
async function deleteSharedExpense(userId, groupId, expenseId){
  await resolveSharedGroup(userId, groupId);
  await assertGroupExpense(groupId, expenseId); // IDOR-safe ownership check BEFORE any write
  // expense_splits rows cascade-delete via their FK (ON DELETE CASCADE,
  // migration 006) — no manual cleanup needed here.
  await expenseRepo.remove(expenseId);
}

module.exports = {
  listSharedExpenses, createSharedExpense, updateSharedExpense, deleteSharedExpense
};
