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
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSecure ? 'none' : 'lax',
    path: '/',
    maxAge: config.auth.sessionTtlDays * 24 * 60 * 60 * 1000
  });
}

function clearSessionCookie(res){
  res.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSecure ? 'none' : 'lax',
    path: '/'
  });
}

router.post('/auth/magic-link',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyFn: (req) => req.ip + ':' + authService.normalizeEmail(req.body && req.body.email)
  }),
  validate({ body: { email: { type: 'string', required: true } } }),
  async (req, res, next) => {
    try{
      const { devMagicLink } = await authService.requestMagicLink(req.body.email);
      const body = { message: 'If an account can use this email, a sign-in link has been generated.' };
      if(devMagicLink) body.devMagicLink = devMagicLink;
      res.status(200).json(body);
    }catch(err){ next(err); }
  }
);

router.get('/auth/verify',
  validate({ query: { token: { type: 'string', required: true } } }),
  async (req, res, next) => {
    try{
      const { user, sessionRawToken } = await authService.verifyMagicLink(req.query.token);
      setSessionCookie(res, sessionRawToken);
      // A real email's link includes ?redirect=1 (see authService.js) so
      // clicking it lands the person on the actual app, not a JSON blob.
      // The existing dev-mode link (pages/auth.js's "click here, then come
      // back and press Continue" flow) never sets this, so its JSON
      // response is completely unchanged — zero impact on that flow or on
      // every existing test's loginAs() helper, which also relies on the
      // JSON body and never passes redirect=1.
      if(req.query.redirect === '1'){
        res.redirect(302, `${config.email.frontendUrl}/#/dashboard`);
        return;
      }
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