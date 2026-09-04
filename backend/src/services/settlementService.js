/* settlementService: Phase 5.8 — Balances & Settlements Cloud Synchronization.
 *
 * Mirrors sharedExpenseService.js's shape (validate -> resolve -> mutate),
 * with one key addition: a settlement isn't just "is this a valid member
 * pair with a positive amount" -- it also has to move money in a direction
 * the group's CURRENT balances actually call for. See createSettlement.
 *
 * created_by vs from_user_id (Phase 5.8 clarification): settle-up.js lets
 * the authenticated user record a settlement between any two OTHER group
 * members (the "Paid by"/"Received by" selects aren't restricted to the
 * caller) -- so from_user_id/to_user_id are the payer/payee, never a
 * reliable stand-in for who actually performed the action. created_by
 * (migration 011) is the real audit identity, always derived from
 * req.user.id, never trusted from the client body.
 */
const settlementRepo = require('../repositories/settlementRepository');
const expenseRepo = require('../repositories/expenseRepository');
const splitRepo = require('../repositories/expenseSplitRepository');
const memberRepo = require('../repositories/groupMemberRepository');
const groupService = require('./groupService');
const { ValidationError, ForbiddenError } = require('../errors');

// Same convention as sharedExpenseService.js's resolveSharedGroup: the
// Personal group has no settlements concept at all (there's no one else to
// settle with), so it's explicitly rejected here rather than silently
// returning an empty list.
async function resolveSharedGroup(userId, groupId){
  const { group, membership } = await groupService.getGroupAndMembership(userId, groupId);
  if(group.type !== 'shared'){
    throw new ForbiddenError('Settlements are only available for shared groups');
  }
  return { group, membership };
}

// Recomputes each member's net balance in integer paise, mirroring
// js/balances.js's balancesForGroup EXACTLY (paid - owed + settled) --
// operating directly on raw amount_paise DB values throughout, never
// converting through floating-point rupees. This is the server's own
// authoritative recomputation, used only to validate a proposed
// settlement's direction/amount; it must never drift from what the
// existing client-side formula would produce for the same data.
async function computeBalancesPaise(groupId){
  const [expenseRows, settlementRows, members] = await Promise.all([
    expenseRepo.listForGroup(groupId),
    settlementRepo.listForGroup(groupId),
    memberRepo.listForGroup(groupId, { includeRemoved: true }) // historical balances must stay correct for removed members too
  ]);

  const sharedExpenseRows = expenseRows.filter(e => e.split_type === 'equal' || e.split_type === 'custom');
  const splitsByExpense = await splitRepo.listForExpenses(sharedExpenseRows.map(e => e.id));

  const paidByUser = {};
  const owedByMember = {};
  sharedExpenseRows.forEach(e => {
    paidByUser[e.paid_by] = (paidByUser[e.paid_by] || 0) + Number(e.amount_paise);
    (splitsByExpense.get(e.id) || []).forEach(s => {
      owedByMember[s.group_member_id] = (owedByMember[s.group_member_id] || 0) + Number(s.amount_paise);
    });
  });

  const settledByUser = {};
  settlementRows.forEach(s => {
    settledByUser[s.from_user_id] = (settledByUser[s.from_user_id] || 0) + Number(s.amount_paise);
    settledByUser[s.to_user_id] = (settledByUser[s.to_user_id] || 0) - Number(s.amount_paise);
  });

  return members.map(m => ({
    userId: m.user_id,
    balancePaise: (paidByUser[m.user_id] || 0) - (owedByMember[m.id] || 0) + (settledByUser[m.user_id] || 0)
  }));
}

// Exact port of js/balances.js's whoOwesWhom (greedy largest-creditor /
// largest-debtor matching), in paise. This is the SAME algorithm
// settle-up.js already uses to render its "Who owes whom" suggested-
// transfer list -- reused here (not reinvented) as the authoritative
// definition of "does fromUserId currently owe toUserId, and how much" for
// server-side validation. Deliberately not a rewrite of the balance
// algorithm, per the Phase 5.8 scope boundary.
function whoOwesWhomPaise(balances){
  const creditors = balances.filter(b => b.balancePaise > 0)
    .map(b => ({ userId: b.userId, remaining: b.balancePaise }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = balances.filter(b => b.balancePaise < 0)
    .map(b => ({ userId: b.userId, remaining: -b.balancePaise }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers = [];
  let ci = 0, di = 0;
  while(ci < creditors.length && di < debtors.length){
    const c = creditors[ci], d = debtors[di];
    const amountPaise = Math.min(c.remaining, d.remaining);
    if(amountPaise > 0){
      transfers.push({ fromUserId: d.userId, toUserId: c.userId, amountPaise });
    }
    c.remaining -= amountPaise;
    d.remaining -= amountPaise;
    if(c.remaining <= 0) ci++;
    if(d.remaining <= 0) di++;
  }
  return transfers;
}

function toDto(row){
  return {
    id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: Number(row.amount_paise) / 100,
    date: new Date(row.date).toISOString(),
    note: row.note || '',
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined
  };
}

async function listSettlements(userId, groupId){
  await resolveSharedGroup(userId, groupId);
  const rows = await settlementRepo.listForGroup(groupId);
  return rows.map(toDto);
}

async function createSettlement(userId, groupId, body){
  const errors = [];
  if(typeof body.fromUserId !== 'string' || !body.fromUserId) errors.push('fromUserId is required');
  if(typeof body.toUserId !== 'string' || !body.toUserId) errors.push('toUserId is required');
  if(body.fromUserId && body.toUserId && body.fromUserId === body.toUserId) errors.push('fromUserId and toUserId must be different');
  const amountPaise = Math.round(Number(body.amount) * 100);
  if(!Number.isFinite(amountPaise) || amountPaise <= 0) errors.push('amount must be a positive number');
  if(!body.date || Number.isNaN(Date.parse(body.date))) errors.push('date is required and must be a valid date');
  if(body.note !== undefined && typeof body.note !== 'string') errors.push('note must be a string');
  if(errors.length) throw new ValidationError('Invalid settlement data', errors);

  await resolveSharedGroup(userId, groupId);

  // No grandfathering on create — a removed member can never be selected
  // for a NEW settlement, matching the same rule already established for
  // paidBy/split members in sharedExpenseService.js.
  const activeMembers = await memberRepo.listForGroup(groupId);
  const activeUserIds = new Set(activeMembers.map(m => m.user_id));
  if(!activeUserIds.has(body.fromUserId)) errors.push('fromUserId must be an active member of this group');
  if(!activeUserIds.has(body.toUserId)) errors.push('toUserId must be an active member of this group');
  if(errors.length) throw new ValidationError('Invalid settlement data', errors);

  // Direction + amount validated against the pairwise resolution of the
  // group's CURRENT balances — never trusted from the client. A settlement
  // is only valid if it moves money in a direction (and up to an amount)
  // the current balances actually call for. This is what rejects both
  // over-settlement (amount exceeds what's owed) and wrong-direction
  // settlements (claiming B paid A when the balances say A owes B, or when
  // nothing is owed between this specific pair at all).
  const balances = await computeBalancesPaise(groupId);
  const transfers = whoOwesWhomPaise(balances);
  const match = transfers.find(t => t.fromUserId === body.fromUserId && t.toUserId === body.toUserId);
  if(!match || amountPaise > match.amountPaise){
    throw new ValidationError('Invalid settlement data', [
      'This settlement does not match the group\'s current balances (either nothing is owed in this direction, or the amount exceeds what is owed).'
    ]);
  }

  const row = await settlementRepo.create({
    groupId,
    fromUserId: body.fromUserId,
    toUserId: body.toUserId,
    amountPaise,
    date: body.date.slice(0, 10),
    note: body.note,
    createdBy: userId // audit identity — always the authenticated caller, never the client-supplied fromUserId/toUserId
  });
  return toDto(row);
}

module.exports = { listSettlements, createSettlement };
