import { blingGet } from './bling.service.js';
import {
  isParentProduct,
  extractTokens,
  extractProductSearchTokens,
  rankProducts,
} from '../utils/matcher.js';

const CLEAR_VARIANT_SCORE_THRESHOLD = 0.85;
const VARIANT_LIST_MIN_SCORE = 0.5;
const AMBIGUOUS_OPTIONS_LIMIT = 6;
const VARIANTS_PER_QUERY_LIMIT = 20;

async function fetchBlingProducts(searchTerm) {
  const data = await blingGet('/produtos', {
    nome: searchTerm,
    criterio: 2,
    tipo: 'T',
    limite: 100,
  });

  return data.data || [];
}

async function fetchStock(productId) {
  const data = await blingGet('/estoques/saldos', {
    'idsProdutos[]': [productId],
    filtroSaldoEstoque: 1,
  });
  const stockEntry = (data.data || []).find((item) => String(item.produto?.id) === String(productId));
  if (stockEntry?.saldoFisicoTotal !== undefined) return stockEntry.saldoFisicoTotal;

  const productDetail = await blingGet(`/produtos/${productId}`);
  return productDetail.data?.estoque?.saldoVirtualTotal ?? 0;
}

function buildStockResponse(product, stock) {
  const inStock = stock > 0;

  return {
    found: true,
    id: product.id,
    name: product.nome,
    price: product.preco,
    stock: Number(stock),
    available: inStock,
    message: inStock
      ? `Sim, temos ${stock} unidade(s) disponivel(is).`
      : 'Este produto nao esta disponivel no momento (estoque zerado).',
  };
}

export async function checkStock(query) {
  const tokens = extractTokens(query);

  if (tokens.length === 0) {
    return { found: false, message: 'Query muito generica, informe nome do produto.' };
  }

  const searchTokens = extractProductSearchTokens(query);
  const searchTerm = searchTokens.slice(0, 2).join(' ');
  let products = await fetchBlingProducts(searchTerm);

  if (products.length === 0 && searchTokens.length > 1) {
    products = await fetchBlingProducts(searchTokens[0]);
  }

  if (products.length === 0) {
    return {
      found: false,
      message: `Nenhum produto encontrado para "${query}". Verifique o nome do produto.`,
    };
  }

  const rankedProducts = rankProducts(products, query);

  if (rankedProducts.length === 0) {
    return {
      found: false,
      message: `Produto nao encontrado para "${query}". Verifique nome, cor e tamanho.`,
    };
  }

  const bestMatch = rankedProducts[0];

  if (isParentProduct(bestMatch) && rankedProducts.length > 1) {
    const variantCandidates = rankedProducts.filter((p) => !isParentProduct(p));

    if (variantCandidates.length > 1 && variantCandidates[0]._score < CLEAR_VARIANT_SCORE_THRESHOLD) {
      return {
        found: false,
        ambiguous: true,
        message: 'Encontrei algumas opcoes para este produto. Qual delas voce quer verificar?',
        options: variantCandidates.slice(0, AMBIGUOUS_OPTIONS_LIMIT).map((p) => ({
          id: p.id,
          name: p.nome,
        })),
      };
    }

    if (variantCandidates.length === 1) {
      const stock = await fetchStock(variantCandidates[0].id);
      return buildStockResponse(variantCandidates[0], stock);
    }
  }

  const stock = await fetchStock(bestMatch.id);
  return buildStockResponse(bestMatch, stock);
}

export async function listVariants(name) {
  const tokens = extractProductSearchTokens(name);
  const searchTerm = tokens.slice(0, 2).join(' ');
  const products = await fetchBlingProducts(searchTerm);
  const rankedProducts = rankProducts(products, name, VARIANT_LIST_MIN_SCORE).filter((p) => !isParentProduct(p));

  if (rankedProducts.length === 0) {
    return { found: false, message: 'Nenhuma variante encontrada.' };
  }

  const variants = await Promise.all(
    rankedProducts.slice(0, VARIANTS_PER_QUERY_LIMIT).map(async (p) => {
      const stock = await fetchStock(p.id);
      return {
        id: p.id,
        name: p.nome,
        price: p.preco,
        stock: Number(stock),
        available: stock > 0,
      };
    })
  );

  return {
    found: true,
    total: variants.length,
    variants,
  };
}
