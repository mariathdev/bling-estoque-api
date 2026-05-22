import 'dotenv/config';
import { env } from '../config/env.js';
import { exchangeAuthorizationCode, getAuthorizationUrl, maskToken } from '../services/bling.service.js';

function getCodeFromInput() {
  const raw = process.argv[2] || process.env.BLING_AUTHORIZATION_CODE || '';
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get('code') || raw;
  } catch {
    return raw;
  }
}

function printAuthorizationUrl() {
  console.log('Open this URL, authorize the app, and copy the "code" parameter from the redirect:');
  console.log(getAuthorizationUrl());
  console.log('');
  console.log('Then run: npm run oauth:exchange -- YOUR_CODE');
}

async function exchangeCode(code) {
  const tokens = await exchangeAuthorizationCode(code);

  console.log(`Tokens saved to ${env.bling.tokenFile}`);
  console.log('BLING_REFRESH_TOKEN updated in local .env when the file exists.');
  console.log(`Access token: ${maskToken(tokens.accessToken)}`);
  console.log(`Refresh token: ${maskToken(tokens.refreshToken)}`);
}

const code = getCodeFromInput();

try {
  if (!code) {
    printAuthorizationUrl();
  } else {
    await exchangeCode(code);
  }
} catch (error) {
  const status = error.response?.status;
  const data = error.response?.data;
  const message = data?.error?.message || data?.error?.description || data?.message || error.message;
  console.error(status ? `OAuth failed (${status}): ${message}` : `OAuth failed: ${message}`);
  process.exitCode = 1;
}
