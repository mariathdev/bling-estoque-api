export function normalize(text) {
  return String(text || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'TEM', 'QUAL', 'O', 'A', 'DE', 'DA', 'DO', 'DAS', 'DOS',
  'EM', 'COM', 'E', 'OU', 'NO', 'NA', 'SE', 'ME',
  'VOCE', 'EU', 'DISPONIVEL', 'PRODUTO', 'ROUPA',
  'PECA', 'ITEM', 'QUERO', 'PRECISO', 'ESTOQUE', 'QUANTO',
  'COR', 'TAMANHO', 'TAM',
]);

const CLOTHING_SIZES = new Set(['PP', 'P', 'M', 'G', 'GG']);

export function extractTokens(query) {
  return normalize(query)
    .split(' ')
    .filter((token) => (token.length >= 2 || CLOTHING_SIZES.has(token)) && !STOPWORDS.has(token));
}

const ALIAS_MAP = {
  MARINHO: 'AZUL MARINHO',
  TERRACO: 'TERRACOTA',
  TERRA: 'TERRACOTA',
  OLIVA: 'VERDE OLIVA',
  VERDE: 'VERDE OLIVA',
  CHOCO: 'CHOCOLATE',
  'BRANCO PRETO': 'BRANCO E PRETO',
  'PRETO BRANCO': 'PRETO E BRANCO',
  'BRANCO COM PRETO': 'BRANCO E PRETO',
  'PRETO COM BRANCO': 'PRETO E BRANCO',
  'AZUL COM BRANCO': 'AZUL MARINHO E BRANCO',
  'AZUL E BRANCO': 'AZUL MARINHO E BRANCO',
  PP: 'P',
};

const VARIANT_ATTRIBUTES = new Set([
  ...CLOTHING_SIZES,
  'AZUL',
  'MARINHO',
  'BRANCO',
  'PRETO',
  'CHOCOLATE',
  'VERDE',
  'OLIVA',
  'TERRACOTA',
  'MARSALA',
  'CORAL',
  'NUDE',
  'LINHO',
  'NATURAL',
]);

const SIZE_ATTRIBUTE_PATTERN = /\b(PP|GG|P|M|G)\b/;

export function expandAliases(normalizedQuery) {
  let result = normalizedQuery;

  for (const [alias, canonical] of Object.entries(ALIAS_MAP)) {
    result = result.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
  }

  return result;
}

export function calculateScore(productName, queryTokens) {
  const normalizedName = expandAliases(normalize(productName));
  let matches = 0;

  for (const token of queryTokens) {
    const matched = token.length <= 2
      ? new RegExp(`\\b${token}\\b`).test(normalizedName)
      : normalizedName.includes(token);

    if (matched) matches += 1;
  }

  return queryTokens.length > 0 ? matches / queryTokens.length : 0;
}

export function isVariant(productName) {
  const normalized = normalize(productName);
  return normalized.includes('COR') || normalized.includes('TAMANHO');
}

export function isParentProduct(product) {
  return product.formato === 'V';
}

export function extractProductSearchTokens(query) {
  const tokens = extractTokens(expandAliases(normalize(query)));
  const productTokens = tokens.filter((token) => !VARIANT_ATTRIBUTES.has(token));

  return productTokens.length > 0 ? productTokens : tokens;
}

export function rankProducts(products, query, minScore = 0.4) {
  const expandedQuery = expandAliases(normalize(query));
  const tokens = extractTokens(expandedQuery);

  if (tokens.length === 0) return [];

  const queryHasVariantAttribute =
    SIZE_ATTRIBUTE_PATTERN.test(expandedQuery) ||
    expandedQuery.includes('COR') ||
    expandedQuery.includes('TAMANHO');

  return products
    .map((product) => ({ ...product, _score: calculateScore(product.nome, tokens) }))
    .filter((product) => product._score >= minScore)
    .sort((a, b) => {
      if (queryHasVariantAttribute) {
        const aIsVariant = isVariant(a.nome) ? 1 : 0;
        const bIsVariant = isVariant(b.nome) ? 1 : 0;
        if (aIsVariant !== bIsVariant) return bIsVariant - aIsVariant;
      }

      return b._score - a._score;
    });
}
