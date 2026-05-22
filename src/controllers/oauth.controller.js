import { exchangeAuthorizationCode, getAuthorizationUrl } from '../services/bling.service.js';
import { escapeHtml } from '../utils/html.js';

function extractBlingError(error) {
  const data = error.response?.data;
  return data?.error?.description ||
    data?.error?.message ||
    data?.message ||
    error.message;
}

export async function handleOAuthCallback(req, res) {
  const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;

  if (!code) {
    return res.status(400).json({ message: 'Missing code parameter.' });
  }

  try {
    await exchangeAuthorizationCode(code);
    return res.type('html').send(`
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bling autorizado</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 40px;">
    <h1>Autorizacao concluida</h1>
    <p>Os tokens do Bling foram atualizados. Voce pode fechar esta aba.</p>
  </body>
</html>`);
  } catch (error) {
    const message = extractBlingError(error);
    console.error('[oauth] Failed to exchange code for tokens:', message);
    return res.status(400).type('html').send(`
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Falha OAuth</title>
  </head>
  <body style="font-family: system-ui, sans-serif; margin: 40px;">
    <h1>Nao foi possivel autorizar</h1>
    <p>${escapeHtml(message)}</p>
  </body>
</html>`);
  }
}

export function getOAuthUrl(req, res) {
  res.json({ url: getAuthorizationUrl() });
}
