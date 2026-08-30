const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const routes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp(){
  const app = express();

  // Basic security headers. No auth/session middleware yet — that's Phase 5.2.
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json());
  app.use(requestLogger);

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler); // must be registered last

  return app;
}

module.exports = createApp;
