const crypto = require('crypto');
const config = require('../config');
const db = require('../db/pool');
const groupService = require('./groupService');
const groupRepo = require('../repositories/groupRepository');
const memberRepo = require('../repositories/groupMemberRepository');
const invitationRepo = require('../repositories/invitationRepository');
const userRepo = require('../repositories/userRepository');
const { ValidationError, NotFoundError, ForbiddenError, ConflictError, AppError } = require('../errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email){
  return String(email || '').trim().toLowerCase();
}

// Same entropy/hashing convention as magic-link and session tokens
// (authService.js) — 256-bit random, SHA-256 hash stored, raw token never
// persisted or logged.
function generateToken(){
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token){
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Never exposes token/token_hash — the only "secret" an API response ever
// carries is devInvitationLink, and only under the same double-gate used
// for magic links.
function toSafeInvitation(row){
  return {
    id: row.id,
    groupId: row.group_id,
    email: row.invited_email,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at || undefined
  };
}

async function createInvitation(userId, groupId, rawEmail){
  const { group, membership } = await groupService.getGroupAndMembership(userId, groupId); // 404 if not a member
  if(group.type === 'personal'){
    throw new ForbiddenError('The Personal group cannot have invitations');
  }
  if(membership.role !== 'owner'){
    throw new ForbiddenError('Only the group owner can invite members');
  }

  const email = normalizeEmail(rawEmail);
  if(!email || !EMAIL_RE.test(email)){
    throw new ValidationError('A valid email is required', ['body.email must be a valid email address']);
  }

  const inviter = await userRepo.findById(userId);
  if(inviter && normalizeEmail(inviter.email) === email){
    throw new ValidationError('You cannot invite yourself', ['email must not be your own']);
  }

  // Already an active member? Check by comparing normalized emails, not
  // raw display — an active member is identified by their User.email.
  const activeMembers = await memberRepo.listForGroup(groupId);
  for(const m of activeMembers){
    const memberUser = await userRepo.findById(m.user_id);
    if(memberUser && normalizeEmail(memberUser.email) === email){
      throw new ConflictError('This person is already a member of the group');
    }
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.auth.invitationTtlDays * 24 * 60 * 60 * 1000);

  // Duplicate pending invitation: revoke the old one and create a fresh one
  // (new token, new expiry) atomically. The DB's own partial unique index
  // (idx_invitations_one_pending) would reject a second pending row for the
  // same (group, email) anyway — this transaction is what makes "replace"
  // safe rather than erroring on that constraint.
  const client = await db.getClient();
  try{
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT * FROM invitations WHERE group_id = $1 AND invited_email = $2 AND status = 'pending'`,
      [groupId, email]
    );
    if(existing.rows.length){
      await client.query(`UPDATE invitations SET status = 'revoked' WHERE id = $1`, [existing.rows[0].id]);
    }
    const created = await client.query(
      `INSERT INTO invitations (group_id, invited_email, invited_by, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [groupId, email, userId, tokenHash, expiresAt]
    );
    await client.query('COMMIT');
    var invitation = created.rows[0];
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{
    client.release();
  }

  // Double-gated exactly like magic links: exposing the raw link requires
  // BOTH emailMode==='development' AND nodeEnv !== 'production'.
  const shouldExposeDevLink = config.auth.emailMode === 'development' && config.nodeEnv !== 'production';
  const devInvitationLink = shouldExposeDevLink
    ? `${config.auth.devBaseUrl}/api/invitations/${rawToken}/preview`
    : undefined;

  return { invitation: toSafeInvitation(invitation), devInvitationLink };
}

async function listInvitations(userId, groupId){
  const { membership } = await groupService.getGroupAndMembership(userId, groupId);
  if(membership.role !== 'owner'){
    throw new ForbiddenError('Only the group owner can view invitations');
  }
  const rows = await invitationRepo.listPendingForGroup(groupId);
  return rows.map(toSafeInvitation);
}

async function revokeInvitation(userId, groupId, invitationId){
  const { membership } = await groupService.getGroupAndMembership(userId, groupId);
  if(membership.role !== 'owner'){
    throw new ForbiddenError('Only the group owner can revoke invitations');
  }
  const invitation = await invitationRepo.findById(invitationId);
  if(!invitation || invitation.group_id !== groupId){
    throw new NotFoundError('Invitation not found'); // IDOR-safe: another group's invitation looks identical to nonexistent
  }
  if(invitation.status !== 'pending'){
    throw new ConflictError('Only a pending invitation can be revoked');
  }
  return toSafeInvitation(await invitationRepo.markRevoked(invitationId));
}

// Read-only preview — lets the frontend show "You've been invited to
// <group>" (and, if unauthenticated, "sign in as <email> to continue")
// WITHOUT consuming the invitation. Never reveals who invited them or
// anything beyond the group name and the intended email.
async function previewInvitation(rawToken){
  if(!rawToken || typeof rawToken !== 'string'){
    throw new ValidationError('A token is required', ['token is required']);
  }
  const tokenHash = hashToken(rawToken);
  const invitation = await invitationRepo.findByTokenHash(tokenHash);
  if(!invitation || invitation.status !== 'pending' || new Date(invitation.expires_at) <= new Date()){
    throw new AppError('This invitation is invalid, expired, or has already been used.', 400);
  }
  const group = await groupRepo.findById(invitation.group_id);
  return { groupName: group ? group.name : 'a group', email: invitation.invited_email };
}

async function acceptInvitation(userId, rawToken){
  if(!rawToken || typeof rawToken !== 'string'){
    throw new ValidationError('A token is required', ['token is required']);
  }
  const tokenHash = hashToken(rawToken);

  // Read-only lookup first — the invitation must NOT be consumed until
  // AFTER we've confirmed the authenticated user is the intended recipient.
  // Consuming it first (then rejecting on a wrong-user mismatch) would burn
  // the token for the correct recipient too, who might try it moments later.
  const invitation = await invitationRepo.findByTokenHash(tokenHash);
  if(!invitation || invitation.status !== 'pending' || new Date(invitation.expires_at) <= new Date()){
    throw new AppError('This invitation is invalid, expired, or has already been used.', 400);
  }

  const user = await userRepo.findById(userId);
  if(!user || normalizeEmail(user.email) !== invitation.invited_email){
    // Deliberately does not reveal the invited email or the group name to
    // the mismatched user — just that this invitation isn't theirs.
    throw new ForbiddenError('This invitation was sent to a different email address.');
  }

  // Everything past this point is one atomic transaction. The UPDATE below
  // re-checks status='pending' AND expires_at > now() at the database level
  // — this is what makes concurrent acceptance race-safe: if two requests
  // for the same (already-verified-correct-user) token arrive together,
  // only one UPDATE can match and return a row; the other gets zero rows
  // back and fails cleanly, never creating a duplicate membership.
  const client = await db.getClient();
  try{
    await client.query('BEGIN');
    const consumeResult = await client.query(
      `UPDATE invitations SET status = 'accepted', accepted_at = now()
       WHERE id = $1 AND status = 'pending' AND expires_at > now()
       RETURNING *`,
      [invitation.id]
    );
    if(consumeResult.rows.length === 0){
      await client.query('ROLLBACK');
      throw new AppError('This invitation is invalid, expired, or has already been used.', 400);
    }
    const consumed = consumeResult.rows[0];

    // Preserve historical membership semantics: if this user was a member
    // before and was soft-removed, REACTIVATE that same membership row
    // (same id) rather than creating a new one — any historical expense
    // splits already referencing their GroupMember.id stay correctly
    // attributed to the same identity, now active again.
    const existingMembership = await client.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [consumed.group_id, userId]
    );
    let memberRow;
    if(existingMembership.rows.length){
      const reactivated = await client.query(
        `UPDATE group_members SET removed_at = NULL, role = 'member', joined_at = now() WHERE id = $1 RETURNING *`,
        [existingMembership.rows[0].id]
      );
      memberRow = reactivated.rows[0];
    } else {
      const created = await client.query(
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') RETURNING *`,
        [consumed.group_id, userId]
      );
      memberRow = created.rows[0];
    }
    await client.query('COMMIT');
    const group = await groupRepo.findById(consumed.group_id);
    return { group, member: memberRow };
  }catch(err){
    await client.query('ROLLBACK');
    throw err;
  }finally{
    client.release();
  }
}

module.exports = {
  normalizeEmail, createInvitation, listInvitations, revokeInvitation, previewInvitation, acceptInvitation
};
