const crypto = require('crypto');
const config = require('../config');
const userRepo = require('../repositories/userRepository');
const magicLinkRepo = require('../repositories/magicLinkRepository');
const sessionRepo = require('../repositories/sessionRepository');
const { ValidationError, AppError } = require('../errors');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email){
  return String(email || '').trim().toLowerCase();
}

// 256 bits of entropy, URL-safe — used for both magic-link and session
// tokens. Brute-forcing this is infeasible, which is why verify/session
// lookups don't need their own rate limiting on top of this.
function generateToken(){
  return crypto.randomBytes(32).toString('base64url');
}

// Only the hash is ever persisted — the raw token exists solely in the
// generated URL (magic link) or the HttpOnly cookie (session), never in the
// database, and never in a log line.
function hashToken(token){
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requestMagicLink(rawEmail){
  const email = normalizeEmail(rawEmail);
  if(!email || !EMAIL_RE.test(email)){
    throw new ValidationError('A valid email is required', ['body.email must be a valid email address']);
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + config.auth.magicLinkTtlMinutes * 60 * 1000);

  await magicLinkRepo.create({ email, tokenHash, expiresAt });

  // Double-gated: exposing the raw link requires BOTH emailMode==='development'
  // AND nodeEnv !== 'production', so a misconfigured AUTH_EMAIL_MODE alone
  // can never leak a real token in a production deployment.
  const shouldExposeDevLink = config.auth.emailMode === 'development' && config.nodeEnv !== 'production';
  const devMagicLink = shouldExposeDevLink
    ? `${config.auth.devBaseUrl}/api/auth/verify?token=${rawToken}`
    : undefined;

  return { devMagicLink };
}

async function verifyMagicLink(rawToken){
  if(!rawToken || typeof rawToken !== 'string'){
    throw new ValidationError('A token is required', ['query.token is required']);
  }

  const tokenHash = hashToken(rawToken);
  const record = await magicLinkRepo.consumeIfValid(tokenHash);
  if(!record){
    // Deliberately the same generic message whether the token was never
    // valid, already used, or expired — no need to distinguish for the caller,
    // and distinguishing invites timing/enumeration analysis for no benefit.
    throw new AppError('This link is invalid or has expired.', 400);
  }

  let user = await userRepo.findByEmail(record.email);
  if(!user){
    // First successful verification for this email — this is the ONLY place
    // a user is ever created from a magic-link flow (never at request time),
    // so an email that requests a link but never clicks it never leaves a
    // phantom user row behind.
    const displayName = record.email.split('@')[0];
    user = await userRepo.create({ email: record.email, displayName });
  }

  const sessionRawToken = generateToken();
  const sessionTokenHash = hashToken(sessionRawToken);
  const sessionExpiresAt = new Date(Date.now() + config.auth.sessionTtlDays * 24 * 60 * 60 * 1000);
  const session = await sessionRepo.create({ userId: user.id, tokenHash: sessionTokenHash, expiresAt: sessionExpiresAt });

  return { user, session, sessionRawToken };
}

async function resolveSession(rawSessionToken){
  if(!rawSessionToken) return null;
  const tokenHash = hashToken(rawSessionToken);
  const session = await sessionRepo.findActiveByTokenHash(tokenHash);
  if(!session) return null;
  const user = await userRepo.findById(session.user_id);
  if(!user) return null;
  await sessionRepo.touchLastSeen(session.id);
  return { user, session };
}

async function logout(rawSessionToken){
  if(!rawSessionToken) return;
  const tokenHash = hashToken(rawSessionToken);
  await sessionRepo.revokeByTokenHash(tokenHash);
}

module.exports = {
  normalizeEmail, generateToken, hashToken,
  requestMagicLink, verifyMagicLink, resolveSession, logout
};
