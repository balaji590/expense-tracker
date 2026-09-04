const crypto = require('crypto');
const config = require('../config');
const userRepo = require('../repositories/userRepository');
const magicLinkRepo = require('../repositories/magicLinkRepository');
const sessionRepo = require('../repositories/sessionRepository');
const groupService = require('./groupService');
const emailService = require('./emailService');
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

  // Real email sending is gated purely on emailMode, deliberately NOT on
  // the same double-gate as devMagicLink above. Those two gates answer
  // different questions: "is it safe to put the raw token in this JSON
  // response" (needs both conditions) vs. "did the operator actually ask
  // for real email" (only emailMode). If emailMode is still 'development'
  // in a misconfigured production deploy, the safest behavior is to send
  // nothing at all (matching pre-email-feature behavior exactly) rather
  // than attempt a real send nobody asked for. `redirect=1` tells the
  // verify route (routes/auth.js) to redirect the browser to the frontend
  // dashboard after signing in, instead of returning raw JSON — a real
  // email recipient clicking this link should land on the app, not a JSON
  // blob. The dev-mode link above intentionally omits this: the existing
  // "click here, then come back and press Continue" dev flow (pages/auth.js)
  // expects the JSON response.
  if(config.auth.emailMode !== 'development'){
    const verifyUrl = `${config.auth.devBaseUrl}/api/auth/verify?token=${rawToken}&redirect=1`;
    await emailService.sendMagicLinkEmail({ to: email, url: verifyUrl });
  }

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

  // Idempotent — safe on every login, not just the first. Guarantees the
  // Personal expense API (Phase 5.4) always has a group to work with.
  await groupService.ensurePersonalGroup(user.id);

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
