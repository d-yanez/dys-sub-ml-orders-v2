const env = require('../config/env');
const { createLogContext, createLogger } = require('./logContext');

async function sendRequest(endpoint, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), env.telegramTimeoutMs);

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
  } catch (error) {
    if (error && error.name === 'AbortError') {
      error.isTimeout = true;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateTelegramConfig(log) {
  if (!env.telegramBotToken || !env.telegramChatId) {
    log.error({
      event: 'telegram_missing_config',
      phase: 'telegram',
      status: 'ERROR',
      errorCode: 'TELEGRAM_FAILED',
      errorSummary: 'Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID',
      hasToken: Boolean(env.telegramBotToken),
      hasChatId: Boolean(env.telegramChatId)
    });
    return false;
  }
  return true;
}

function buildTraceInlineKeyboard(traceId) {
  if (!traceId) {
    return undefined;
  }

  return {
    inline_keyboard: [
      [
        {
          text: 'Copiar traceId',
          switch_inline_query_current_chat: String(traceId)
        }
      ]
    ]
  };
}

async function sendTelegramNotification({ html, photoUrl, traceId, orderId }) {
  const ctx = createLogContext({
    traceId: traceId || null,
    orderId: orderId || null,
    service: env.serviceName,
    env: env.nodeEnv
  });
  const log = createLogger(ctx);

  if (!validateTelegramConfig(log)) {
    return false;
  }

  const replyMarkup = buildTraceInlineKeyboard(traceId);

  if (photoUrl) {
    try {
      await sendRequest('sendPhoto', {
        chat_id: env.telegramChatId,
        photo: photoUrl,
        caption: html,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      });
      log.info({
        event: 'telegram_send_photo_done',
        phase: 'telegram',
        status: 'SUCCESS'
      });
      return true;
    } catch (error) {
      log.error({
        event: 'telegram_send_photo_failed',
        phase: 'telegram',
        status: 'ERROR',
        errorCode: 'TELEGRAM_FAILED',
        errorSummary: 'Telegram sendPhoto failed',
        errorDetails: error.message,
        statusCode: error.statusCode || null,
        responseText: error.responseText || null
      });
    }
  }

  await sendRequest('sendMessage', {
    chat_id: env.telegramChatId,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: replyMarkup
  });

  log.info({
    event: 'telegram_send_message_done',
    phase: 'telegram',
    status: 'SUCCESS'
  });

  return true;
}

module.exports = {
  sendTelegramNotification
};
