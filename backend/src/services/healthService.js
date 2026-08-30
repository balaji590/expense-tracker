const db = require('../db/pool');

async function checkHealth(){
  const dbOk = await db.healthCheck().catch(() => false);
  return {
    status: dbOk ? 'ok' : 'degraded',
    database: dbOk ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  };
}

module.exports = { checkHealth };
