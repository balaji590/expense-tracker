/*
 * In-memory, single-process, fixed-window rate limiter.
 *
 * This is fine for local development and a single backend instance. It is
 * NOT sufficient for a real production deployment: as soon as there is more
 * than one server process (a load balancer, multiple container replicas,
 * a restart mid-window), each process has its own independent counters, so
 * the effective limit multiplies by the number of instances and resets on
 * every restart. A production deployment needs a shared store (e.g. Redis)
 * or a rate limiter enforced at the edge/proxy layer.
 *
 * This module exists to establish the middleware boundary — where a real
 * limiter would plug in — and to provide *some* protection against trivial
 * local abuse, not as a production rate-limiting solution.
 */
const hits = new Map(); // key -> array of request timestamps within the current window

function rateLimit({ windowMs, max, keyFn }){
  return function rateLimitMiddleware(req, res, next){
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter(t => now - t < windowMs);

    if(timestamps.length >= max){
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

// Test-only escape hatch — lets the test suite reset counters between runs
// without needing to wait out real windows.
function _resetForTests(){
  hits.clear();
}

module.exports = { rateLimit, _resetForTests };
