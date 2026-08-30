require('dotenv').config();

function required(name, fallback){
  const val = process.env[name];
  if(val !== undefined && val !== '') return val;
  if(fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

module.exports = {
  nodeEnv,
  isTest,
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:8080').split(',').map(s => s.trim()),
  db: {
    host: required('DB_HOST', 'localhost'),
    port: parseInt(process.env.DB_PORT || '5432', 10),
    // Tests always run against TEST_DB_NAME, never the dev database, so a
    // test run can never truncate/corrupt real development data.
    database: isTest ? required('TEST_DB_NAME') : required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD')
  }
};
