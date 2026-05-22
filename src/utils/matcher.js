/**
 * Normaliza texto para comparação: uppercase, sem acentos, sem pontuação extra.
 */
export function normalizar(texto) {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai tokens significativos de uma query do usuário.
 * Remove stopwords e tokens de 1-2 caracteres ambíguos.
 */
const STOPWORDS = new Set([
  'TEM', 'QUAL', 'O', 'A', 'DE', 'DA', 'DO', 'DAS', 'DOS',
  'EM', 'COM', 'E', 'OU', 'NO', 'NA', 'SE', 'ME',
  'VOCE', 'EU', 'DISPONIVEL', 'DISPONIVEL', 'PRODUTO', 'ROUPA',
  'PECA', 'ITEM', 'QUERO', 'PRECISO', 'ESTOQUE', 'QUANTO',
]);

export function extrairTokens(query) {
  return normalizar(query)
    .split(' ')
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

// Mapeamento de aliases comuns que usuários usam
const ALIAS_MAP = {
  'MARINHO': 'AZUL MARINHO',
  'TERRACO': 'TERRACOTA',
  'TERRA': 'TERRACOTA',
  'OLIVA': 'VERDE OLIVA',
  'VERDE': 'VERDE OLIVA',
  'CHOCO': 'CHOCOLATE',
  'BRANCO PRETO': 'BRANCO E PRETO',
  'PRETO BRANCO': 'PRETO E BRANCO',
  'PP': 'P',
};

/**
 * Expande aliases na query antes da comparação.
 */
export function expandirAliases(queryNormalizada) {
  let resultado = queryNormalizada;
  for (const [alias, valor] of Object.entries(ALIAS_MAP)) {
    resultado = resultado.replace(new RegExp(`\\b${alias}\\b`, 'g'), valor);
  }
  return resultado;
}

/**
 * Calcula score de correspondência entre o nome do produto e os tokens da query.
 * Retorna valor entre 0 e 1. Score 1 significa match perfeito de todos os tokens.
 *
 * @param {string} nomeProduto - Nome do produto no Bling
 * @param {string[]} tokensQuery - Tokens extraídos da query do usuário
 */
export function calcularScore(nomeProduto, tokensQuery) {
  const nomeNorm = expandirAliases(normalizar(nomeProduto));
  let acertos = 0;

  for (const token of tokensQuery) {
    if (nomeNorm.includes(token)) {
      acertos++;
    }
  }

  return tokensQuery.length > 0 ? acertos / tokensQuery.length : 0;
}

/**
 * Verifica se o produto é uma variante (tem COR: ou TAMANHO: no nome).
 */
export function ehVariante(nomeProduto) {
  const norm = normalizar(nomeProduto);
  return norm.includes('COR') || norm.includes('TAMANHO');
}

/**
 * Verifica se o produto é um produto-pai/virtual (FORMATO = V).
 * Bling usa FORMATO V para produtos pai de grade.
 */
export function ehProdutoPai(produto) {
  return produto.formato === 'V';
}

/**
 * Ordena e filtra lista de produtos pelo score de match.
 * Retorna apenas produtos com score >= minScore.
 *
 * @param {object[]} produtos - Lista de produtos do Bling
 * @param {string} query - Query original do usuário
 * @param {number} minScore - Score mínimo para incluir (0.0 a 1.0)
 */
export function rankearProdutos(produtos, query, minScore = 0.4) {
  const queryExpandida = expandirAliases(normalizar(query));
  const tokens = extrairTokens(queryExpandida);

  if (tokens.length === 0) return [];

  return produtos
    .map((p) => ({ ...p, _score: calcularScore(p.nome, tokens) }))
    .filter((p) => p._score >= minScore)
    .sort((a, b) => {
      // Prioriza variantes sobre produtos pai quando há tokens de cor/tamanho
      const queryTemVariante = queryExpandida.match(/\b(P|M|G|GG|PP)\b/) ||
        queryExpandida.includes('COR') || queryExpandida.includes('TAMANHO');

      if (queryTemVariante) {
        const aEhVar = ehVariante(a.nome) ? 1 : 0;
        const bEhVar = ehVariante(b.nome) ? 1 : 0;
        if (aEhVar !== bEhVar) return bEhVar - aEhVar;
      }

      return b._score - a._score;
    });
}
