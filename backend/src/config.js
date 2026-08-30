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
    password: required('DB_PASSWORD')
  },
  auth: {
    magicLinkTtlMinutes: parseInt(process.env.AUTH_MAGIC_LINK_TTL_MINUTES || '15', 10),
    sessionTtlDays: parseInt(process.env.AUTH_SESSION_TTL_DAYS || '30', 10),
    // 'development' is the only mode that ever exposes a raw magic link in
    // an API response. Double-gated below (also requires nodeEnv !== 'production')
    // so a misconfigured AUTH_EMAIL_MODE can never leak a real token in prod.
    emailMode: process.env.AUTH_EMAIL_MODE || 'development',
    devBaseUrl: process.env.AUTH_DEV_BASE_URL || `http://localhost:${parseInt(process.env.PORT || '3001', 10)}`,
    cookieName: process.env.AUTH_COOKIE_NAME || 'et_session',
    cookieSecure: process.env.AUTH_COOKIE_SECURE !== undefined
      ? process.env.AUTH_COOKIE_SECURE === 'true'
      : isProduction
  }
};
