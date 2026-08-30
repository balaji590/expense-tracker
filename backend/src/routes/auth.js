const express = require('express');
const config = require('../config');
const authService = require('../services/authService');
const requireAuth = require('../middleware/requireAuth');
const { validate } = require('../middleware/validate');
const { rateLimit } = require('../middleware/rateLimiter');
const { parseCookies } = require('../utils/cookies');

const router = express.Router();

function setSessionCookie(res, rawToken){
  res.cookie(config.auth.cookieName, rawToken, {
    httpOnly: true,           // never readable from JavaScript — blocks XSS token theft
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.auth.sessionTtlDays * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res){
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}

// Rate-limited by IP+email so spamming link requests at one address (or from
// one client) is bounded. See middleware/rateLimiter.js for its real limits.
router.post('/auth/magic-link',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyFn: (req) => `${req.ip}:${authService.normalizeEmail(req.body && req.body.email)}`
  }),
  validate({ body: { email: { type: 'string', required: true } } }),
  async (req, res, next) => {
    try{
      const { devMagicLink } = await authService.requestMagicLink(req.body.email);
      // Generic response regardless of whether the email had an existing
      // account — never reveal account existence via response differences.
      const body = { message: 'If an account can use this email, a sign-in link has been generated.' };
      if(devMagicLink) body.devMagicLink = devMagicLink;
      res.status(200).json(body);
    }catch(err){ next(err); }
  }
);

// Not separately rate-limited: tokens carry 256 bits of entropy, so brute
// forcing a valid one here is infeasible regardless of request rate.
router.get('/auth/verify',
  validate({ query: { token: { type: 'string', required: true } } }),
  async (req, res, next) => {
    try{
      const { user, sessionRawToken } = await authService.verifyMagicLink(req.query.token);
      setSessionCookie(res, sessionRawToken);
      res.status(200).json({
        authenticated: true,
        user: { id: user.id, email: user.email, displayName: user.display_name }
      });
    }catch(err){ next(err); }
  }
);

router.get('/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ authenticated: true, user: req.user });
});

router.post('/auth/logout', async (req, res, next) => {
  try{
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[config.auth.cookieName];
    await authService.logout(rawToken);
    clearSessionCookie(res);
    res.status(200).json({ success: true });
  }catch(err){ next(err); }
});

module.exports = router;
