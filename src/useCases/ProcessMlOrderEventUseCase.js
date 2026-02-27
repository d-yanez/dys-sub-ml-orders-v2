const { v4: uuidv4 } = require('uuid');
const logger = require('../infrastructure/logger');
const { sendTelegramMessage } = require('../infrastructure/telegramClient');

class ProcessMlOrderEventUseCase {
  static execute(envelope) {
    const message = envelope.message || {};
    const attributes = message.attributes || {};
    const traceId = attributes.traceId || uuidv4();

    let payload = null;
    let payloadRaw = null;
    try {
      payloadRaw = Buffer.from(message.data || '', 'base64').toString();
      payload = payloadRaw ? JSON.parse(payloadRaw) : null;
    } catch (err) {
      logger.error({
        event: 'pubsub_message_parse_error',
        error: err.message,
        traceId,
        messageId: message.messageId || null
      });
      return;
    }

    logger.info({
      event: 'pubsub_message_received',
      subscription: process.env.SUBSCRIPTION_NAME || null,
      messageId: message.messageId || null,
      publishTime: message.publishTime || null,
      traceId,
      attributes,
      payload
    });

    const resource = payload && payload.resource ? String(payload.resource) : '';
    const orderId = resource
      .split('/')
      .filter(Boolean)
      .pop() || null;

    if (resource && orderId) {
      const text = `📦 ML Orders V2 — Evento recibido\n🧾 OrderId: ${orderId}\n🔗 Resource: ${resource}`;
      sendTelegramMessage(text);
    } else {
      logger.error({
        event: 'telegram_missing_resource',
        traceId,
        resource
      });
    }
  }
}

module.exports = ProcessMlOrderEventUseCase;
