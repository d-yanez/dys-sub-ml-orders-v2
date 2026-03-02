function parseIntOrDefault(value, defaultValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

const env = {
  port: parseIntOrDefault(process.env.PORT, 8080),
  logLevel: process.env.LOG_LEVEL || 'info',
  subscriptionName: process.env.SUBSCRIPTION_NAME || null,
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'mlDB',
  eventLogTtlDays: parseIntOrDefault(process.env.EVENT_LOG_TTL_DAYS, 60),
  apiKeyMl: process.env.API_KEY_ML || '',
  apiKeyStock: process.env.API_KEY_STOCK || '',
  mlAuthBaseUrl:
    process.env.ML_AUTH_BASE_URL ||
    'https://dys-ml-auth-app-785293986978.us-central1.run.app',
  stockBaseUrl:
    process.env.STOCK_BASE_URL ||
    'https://dys-api-stock-785293986978.us-central1.run.app',
  httpTimeoutMsMlOrder: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_ML_ORDER, 2500),
  httpTimeoutMsMlItem: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_ML_ITEM, 2500),
  httpTimeoutMsStock: parseIntOrDefault(process.env.HTTP_TIMEOUT_MS_STOCK, 2000),
  retryMaxAttemptsMlOrder: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_ML_ORDER, 3),
  retryMaxAttemptsMlItem: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_ML_ITEM, 3),
  retryMaxAttemptsStock: parseIntOrDefault(process.env.RETRY_MAX_ATTEMPTS_STOCK, 2),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  telegramCaptionLimit: parseIntOrDefault(process.env.TELEGRAM_CAPTION_LIMIT, 1024)
};

module.exports = env;
