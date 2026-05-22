import { checkStock, listVariants } from '../services/estoque.service.js';

export async function queryStockHandler(req, res) {
  const query = (req.query.q || '').trim();

  if (!query || query.length < 2) {
    return res.status(400).json({
      found: false,
      message: 'Parametro q e obrigatorio e deve ter ao menos 2 caracteres.',
    });
  }

  try {
    const result = await checkStock(query);
    return res.json(result);
  } catch (error) {
    console.error('[/estoque] Error:', error.message);
    return res.status(500).json({
      found: false,
      message: 'Erro interno ao consultar estoque. Tente novamente.',
    });
  }
}

export async function listVariantsHandler(req, res) {
  const name = (req.query.nome || '').trim();

  if (!name || name.length < 3) {
    return res.status(400).json({ message: 'Parametro nome e obrigatorio.' });
  }

  try {
    const result = await listVariants(name);
    return res.json(result);
  } catch (error) {
    console.error('[/estoque/variantes] Error:', error.message);
    return res.status(500).json({ message: 'Erro interno.' });
  }
}
