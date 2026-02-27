const logger = require('./logger');

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    logger.error({
      event: 'telegram_missing_config',
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId)
    });
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal
    });

    if (!resp.ok) {
      const bodyText = await resp.text();
      logger.error({
        event: 'telegram_send_failed',
        status: resp.status,
        body: bodyText
      });
    }
  } catch (err) {
    logger.error({
      event: 'telegram_send_error',
      error: err.message
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { sendTelegramMessage };
