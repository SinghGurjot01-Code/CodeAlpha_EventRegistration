const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

/**
 * Create the Express.js application instance.
 * Dependencies (D1 repositories + services + config) are resolved per request via `resolveContext`.
 */
function createApp(resolveContext) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    try {
      req.ctx = resolveContext(req);
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res, next) => {
    const { corsOrigins } = req.ctx.config;
    if (!corsOrigins.length) return next();
    return cors({
      origin: corsOrigins.includes('*') ? true : corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Codes'],
    })(req, res, next);
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
