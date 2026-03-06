function parseIntOrDefault(value, defaultValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

const env = {
  port: parseIntOrDefault(process.env.PORT, 8080),
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'dev',
  serviceName: process.env.SERVICE_NAME || 'dys-sub-ml-orders-v2',
  subscriptionName: process.env.SUBSCRIPTION_NAME || null,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'mlDB',
  eventLogTtlDays: parseIntOrDefault(process.env.EVENT_LOG_TTL_DAYS, 60),
  apiKeyMl: process.env.API_KEY_ML || '',
  apiKeyShipments: process.env.API_KEY_SHIPMENTS || '',
  apiKeyStock: process.env.API_KEY_STOCK || '',
  mlAuthBaseUrl:
    process.env.ML_AUTH_BASE_URL ||
    'https://dys-ml-auth-app-785293986978.us-central1.run.app',
  stockBaseUrl:
    process.env.STOCK_BASE_URL ||
    'https://dys-api-stock-785293986978.us-central1.run.app',
  httpTimeoutMsMlOrder: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_ML_ORDER, 2500),
  httpTimeoutMsMlItem: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_ML_ITEM, 2500),
  httpTimeoutMsMlShipment: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_ML_SHIPMENT, 2500),
  httpTimeoutMsStock: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_STOCK, 2000),
  retryMaxAttemptsMlOrder: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_ML_ORDER, 3),
  retryMaxAttemptsMlItem: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_ML_ITEM, 3),
  retryMaxAttemptsMlShipment: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_ML_SHIPMENT, 3),
  retryMaxAttemptsStock: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_STOCK, 2),
  processTotalBudgetMs: parseIntOrDefault(process.env.PROCESS_TOTAL_BUDGET_MS, 10000),
  processingLeaseMs: parseIntOrDefault(process.env.PROCESSING_LEASE_MS, 30000),
  processingLockTtlSeconds: parseIntOrDefault(process.env.PROCESSING_LOCK_TTL_SECONDS, 600),
  stockCircuitFailureThreshold: parseIntOrDefault(process.env.STOCK_CIRCUIT_FAILURE_THRESHOLD, 5),
  stockCircuitWindowMs: parseIntOrDefault(process.env.STOCK_CIRCUIT_WINDOW_MS, 30000),
  stockCircuitOpenDurationMs: parseIntOrDefault(process.env.STOCK_CIRCUIT_OPEN_DURATION_MS, 25000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramCaptionLimit: parseIntOrDefault(process.env.TELEGRAM_CAPTION_LIMIT, 1024),
  telegramTimeoutMs: parseIntOrDefault(process.env.TELEGRAM_TIMEOUT_MS, 5000)
};

module.exports = env;
