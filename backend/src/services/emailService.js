/* emailService: sends real transactional email via Resend's REST API
 * (https://resend.com). Deliberately uses plain fetch rather than the
 * `resend` npm package — Resend's API is a single simple POST endpoint, so
 * this avoids adding a dependency for something a few lines of fetch already
 * does, and keeps this backend's dependency list unchanged.
 *
 * Only ever called when config.auth.emailMode !== 'development' (see
 * authService.js / invitationService.js) — every existing test file sets
 * AUTH_EMAIL_MODE=development, so this module is never exercised by the
 * existing test suite and requires zero test changes.
 */
const config = require('../config');
const { AppError } = require('../errors');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html }){
  if(!config.email.resendApiKey){
    // Fails loudly rather than silently pretending the email was sent —
    // a misconfigured production deployment should surface as a clear
    // error, not a user who never receives their sign-in link and has no
    // idea why.
    throw new AppError('Email sending is not configured on this server.', 500);
  }

  let response;
  try{
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: config.email.from, to, subject, html })
    });
  }catch(err){
    throw new AppError('Could not send email — the email provider is unreachable.', 502);
  }

  if(!response.ok){
    // Never surface Resend's raw error body to the client (could contain
    // internal details) — log server-side only.
    const detail = await response.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error('Resend API error:', response.status, detail);
    throw new AppError('Could not send email. Please try again shortly.', 502);
  }
}

function sendMagicLinkEmail({ to, url }){
  return sendEmail({
    to,
    subject: 'Your ExpenseTracker sign-in link',
    html: `
      <p>Click the link below to sign in to ExpenseTracker:</p>
      <p><a href="${url}">Sign in to ExpenseTracker</a></p>
      <p>This link expires in ${config.auth.magicLinkTtlMinutes} minutes. If you didn't request this, you can safely ignore this email.</p>
    `
  });
}

function sendInvitationEmail({ to, groupName, url }){
  return sendEmail({
    to,
    subject: `You've been invited to "${groupName}" on ExpenseTracker`,
    html: `
      <p>You've been invited to join the shared expense group <b>${groupName}</b> on ExpenseTracker.</p>
      <p><a href="${url}">View and accept invitation</a></p>
      <p>If you weren't expecting this, you can safely ignore this email.</p>
    `
  });
}

module.exports = { sendMagicLinkEmail, sendInvitationEmail };
