const db = require('../db/pool');
const groupRepo = require('../repositories/groupRepository');
const memberRepo = require('../repositories/groupMemberRepository');
const { ValidationError, NotFoundError, ForbiddenError, AppError } = require('../errors');

// Idempotent: safe to call on every login. If a race ever causes two
// concurrent calls for a brand-new user, the DB's partial unique index
// (idx_groups_one_personal_per_user) lets exactly one INSERT succeed; the
// other hits a unique_violation, and we simply re-fetch the winning row
// rather than erroring.
async function ensurePersonalGroup(userId){
  const existing = await groupRepo.findPersonalGroupForUser(userId);
  if(existing) return existing;

  try{
    const group = await groupRepo.create({ name: 'Personal', type: 'personal', createdBy: userId });
    await memberRepo.create({ groupId: group.id, userId, role: 'owner' });
    return group;
  }catch(err){
    if(err.code === '23505'){ // unique_violation — someone else's concurrent call won the race
      const winningGroup = await groupRepo.findPersonalGroupForUser(userId);
      if(winningGroup) return winningGroup;
    }
    throw err;
  }
}

function validateGroupName(name){
  if(typeof name !== 'string'){
    throw new ValidationError('Invalid group name', ['name must be a string']);
  }
  const trimmed = name.trim();
  if(!trimmed){
    throw new ValidationError('Invalid group name', ['name is required']);
  }
  if(trimmed.length > 100){
    throw new ValidationError('Invalid group name', ['name must be 100 characters or fewer']);
  }
  return trimmed;
}

// The single place that resolves "does this group exist, and is this user
// an active member of it" — used by every group/membership operation below.
// A group that doesn't exist and a group the user isn't a member of are
// DELIBERATELY indistinguishable (both 404), following the same IDOR-safety
// convention established for the Personal expense API in Phase 5.4: a
// non-member must learn nothing about a group's existence, name, or type.
async function getGroupAndMembership(userId, groupId){
  const group = await groupRepo.findById(groupId);
  if(!group){
    throw new NotFoundError('Group not found');
  }
  const members = await memberRepo.listForGroup(groupId); // active only, default
  const membership = members.find(m => m.user_id === userId);
  if(!membership){
    throw new NotFoundError('Group not found'); // same status/message as "doesn't exist" — no distinction leaked
  }
  return { group, membership };
}

// Once a user is a confirmed active member (the check above already
// passed), lacking the owner role is a permission problem on a resource
// they legitimately know exists — 403 is safe and correct here, unlike the
// 404 used for non-members.
function assertOwner(membership, message){
  if(membership.role !== 'owner'){
    throw new ForbiddenError(message || 'Only the group owner can do that');
  }
}

async function listGroupsForUser(userId){
  const rows = await groupRepo.listForUser(userId);
  // Personal group first, matching the existing Groups page's layout.
  return rows.sort((a, b) => {
    if(a.type === 'personal') return -1;
    if(b.type === 'personal') return 1;
    return 0;
  });
}

async function createGroup(userId, name){
  const trimmed = validateGroupName(name);
  // Atomic: the group and its owner-membership row must both exist or
  // neither should — never a group with no members.
  const client = await db.getClient();
  try{
    await client.query('BEGIN');
    const groupResult = await client.query(
      `INSERT INTO groups (name, type, created_by) VALUES ($1, 'shared', $2) RETURNING *`,
      [trimmed, userId]
    );
    const group = groupResult.rows[0];
    const memberResult = await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner') RETURNING *`,
      [group.id, userId]
    );
    await client.query('COMMIT');
    // Returning the membership row alongside the group avoids a second
    // round-trip for the frontend to learn the owner-membership's own id.
    return { group, membership: memberResult.rows[0] };
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{
    client.release();
  }
}

async function renameGroup(userId, groupId, name){
  const { group, membership } = await getGroupAndMembership(userId, groupId);
  if(group.type === 'personal'){
    throw new ForbiddenError('The Personal group cannot be renamed');
  }
  assertOwner(membership, 'Only the group owner can rename this group');
  const trimmed = validateGroupName(name);
  return groupRepo.rename(groupId, trimmed);
}

async function deleteGroupById(userId, groupId){
  const { group, membership } = await getGroupAndMembership(userId, groupId);
  if(group.type === 'personal'){
    throw new ForbiddenError('The Personal group cannot be deleted');
  }
  assertOwner(membership, 'Only the group owner can delete this group');
  // ON DELETE CASCADE (Phase 5.1 schema, unchanged) removes group_members,
  // expenses, invitations, and settlements for this group. Users themselves
  // are never affected by a group's deletion.
  await groupRepo.remove(groupId);
}

async function listMembers(userId, groupId){
  await getGroupAndMembership(userId, groupId); // any active member may view the list
  return memberRepo.listForGroup(groupId);
}

// Explicitly NOT implemented: adding a member requires a real email
// identity (users.email is UNIQUE NOT NULL), and fabricating one would
// create a fake account — disallowed by design. This is a documented
// limitation, not an oversight: real invitations (Phase 5.6) are what
// makes "add a member" meaningful in cloud mode. Still verifies the
// group/membership first, so the error only ever reaches an actual member.
async function addMemberByName(userId, groupId){
  await getGroupAndMembership(userId, groupId);
  throw new AppError("Adding members isn't available yet in cloud mode — invitations are coming in a future update.", 501);
}

async function removeMember(userId, groupId, memberId){
  const { membership: actingMembership } = await getGroupAndMembership(userId, groupId);
  assertOwner(actingMembership, 'Only the group owner can remove members');

  const targetMember = await memberRepo.findById(memberId);
  if(!targetMember || targetMember.group_id !== groupId){
    throw new NotFoundError('Member not found'); // IDOR-safe: a memberId from another group looks identical to a nonexistent one
  }
  if(targetMember.role === 'owner'){
    // Exactly one owner per group by design (the creator) — removing them
    // would leave the group ownerless, so this is always blocked.
    throw new ForbiddenError('The group owner cannot be removed');
  }
  return memberRepo.softRemove(memberId);
}

module.exports = {
  ensurePersonalGroup, listGroupsForUser, createGroup, renameGroup, deleteGroupById,
  listMembers, addMemberByName, removeMember, getGroupAndMembership
};
