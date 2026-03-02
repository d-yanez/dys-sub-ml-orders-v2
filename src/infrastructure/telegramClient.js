const logger = require('./logger');
const env = require('../config/env');

async function sendRequest(endpoint, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const bodyText = await response.text();
      const error = new Error(`Telegram ${endpoint} failed with ${response.status}`);
      error.statusCode = response.status;
      error.responseText = bodyText;
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateTelegramConfig() {
  if (!env.telegramBotToken || !env.telegramChatId) {
    logger.error({
      event: 'telegram_missing_config',
      hasToken: Boolean(env.telegramBotToken),
      hasChatId: Boolean(env.telegramChatId)
    });
    return false;
  }
  return true;
}

async function sendTelegramNotification({ html, photoUrl, traceId, orderId }) {
  if (!validateTelegramConfig()) {
    return false;
  }

  if (photoUrl) {
    try {
      await sendRequest('sendPhoto', {
        chat_id: env.telegramChatId,
        photo: photoUrl,
        caption: html,
        parse_mode: 'HTML'
      });
      logger.info({
        event: 'telegram_send_photo_done',
        traceId,
        orderId
      });
      return true;
    } catch (error) {
      logger.error({
        event: 'telegram_send_photo_failed',
        traceId,
        orderId,
        statusCode: error.statusCode || null,
        error: error.message,
        responseText: error.responseText || null
      });
    }
  }

  await sendRequest('sendMessage', {
    chat_id: env.telegramChatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  });

  logger.info({
    event: 'telegram_send_message_done',
    traceId,
    orderId
  });

  return true;
}

module.exports = {
  sendTelegramNotification
};
