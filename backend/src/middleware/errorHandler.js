const { AppError } = require('../errors');

// Must be registered LAST, after all routes — Express recognizes an error
// handler by its 4-argument signature.
function errorHandler(err, req, res, _next){
  if(err instanceof AppError){
    const body = { error: err.message };
    if(err.details) body.details = err.details;
    return res.status(err.statusCode).json(body);
  }

  // Postgres-specific errors get a safe, generic mapping — never leak raw
  // SQL/constraint text to the client, but log it server-side for debugging.
  if(err.code === '23505'){ // unique_violation
    console.error('Unique violation:', err.detail || err.message);
    return res.status(409).json({ error: 'This already exists.' });
  }
  if(err.code === '23503'){ // foreign_key_violation
    console.error('Foreign key violation:', err.detail || err.message);
    return res.status(400).json({ error: 'Referenced resource does not exist.' });
  }
  if(err.code === '23514'){ // check_violation
    console.error('Check violation:', err.detail || err.message);
    return res.status(400).json({ error: 'Invalid data.' });
  }

  // Anything else is unexpected — log the full error server-side, never
  // expose stack traces or raw messages to the client.
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
