import { env } from '../../config/env.js';

const PUBLIC_PATHS = new Set(['/health', '/oauth/callback']);

export function requireApiKey(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (req.path === '/' && req.query.code) return next();

  if (!env.apiSecretKey) {
    console.warn('[auth] API_SECRET_KEY not configured. Authentication disabled.');
    return next();
  }

  if (req.headers['x-api-key'] !== env.apiSecretKey) {
    return res.status(401).json({ message: 'Invalid or missing API key.' });
  }

  return next();
}
