import express from 'express';
import rateLimit from 'express-rate-limit';
import { healthCheck } from './controllers/health.controller.js';
import { getOAuthUrl, handleOAuthCallback } from './controllers/oauth.controller.js';
import { errorHandler, notFoundHandler } from './http/middleware/error.middleware.js';
import { requireApiKey } from './http/middleware/api-key.middleware.js';
import estoqueRouter from './routes/estoque.routes.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Muitas requisicoes. Aguarde um momento.' },
  }));
  app.use(requireApiKey);

  app.get('/', (req, res, next) => {
    if (req.query.code) return handleOAuthCallback(req, res, next);
    return next();
  });
  app.get('/health', healthCheck);
  app.get('/oauth/callback', handleOAuthCallback);
  app.get('/oauth/url', getOAuthUrl);
  app.use('/estoque', estoqueRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
