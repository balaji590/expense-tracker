const groupRepo = require('../repositories/groupRepository');
const memberRepo = require('../repositories/groupMemberRepository');

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

module.exports = { ensurePersonalGroup };
