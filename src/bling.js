import axios from 'axios';

const BLING_BASE_URL = 'https://www.bling.com.br/Api/v3';
const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token';

// Token em memória. Na inicialização é carregado das env vars.
const tokenState = {
  accessToken: process.env.BLING_ACCESS_TOKEN || '',
  refreshToken: process.env.BLING_REFRESH_TOKEN || '',
  refreshingPromise: null,
};

/**
 * Renova o access token usando o refresh token.
 * Se já houver uma renovação em andamento, aguarda a mesma Promise
 * para evitar múltiplas chamadas simultâneas.
 */
async function renewAccessToken() {
  if (tokenState.refreshingPromise) {
    return tokenState.refreshingPromise;
  }

  tokenState.refreshingPromise = (async () => {
    const credentials = Buffer.from(
      `${process.env.BLING_CLIENT_ID}:${process.env.BLING_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(
      BLING_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenState.refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    tokenState.accessToken = response.data.access_token;
    tokenState.refreshToken = response.data.refresh_token;

    // Log para que o operador possa atualizar as env vars manualmente se necessário
    console.log('[bling] Tokens renovados com sucesso.');
    console.log(`[bling] Novo BLING_ACCESS_TOKEN: ${tokenState.accessToken}`);
    console.log(`[bling] Novo BLING_REFRESH_TOKEN: ${tokenState.refreshToken}`);
  })();

  try {
    await tokenState.refreshingPromise;
  } finally {
    tokenState.refreshingPromise = null;
  }
}

/**
 * Realiza uma requisição GET autenticada para a Bling API v3.
 * Em caso de 401, renova o token e tenta novamente uma vez.
 *
 * @param {string} endpoint - Caminho relativo ao BLING_BASE_URL
 * @param {object} params - Query params opcionais
 * @param {boolean} retried - Controla se já houve retry para evitar loop
 */
export async function blingGet(endpoint, params = {}, retried = false) {
  try {
    const response = await axios.get(`${BLING_BASE_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${tokenState.accessToken}`,
        Accept: 'application/json',
      },
      params,
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;

    if (status === 401 && !retried) {
      console.log('[bling] Token expirado, renovando...');
      await renewAccessToken();
      return blingGet(endpoint, params, true);
    }

    const msg = error.response?.data?.error?.message || error.message;
    throw new Error(`Bling API erro ${status}: ${msg}`);
  }
}
