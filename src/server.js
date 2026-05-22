import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import estoqueRouter from './routes/estoque.js';

const app = express();
app.use(express.json());

// Rate limiter: protege contra abuso e loops do BotConversa
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensagem: 'Muitas requisicoes. Aguarde um momento.' },
});
app.use(limiter);

/**
 * Middleware de autenticacao via API Key.
 * BotConversa deve enviar: X-API-Key: <API_SECRET_KEY>
 * Rotas publicas (/health) sao excluidas.
 */
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const apiKey = req.headers['x-api-key'];
  const esperada = process.env.API_SECRET_KEY;

  if (!esperada) {
    console.warn('[auth] API_SECRET_KEY nao configurada. Autenticacao desabilitada.');
    return next();
  }

  if (!apiKey || apiKey !== esperada) {
    return res.status(401).json({ mensagem: 'API Key invalida ou ausente.' });
  }

  next();
});

// Rotas
app.use('/estoque', estoqueRouter);

// Health check para Railway/Render e BotConversa verificar se a API esta viva
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    service: 'bling-estoque-api',
  });
});

// Handler para rotas nao encontradas
app.use((req, res) => {
  res.status(404).json({ mensagem: `Rota ${req.method} ${req.path} nao existe.` });
});

// Handler global de erros nao capturados
app.use((err, req, res, _next) => {
  console.error('[server] Erro nao tratado:', err);
  res.status(500).json({ mensagem: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[server] Bling Estoque API rodando na porta ${PORT}`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
  console.log(`[server] Consulta: http://localhost:${PORT}/estoque?q=<produto>`);

  // Valida configuracao na inicializacao
  const required = ['BLING_CLIENT_ID', 'BLING_CLIENT_SECRET', 'BLING_ACCESS_TOKEN', 'BLING_REFRESH_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('[server] ATENCAO: Variaveis de ambiente ausentes:', missing.join(', '));
  }
});
