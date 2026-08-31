/* ApiClient: the single place any network request to the backend goes
 * through. No page and no other repository file calls fetch() directly for
 * application data — this is the centralized request/error boundary the
 * phase asks for.
 *
 * Authentication is the existing Phase 5.2 HttpOnly session cookie only —
 * `credentials: 'include'` is what makes the browser send it. Nothing here
 * ever reads, stores, or forwards a token in JavaScript, localStorage, or
 * sessionStorage.
 */
window.ApiError = class ApiError extends Error {
  constructor(message, status, code, details){
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code; // 'unauthorized'|'forbidden'|'not_found'|'conflict'|'validation'|'rate_limited'|'server_error'|'network_error'|'unknown'
    if(details) this.details = details;
  }
};

window.ApiClient = (function(){
  const SAFE_MESSAGES = {
    unauthorized: 'You need to sign in to do that.',
    forbidden: "You don't have permission to do that.",
    not_found: 'That item could not be found.',
    conflict: 'That change conflicts with existing data.',
    validation: 'Please check the information you entered.',
    rate_limited: 'Too many requests — please wait a moment and try again.',
    server_error: 'Something went wrong on our end. Please try again.',
    network_error: 'Could not reach the server. Check your connection and try again.',
    unknown: 'Something went wrong.'
  };

  function statusToCode(status){
    if(status === 401) return 'unauthorized';
    if(status === 403) return 'forbidden';
    if(status === 404) return 'not_found';
    if(status === 409) return 'conflict';
    if(status === 422 || status === 400) return 'validation';
    if(status === 429) return 'rate_limited';
    if(status >= 500) return 'server_error';
    return 'unknown';
  }

  async function request(path, options){
    options = options || {};
    let response;
    try{
      response = await fetch(`${AppConfig.apiBaseUrl()}${path}`, {
        method: options.method || 'GET',
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
        credentials: 'include', // sends the HttpOnly et_session cookie — the only auth mechanism
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
      });
    }catch(networkErr){
      // fetch() itself threw: offline, DNS failure, connection refused, CORS
      // block, etc. Never surface the raw browser error text.
      throw new ApiError(SAFE_MESSAGES.network_error, 0, 'network_error');
    }

    if(response.status === 204) return null; // DELETE success, no body

    let body = null;
    try{ body = await response.json(); }catch(e){ /* no/invalid JSON body is fine for some responses */ }

    if(!response.ok){
      const code = statusToCode(response.status);
      // The backend's own error responses are already safe/generic (see
      // backend/src/middleware/errorHandler.js — it never leaks stack
      // traces or SQL text), so passing body.error through is safe. We
      // still fall back to our own generic message if the body is missing
      // or malformed, so a raw network-level failure never surfaces
      // unexpected text either.
      const message = (body && body.error) || SAFE_MESSAGES[code] || SAFE_MESSAGES.unknown;
      throw new ApiError(message, response.status, code, body && body.details);
    }

    return body;
  }

  return { request };
})();
