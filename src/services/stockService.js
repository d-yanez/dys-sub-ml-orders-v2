const env = require('../config/env');
const { requestJsonWithRetry } = require('../utils/http');

function normalizeStockRows(stockPayload) {
  if (Array.isArray(stockPayload)) {
    return stockPayload;
  }

  if (stockPayload && Array.isArray(stockPayload.data)) {
    return stockPayload.data;
  }

  if (stockPayload && Array.isArray(stockPayload.rows)) {
    return stockPayload.rows;
  }

  if (stockPayload && Array.isArray(stockPayload.stock)) {
    return stockPayload.stock;
  }

  return [];
}

async function getStockBySku(sku) {
  const url = `${env.stockBaseUrl}/api/stock/${encodeURIComponent(sku)}`;

  const result = await requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'x-api-key': env.apiKeyStock
    },
    timeoutMs: env.httpTimeoutMsStock,
    maxAttempts: env.retryMaxAttemptsStock
  });

  return {
    ...result,
    rows: normalizeStockRows(result.data)
  };
}

module.exports = {
  getStockBySku,
  normalizeStockRows
};
