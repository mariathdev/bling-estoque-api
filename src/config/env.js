import path from 'node:path';

export const env = {
  apiSecretKey: process.env.API_SECRET_KEY || '',
  port: Number(process.env.PORT || 3000),
  bling: {
    baseUrl: process.env.BLING_BASE_URL || 'https://api.bling.com.br/Api/v3',
    authUrl: process.env.BLING_AUTH_URL || 'https://www.bling.com.br/Api/v3/oauth/authorize',
    tokenUrl: process.env.BLING_TOKEN_URL || '',
    clientId: process.env.BLING_CLIENT_ID || '',
    clientSecret: process.env.BLING_CLIENT_SECRET || '',
    accessToken: process.env.BLING_ACCESS_TOKEN || '',
    refreshToken: process.env.BLING_REFRESH_TOKEN || '',
    syncEnv: process.env.BLING_SYNC_ENV !== 'false',
    tokenFile: process.env.BLING_TOKEN_FILE || path.resolve(process.cwd(), '.tokens.json'),
    envFile: process.env.BLING_ENV_FILE || path.resolve(process.cwd(), '.env'),
  },
};

export function getMissingRequiredEnv() {
  const required = [
    ['BLING_CLIENT_ID', env.bling.clientId],
    ['BLING_CLIENT_SECRET', env.bling.clientSecret],
    ['BLING_REFRESH_TOKEN', env.bling.refreshToken],
  ];

  return required.filter(([, value]) => !value).map(([key]) => key);
}
