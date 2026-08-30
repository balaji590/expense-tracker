const config = require('../config');
const authService = require('../services/authService');
const { parseCookies } = require('../utils/cookies');
const { UnauthorizedError } = require('../errors');

async function requireAuth(req, res, next){
  try{
    const cookies = parseCookies(req.headers.cookie);
    const rawToken = cookies[config.auth.cookieName];
    const resolved = rawToken ? await authService.resolveSession(rawToken) : null;

    if(!resolved){
      throw new UnauthorizedError();
    }

    // Only ever attach the safe, public shape of the user — never the raw
    // session token, its hash, or any other internal field.
    req.user = {
      id: resolved.user.id,
      email: resolved.user.email,
      displayName: resolved.user.display_name
    };
    req.session = { id: resolved.session.id };
    next();
  }catch(err){
    next(err);
  }
}

module.exports = requireAuth;
