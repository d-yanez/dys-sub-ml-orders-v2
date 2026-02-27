const { v4: uuidv4 } = require('uuid');
const logger = require('../infrastructure/logger');

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
  }
}

module.exports = ProcessMlOrderEventUseCase;
