import axios from 'axios';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { env } from '../config/env.js';

const BLING_TOKEN_URL = env.bling.tokenUrl || `${env.bling.baseUrl}/oauth/token`;

function loadPersistedTokens() {
  try {
    if (!fs.existsSync(env.bling.tokenFile)) return {};
    return JSON.parse(fs.readFileSync(env.bling.tokenFile, 'utf8'));
  } catch (error) {
    console.warn('[bling] Failed to read .tokens.json:', error.message);
    return {};
  }
}

function persistTokens(tokens) {
  try {
    fs.writeFileSync(env.bling.tokenFile, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn('[bling] Tokens renewed but failed to write .tokens.json:', error.message);
  }

  persistEnvTokens(tokens);
}

function upsertEnvValue(envText, key, value) {
  const lines = envText.split(/\r?\n/);
  let found = false;

  const updated = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    if (updated.length > 0 && updated[updated.length - 1] === '') {
      updated.splice(updated.length - 1, 0, `${key}=${value}`);
    } else {
      updated.push(`${key}=${value}`);
    }
  }

  return `${updated.join('\n').replace(/\n*$/, '')}\n`;
}

function persistEnvTokens(tokens) {
  if (!env.bling.syncEnv || !tokens.refreshToken) return;

  try {
    if (!fs.existsSync(env.bling.envFile)) return;

    let envText = fs.readFileSync(env.bling.envFile, 'utf8');
    envText = upsertEnvValue(envText, 'BLING_REFRESH_TOKEN', tokens.refreshToken);

    if (tokens.accessToken && envText.includes('BLING_ACCESS_TOKEN=')) {
      envText = upsertEnvValue(envText, 'BLING_ACCESS_TOKEN', tokens.accessToken);
    }

    fs.writeFileSync(env.bling.envFile, envText, { mode: 0o600 });
  } catch (error) {
    console.warn('[bling] Tokens renewed but failed to update .env:', error.message);
  }
}

export function maskToken(token) {
  if (!token) return '(empty)';
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function getBasicAuthorization() {
  if (!env.bling.clientId || !env.bling.clientSecret) {
    throw new Error('BLING_CLIENT_ID and BLING_CLIENT_SECRET must be configured.');
  }

  const credentials = Buffer.from(
    `${env.bling.clientId}:${env.bling.clientSecret}`
  ).toString('base64');

  return `Basic ${credentials}`;
}

const persistedTokens = loadPersistedTokens();

// loaded from .tokens.json or env vars on startup
const tokenState = {
  accessToken: persistedTokens.accessToken || env.bling.accessToken || '',
  refreshToken: persistedTokens.refreshToken || env.bling.refreshToken || '',
  refreshingPromise: null,
};

function reloadPersistedTokens() {
  const latestTokens = loadPersistedTokens();
  let changed = false;

  if (latestTokens.accessToken && latestTokens.accessToken !== tokenState.accessToken) {
    tokenState.accessToken = latestTokens.accessToken;
    changed = true;
  }

  if (latestTokens.refreshToken && latestTokens.refreshToken !== tokenState.refreshToken) {
    tokenState.refreshToken = latestTokens.refreshToken;
    changed = true;
  }

  return changed;
}

async function renewAccessToken() {
  if (tokenState.refreshingPromise) {
    return tokenState.refreshingPromise;
  }

  tokenState.refreshingPromise = (async () => {
    // another process may have already renewed — avoids an unnecessary API call
    if (reloadPersistedTokens() && tokenState.accessToken) {
      return;
    }

    if (!env.bling.clientId || !env.bling.clientSecret) {
      throw new Error('BLING_CLIENT_ID and BLING_CLIENT_SECRET must be configured.');
    }

    if (!tokenState.refreshToken) {
      throw new Error('BLING_REFRESH_TOKEN must be configured to renew access.');
    }

    const response = await axios.post(
      BLING_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenState.refreshToken,
      }),
      {
        headers: {
          Authorization: getBasicAuthorization(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'enable-jwt': '1', // required by Bling to return tokens in JWT format
        },
      }
    );

    tokenState.accessToken = response.data.access_token;
    tokenState.refreshToken = response.data.refresh_token;
    persistTokens({
      accessToken: tokenState.accessToken,
      refreshToken: tokenState.refreshToken,
      updatedAt: new Date().toISOString(),
    });

    console.log('[bling] Tokens renewed successfully.');
    console.log(`[bling] Access token: ${maskToken(tokenState.accessToken)}`);
    console.log(`[bling] Refresh token: ${maskToken(tokenState.refreshToken)}`);
  })();

  try {
    await tokenState.refreshingPromise;
  } finally {
    tokenState.refreshingPromise = null;
  }
}

export function getAuthorizationUrl(state = crypto.randomUUID()) {
  if (!env.bling.clientId) {
    throw new Error('BLING_CLIENT_ID must be configured.');
  }

  const url = new URL(env.bling.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.bling.clientId);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeAuthorizationCode(code) {
  if (!code) {
    throw new Error('Authorization code is required.');
  }

  const response = await axios.post(
    BLING_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }),
    {
      headers: {
        Authorization: getBasicAuthorization(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'enable-jwt': '1',
      },
    }
  );

  tokenState.accessToken = response.data.access_token;
  tokenState.refreshToken = response.data.refresh_token;

  const tokens = {
    accessToken: tokenState.accessToken,
    refreshToken: tokenState.refreshToken,
    updatedAt: new Date().toISOString(),
  };
  persistTokens(tokens);

  console.log('[bling] OAuth authorization completed.');
  console.log(`[bling] Access token: ${maskToken(tokenState.accessToken)}`);
  console.log(`[bling] Refresh token: ${maskToken(tokenState.refreshToken)}`);

  return tokens;
}

export async function blingGet(endpoint, params = {}, retried = false) {
  try {
    if (!tokenState.accessToken) {
      await renewAccessToken();
    }

    const response = await axios.get(`${env.bling.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${tokenState.accessToken}`,
        Accept: 'application/json',
        'enable-jwt': '1',
      },
      params,
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;

    if (status === 401 && !retried) {
      console.log('[bling] Token expired, renewing...');
      await renewAccessToken();
      return blingGet(endpoint, params, true);
    }

    const errorData = error.response?.data;
    const msg = errorData?.error?.message ||
      errorData?.error?.description ||
      errorData?.message ||
      error.message;
    throw new Error(`Bling API error ${status}: ${msg}`);
  }
}
