const env = require('../config/env');
const { requestJsonWithRetry } = require('../utils/http');

async function getMlOrder(orderId) {
  const url = `${env.mlAuthBaseUrl}/ml/7617772409564070/orders/${encodeURIComponent(orderId)}`;

  return requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'api-key': env.apiKeyMl
    },
    timeoutMs: env.httpTimeoutMsMlOrder,
    maxAttempts: env.retryMaxAttemptsMlOrder
  });
}

async function getMlItem(itemId) {
  const url = `${env.mlAuthBaseUrl}/ml/7617772409564070/items/${encodeURIComponent(itemId)}`;

  return requestJsonWithRetry({
    url,
    method: 'GET',
    headers: {
      'api-key': env.apiKeyMl
    },
    timeoutMs: env.httpTimeoutMsMlItem,
    maxAttempts: env.retryMaxAttemptsMlItem
  });
}

module.exports = {
  getMlOrder,
  getMlItem
};
