const expenseRepo = require('../repositories/expenseRepository');
const groupRepo = require('../repositories/groupRepository');
const { toDto } = require('./expenseMapper');
const { ValidationError, NotFoundError } = require('../errors');

function validateInput(body, { partial = false } = {}){
  const errors = [];
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
  if(errors.length) throw new ValidationError('Invalid expense data', errors);
}

// Every operation resolves the caller's OWN Personal group from their
// authenticated userId — a client can never supply or influence which
// group is used. This is the core of Phase 5.4's "Personal mode only,
// no exposed group selection" requirement.
async function getPersonalGroupIdOrThrow(userId){
  const group = await groupRepo.findPersonalGroupForUser(userId);
  if(!group){
    // Should be unreachable post-login (authService.verifyMagicLink always
    // ensures this), but never assume — fail closed, not open.
    throw new NotFoundError('Personal group not found for this user');
  }
  return group.id;
}

async function listPersonalExpenses(userId){
  const groupId = await getPersonalGroupIdOrThrow(userId);
  const rows = await expenseRepo.listForGroup(groupId);
  return rows.map(toDto);
}

async function createPersonalExpense(userId, body){
  validateInput(body);
  const groupId = await getPersonalGroupIdOrThrow(userId);
  // groupId/addedBy/paidBy are NEVER taken from the client — always the
  // caller's own Personal group and own identity, server-side.
  const row = await expenseRepo.create({
    groupId,
    name: body.name.trim(),
    amountPaise: Math.round(Number(body.amount) * 100),
    date: body.date.slice(0, 10),
    categoryId: body.category,
    paymentMethod: body.paymentMethod || null,
    notes: body.notes || null,
    tags: body.tags || [],
    addedBy: userId,
    paidBy: userId,
    splitType: 'none'
  });
  return toDto(row);
}

// IDOR guard: an expense that exists but belongs to someone else's group
// must be indistinguishable from one that doesn't exist at all — always
// NotFoundError (404), never ForbiddenError (403), so a probing request
// against another user's expense ID learns nothing.
async function assertOwnedPersonalExpense(userId, expenseId){
  const groupId = await getPersonalGroupIdOrThrow(userId);
  const row = await expenseRepo.findById(expenseId);
  if(!row || row.group_id !== groupId){
    throw new NotFoundError('Expense not found');
  }
  return row;
}

async function updatePersonalExpense(userId, expenseId, body){
  validateInput(body, { partial: true });
  await assertOwnedPersonalExpense(userId, expenseId); // ownership check BEFORE any write

  const patch = {};
  if(body.name !== undefined) patch.name = body.name.trim();
  if(body.amount !== undefined) patch.amount_paise = Math.round(Number(body.amount) * 100);
  if(body.date !== undefined) patch.date = body.date.slice(0, 10);
  if(body.category !== undefined) patch.category_id = body.category;
  if(body.paymentMethod !== undefined) patch.payment_method = body.paymentMethod;
  if(body.notes !== undefined) patch.notes = body.notes;
  if(body.tags !== undefined) patch.tags = body.tags;

  const row = await expenseRepo.update(expenseId, patch); // updated_at is set server-side inside the repository, never client-supplied
  return toDto(row);
}

async function deletePersonalExpense(userId, expenseId){
  await assertOwnedPersonalExpense(userId, expenseId); // ownership check BEFORE any write
  await expenseRepo.remove(expenseId);
}

module.exports = { listPersonalExpenses, createPersonalExpense, updatePersonalExpense, deletePersonalExpense };
