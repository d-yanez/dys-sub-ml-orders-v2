const env = require('../config/env');
const { requestJsonWithRetry } = require('../utils/http');

async function getMlOrder(orderId, resilienceCtx = {}) {
  const url = `${env.mlAuthBaseUrl}/ml/7617772409564070/orders/${encodeURIComponent(orderId)}`;

  return requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'api-key': env.apiKeyMl
    },
    timeoutMs: env.httpTimeoutMsMlOrder,
    maxAttempts: env.retryMaxAttemptsMlOrder,
    budgetStartedAt: resilienceCtx.startedAt,
    totalBudgetMs: resilienceCtx.totalBudgetMs
  });
}

async function getMlItem(itemId, resilienceCtx = {}) {
  const url = `${env.mlAuthBaseUrl}/ml/7617772409564070/items/${encodeURIComponent(itemId)}`;

  return requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'api-key': env.apiKeyMl
    },
    timeoutMs: env.httpTimeoutMsMlItem,
    maxAttempts: env.retryMaxAttemptsMlItem,
    budgetStartedAt: resilienceCtx.startedAt,
    totalBudgetMs: resilienceCtx.totalBudgetMs
  });
}

async function getMlShipment(shippingId, resilienceCtx = {}) {
  const url = `${env.mlAuthBaseUrl}/ml/7617772409564070/shipments/${encodeURIComponent(shippingId)}`;

  return requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'api-key': env.apiKeyShipments
    },
    timeoutMs: env.httpTimeoutMsMlShipment,
    maxAttempts: env.retryMaxAttemptsMlShipment,
    budgetStartedAt: resilienceCtx.startedAt,
    totalBudgetMs: resilienceCtx.totalBudgetMs
  });
}

module.exports = {
  getMlOrder,
  getMlItem,
  getMlShipment
};
