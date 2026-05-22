import 'dotenv/config';
import { createApp } from './app.js';
import { env, getMissingRequiredEnv } from './config/env.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`[server] Bling Estoque API running on port ${env.port}`);
  console.log(`[server] Health check: http://localhost:${env.port}/health`);
  console.log(`[server] Stock query: http://localhost:${env.port}/estoque?q=<product>`);

  const missing = getMissingRequiredEnv();
  if (missing.length > 0) {
    console.error('[server] WARNING: Missing required environment variables:', missing.join(', '));
  }
});
