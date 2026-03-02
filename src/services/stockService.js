const env = require('../config/env');
const { requestJsonWithRetry } = require('../utils/http');
const CircuitBreaker = require('../utils/circuitBreaker');

const stockCircuitBreaker = new CircuitBreaker({
  failureThreshold: env.stockCircuitFailureThreshold,
  windowMs: env.stockCircuitWindowMs,
  openDurationMs: env.stockCircuitOpenDurationMs
});

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

async function getStockBySku(sku, resilienceCtx = {}) {
  const url = `${env.stockBaseUrl}/api/stock/${encodeURIComponent(sku)}`;

  const result = await stockCircuitBreaker.execute(async () => {
    return requestJsonWithRetry({
      url,
      method: 'GET',
      headers: {
        'x-api-key': env.apiKeyStock
      },
      timeoutMs: env.httpTimeoutMsStock,
      maxAttempts: env.retryMaxAttemptsStock,
      budgetStartedAt: resilienceCtx.startedAt,
      totalBudgetMs: resilienceCtx.totalBudgetMs
    });
  });

  return {
    ...result,
    circuit: stockCircuitBreaker.snapshot(),
    rows: normalizeStockRows(result.data)
  };
}

function getStockCircuitSnapshot() {
  return stockCircuitBreaker.snapshot();
}

module.exports = {
  getStockBySku,
  normalizeStockRows,
  getStockCircuitSnapshot
};
