import { Router } from 'express';
import { blingGet } from '../bling.js';
import { rankearProdutos, ehProdutoPai, normalizar, extrairTokens } from '../utils/matcher.js';

const router = Router();

/**
 * Busca produtos na Bling API usando o termo principal da query.
 * Tenta com o nome completo primeiro; se não achar, tenta só a primeira palavra.
 */
async function buscarProdutosBling(termoBusca) {
  const data = await blingGet('/produtos', {
    nome: termoBusca,
    limite: 100,
    situacao: 'A',
  });
  return data.data || [];
}

/**
 * Busca o saldo de estoque de um produto pelo ID.
 * Retorna o saldoFisico ou 0 se não encontrado.
 */
async function buscarEstoque(idProduto) {
  try {
    const data = await blingGet(`/estoques/${idProduto}`);
    return data.data?.saldoFisico ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Formata a resposta de estoque para consumo pelo BotConversa/GPT.
 */
function formatarResposta(produto, estoque) {
  const emEstoque = estoque > 0;

  return {
    encontrado: true,
    id: produto.id,
    nome: produto.nome,
    preco: produto.preco,
    estoque: Number(estoque),
    disponivel: emEstoque,
    mensagem: emEstoque
      ? `Sim, temos ${estoque} unidade(s) disponivel(is).`
      : 'Este produto nao esta disponivel no momento (estoque zerado).',
  };
}

/**
 * GET /estoque
 *
 * Consulta estoque de um produto por nome/descricao.
 * Projetado para ser chamado via HTTP Action do BotConversa.
 *
 * Query params:
 *   q (obrigatorio) - Nome/descricao do produto (ex: "conjunto eloisa new preto P")
 *
 * Exemplos de chamada:
 *   GET /estoque?q=conjunto+eloisa+new+preto+P
 *   GET /estoque?q=kimono+azul+marinho+M
 *   GET /estoque?q=macacao+maya+terracota+G
 *
 * Resposta de sucesso (200):
 *   {
 *     "encontrado": true,
 *     "id": "16627173128",
 *     "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P",
 *     "preco": 160.00,
 *     "estoque": 5,
 *     "disponivel": true,
 *     "mensagem": "Sim, temos 5 unidade(s) disponivel(is)."
 *   }
 *
 * Resposta nao encontrado (200):
 *   { "encontrado": false, "mensagem": "Produto nao encontrado. Verifique o nome, cor e tamanho." }
 *
 * Resposta ambigua (200):
 *   { "encontrado": false, "ambiguo": true, "mensagem": "...", "opcoes": [...] }
 */
router.get('/', async (req, res) => {
  const query = (req.query.q || '').trim();

  if (!query || query.length < 2) {
    return res.status(400).json({
      encontrado: false,
      mensagem: 'Parametro q e obrigatorio e deve ter ao menos 2 caracteres.',
    });
  }

  try {
    const tokens = extrairTokens(query);

    if (tokens.length === 0) {
      return res.json({ encontrado: false, mensagem: 'Query muito generica, informe nome do produto.' });
    }

    // Usa o primeiro token significativo como busca na Bling API
    // (a API do Bling filtra por prefixo no nome)
    const termoBusca = tokens.slice(0, 2).join(' ');
    let produtos = await buscarProdutosBling(termoBusca);

    // Se nao encontrou nada com 2 tokens, tenta so o primeiro
    if (produtos.length === 0 && tokens.length > 1) {
      produtos = await buscarProdutosBling(tokens[0]);
    }

    if (produtos.length === 0) {
      return res.json({
        encontrado: false,
        mensagem: `Nenhum produto encontrado para "${query}". Verifique o nome do produto.`,
      });
    }

    // Rankeia por relevancia usando o matcher
    const rankeados = rankearProdutos(produtos, query);

    if (rankeados.length === 0) {
      return res.json({
        encontrado: false,
        mensagem: `Produto nao encontrado para "${query}". Verifique nome, cor e tamanho.`,
      });
    }

    const melhor = rankeados[0];

    // Se o melhor match e um produto pai (grade), tenta ser mais especifico
    if (ehProdutoPai(melhor) && rankeados.length > 1) {
      const variantesMelhor = rankeados.filter((p) => !ehProdutoPai(p));

      if (variantesMelhor.length > 1 && variantesMelhor[0]._score < 0.85) {
        // Nao e claro qual variante o usuario quer: lista opcoes
        const opcoes = variantesMelhor.slice(0, 6).map((p) => ({
          id: p.id,
          nome: p.nome,
        }));
        return res.json({
          encontrado: false,
          ambiguo: true,
          mensagem: 'Encontrei algumas opcoes para este produto. Qual delas voce quer verificar?',
          opcoes,
        });
      }

      if (variantesMelhor.length === 1) {
        const estoque = await buscarEstoque(variantesMelhor[0].id);
        return res.json(formatarResposta(variantesMelhor[0], estoque));
      }
    }

    // Match claro: consulta estoque diretamente
    const estoque = await buscarEstoque(melhor.id);
    return res.json(formatarResposta(melhor, estoque));
  } catch (error) {
    console.error('[/estoque] Erro:', error.message);
    return res.status(500).json({
      encontrado: false,
      mensagem: 'Erro interno ao consultar estoque. Tente novamente.',
      _erro: error.message,
    });
  }
});

/**
 * GET /estoque/variantes
 *
 * Lista todas as variantes de um produto-base com seus respectivos estoques.
 * Util para o GPT apresentar ao usuario quando a consulta e ambigua.
 *
 * Query params:
 *   nome (obrigatorio) - Nome base do produto (ex: "conjunto eloisa new")
 *
 * Resposta:
 *   {
 *     "encontrado": true,
 *     "total": 12,
 *     "variantes": [
 *       { "id": "...", "nome": "CONJUNTO ELOISA NEW COR:PRETO;TAMANHO:P", "estoque": 0, "disponivel": false },
 *       ...
 *     ]
 *   }
 */
router.get('/variantes', async (req, res) => {
  const nome = (req.query.nome || '').trim();

  if (!nome || nome.length < 3) {
    return res.status(400).json({ mensagem: 'Parametro nome e obrigatorio.' });
  }

  try {
    const tokens = extrairTokens(nome);
    const termoBusca = tokens.slice(0, 2).join(' ');
    const produtos = await buscarProdutosBling(termoBusca);

    const rankeados = rankearProdutos(produtos, nome, 0.5).filter((p) => !ehProdutoPai(p));

    if (rankeados.length === 0) {
      return res.json({ encontrado: false, mensagem: 'Nenhuma variante encontrada.' });
    }

    // Consulta estoque de cada variante (limitado a 20 para evitar timeout)
    const variantes = await Promise.all(
      rankeados.slice(0, 20).map(async (p) => {
        const estoque = await buscarEstoque(p.id);
        return {
          id: p.id,
          nome: p.nome,
          preco: p.preco,
          estoque: Number(estoque),
          disponivel: estoque > 0,
        };
      })
    );

    return res.json({
      encontrado: true,
      total: variantes.length,
      variantes,
    });
  } catch (error) {
    console.error('[/estoque/variantes] Erro:', error.message);
    return res.status(500).json({ mensagem: 'Erro interno.', _erro: error.message });
  }
});

export default router;
