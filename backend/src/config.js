require('dotenv').config();

function required(name, fallback){
  const val = process.env[name];
  if(val !== undefined && val !== '') return val;
  if(fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';
const isProduction = nodeEnv === 'production';

module.exports = {
  nodeEnv,
  isTest,
  isProduction,
  port: parseInt(process.env.PORT || '3001', 10),
  // Production must explicitly configure CORS_ORIGIN — no silent localhost
  // fallback once real traffic is involved. Development keeps the
  // convenient default so local setup stays simple.
  corsOrigin: (isProduction ? required('CORS_ORIGIN') : (process.env.CORS_ORIGIN || 'http://localhost:8080'))
    .split(',').map(s => s.trim()),
  db: {
    host: required('DB_HOST', 'localhost'),
    port: parseInt(process.env.DB_PORT || '5432', 10),
    // Tests always run against TEST_DB_NAME, never the dev database, so a
    // test run can never truncate/corrupt real development data.
    database: isTest ? required('TEST_DB_NAME') : required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    // Cloud Postgres providers (Neon, Supabase, RDS, etc.) require SSL.
    // Local Postgres typically doesn't support/need it, so this defaults
    // to off and must be explicitly enabled via DB_SSL=true.
    ssl: process.env.DB_SSL === 'true'
  },
  auth: {
    magicLinkTtlMinutes: parseInt(process.env.AUTH_MAGIC_LINK_TTL_MINUTES || '15', 10),
    sessionTtlDays: parseInt(process.env.AUTH_SESSION_TTL_DAYS || '30', 10),
    invitationTtlDays: parseInt(process.env.AUTH_INVITATION_TTL_DAYS || '7', 10),
    // 'development' is the only mode that ever exposes a raw magic link in
    // an API response. Double-gated below (also requires nodeEnv !== 'production')
    // so a misconfigured AUTH_EMAIL_MODE can never leak a real token in prod.
    emailMode: process.env.AUTH_EMAIL_MODE || 'development',
    devBaseUrl: process.env.AUTH_DEV_BASE_URL || `http://localhost:${parseInt(process.env.PORT || '3001', 10)}`,
    cookieName: process.env.AUTH_COOKIE_NAME || 'et_session',
    cookieSecure: process.env.AUTH_COOKIE_SECURE !== undefined
      ? process.env.AUTH_COOKIE_SECURE === 'true'
      : isProduction
  },
  email: {
    // Used to send real magic-link/invitation emails whenever
    // AUTH_EMAIL_MODE !== 'development' (see emailService.js). Not
    // `required()` here — a deployment that never leaves dev mode simply
    // never needs it, and emailService.js itself throws a clear error if a
    // send is attempted without it configured, rather than failing at
    // server startup for a deployment that doesn't need email at all.
    resendApiKey: process.env.RESEND_API_KEY,
    // Resend's own shared sandbox sender — works with zero setup (no
    // domain verification needed) so real email sending works immediately;
    // switch to a verified custom domain address once you have one.
    from: process.env.EMAIL_FROM || 'ExpenseTracker <onboarding@resend.dev>',
    // The frontend's public URL — used to build the invitation-accept link
    // and the post-sign-in redirect destination. Falls back to the
    // dev-mode local frontend for local testing.
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080'
  }
};
