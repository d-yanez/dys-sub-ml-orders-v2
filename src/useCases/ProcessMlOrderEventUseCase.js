const { v4: uuidv4 } = require('uuid');
const logger = require('../infrastructure/logger');
const { sendTelegramNotification } = require('../infrastructure/telegramClient');
const { registerOrderProcessing, updateOrderEventStatus } = require('../repositories/eventOrderLogsRepository');
const { upsertOrderDocument, updateOrderEnrichment } = require('../repositories/orderRepository');
const { getMlOrder, getMlItem } = require('../services/mlService');
const { getStockBySku } = require('../services/stockService');
const { buildTelegramHtml, buildErrorTelegramHtml } = require('../services/telegramMessageBuilder');
const ProcessingError = require('../utils/processingError');

function extractOrderIdFromResource(payload) {
  const resource = payload && payload.resource ? String(payload.resource) : '';
  const orderId = resource
    .split('/')
    .filter(Boolean)
    .pop() || null;
  return { resource, orderId };
}

function stripMlcPrefix(idValue) {
  if (idValue === null || idValue === undefined) {
    return null;
  }
  return String(idValue).replace(/^MLC/i, '');
}

function classifyMlError(error, stage) {
  const status = Number(error.statusCode || 0);
  const retryable = status === 429 || status >= 500 || !status || error.name === 'AbortError';

  if (retryable) {
    return new ProcessingError(`Transitory failure at ${stage}`, {
      stage,
      ackStatus: 500,
      summary: `${stage} transitory error: ${error.message}`
    });
  }

  return new ProcessingError(`Permanent failure at ${stage}`, {
    stage,
    ackStatus: 204,
    summary: `${stage} permanent error: ${error.message}`
  });
}

function mapOrderDoc(mlOrder) {
  const orderItems = Array.isArray(mlOrder.order_items) ? mlOrder.order_items : [];
  const firstOrderItem = orderItems[0] || {};
  const firstItem = firstOrderItem.item || {};
  const payments = Array.isArray(mlOrder.payments) ? mlOrder.payments : [];
  const shipping = mlOrder.shipping || {};

  const mappedOrderItems = orderItems.map((orderItem) => {
    const item = orderItem.item || {};
    const normalizedSku = stripMlcPrefix(item.id);
    const normalizedVariant = stripMlcPrefix(item.variation_id);
    return {
      itemId: item.id || null,
      variationId: item.variation_id || null,
      sku: normalizedSku || null,
      skuVariant: normalizedVariant || null,
      name: item.title || null,
      quantity: orderItem.quantity || 0
    };
  });

  return {
    orderId: String(mlOrder.id || ''),
    packId: mlOrder.pack_id || null,
    itemId: firstItem.id || null,
    variationId: firstItem.variation_id || null,
    sku: stripMlcPrefix(firstItem.id) || null,
    skuVariant: stripMlcPrefix(firstItem.variation_id) || null,
    name: firstItem.title || null,
    quantity: firstOrderItem.quantity || 0,
    paymentId: payments[0] ? payments[0].id : null,
    shippingId: shipping.id || null,
    orderItems: mappedOrderItems
  };
}

function toSummaryMessage(error) {
  return String(error && error.message ? error.message : 'Unknown error').slice(0, 180);
}

function resolveItemPhotoUrl(mlItemResponse) {
  if (!mlItemResponse) {
    return null;
  }
  const securePictureUrl =
    Array.isArray(mlItemResponse.pictures) &&
    mlItemResponse.pictures[0] &&
    mlItemResponse.pictures[0].secure_url
      ? mlItemResponse.pictures[0].secure_url
      : null;
  return securePictureUrl || mlItemResponse.thumbnail || null;
}

class ProcessMlOrderEventUseCase {
  static async execute(envelope) {
    const processStart = Date.now();
    const message = envelope.message || {};
    const attributes = message.attributes || {};
    const traceId = attributes.traceId || uuidv4();
    const timings = {
      elapsed_ms_ml_order: 0,
      elapsed_ms_ml_item: 0,
      elapsed_ms_stock: 0,
      elapsed_ms_total: 0
    };

    let payload = null;
    let orderId = null;

    try {
      const payloadRaw = Buffer.from(message.data || '', 'base64').toString();
      payload = payloadRaw ? JSON.parse(payloadRaw) : null;
    } catch (err) {
      logger.error({
        event: 'pubsub_message_parse_error',
        error: err.message,
        traceId,
        messageId: message.messageId || null
      });
      return { ackStatus: 204, traceId };
    }

    const extraction = extractOrderIdFromResource(payload);
    orderId = extraction.orderId;

    logger.info({
      event: 'phase_received_event',
      phase: 'ingest',
      subscription: process.env.SUBSCRIPTION_NAME || null,
      messageId: message.messageId || null,
      publishTime: message.publishTime || null,
      traceId,
      attributes,
      payload,
      orderId
    });

    if (!orderId) {
      logger.error({
        event: 'phase_invalid_resource',
        phase: 'ingest',
        traceId,
        messageId: message.messageId || null,
        resource: extraction.resource
      });
      return { ackStatus: 204, traceId };
    }

    try {
      const idempotencyResult = await registerOrderProcessing({
        orderId,
        traceId,
        messageId: message.messageId || null,
        payload
      });

      logger.info({
        event: 'phase_idempotency_done',
        phase: 'idempotency',
        traceId,
        orderId,
        inserted: idempotencyResult.inserted
      });

      if (!idempotencyResult.inserted) {
        return { ackStatus: 204, traceId, orderId, duplicate: true };
      }
    } catch (error) {
      logger.error({
        event: 'phase_idempotency_failed',
        phase: 'idempotency',
        traceId,
        orderId,
        error: error.message
      });

      return { ackStatus: 500, traceId, orderId };
    }

    let mappedOrder = null;
    let mlItemResponse = null;
    let stockRows = [];
    let warning = null;

    try {
      const mlOrderResponse = await getMlOrder(orderId);
      timings.elapsed_ms_ml_order = mlOrderResponse.elapsedMs;

      logger.info({
        event: 'phase_ml_order_done',
        phase: 'ml_order',
        traceId,
        orderId,
        attempts: mlOrderResponse.attempts,
        elapsed_ms_ml_order: timings.elapsed_ms_ml_order
      });

      const mlOrder = mlOrderResponse.data;
      if (!mlOrder || !mlOrder.id) {
        throw new ProcessingError('Invalid ML order payload', {
          stage: 'ML_ORDER',
          ackStatus: 204,
          summary: 'ML_ORDER payload does not contain id'
        });
      }

      mappedOrder = mapOrderDoc(mlOrder);
      await upsertOrderDocument(mappedOrder);
      logger.info({
        event: 'phase_persist_order_done',
        phase: 'persist_order',
        traceId,
        orderId
      });

      if (mappedOrder.itemId) {
        const mlItemResult = await getMlItem(mappedOrder.itemId);
        timings.elapsed_ms_ml_item = mlItemResult.elapsedMs;
        mlItemResponse = mlItemResult.data;
        await updateOrderEnrichment(orderId, {
          'itemSnapshot.permalink': mlItemResponse.permalink || null,
          'itemSnapshot.thumbnail': mlItemResponse.thumbnail || null,
          'itemSnapshot.fetchedAt': new Date()
        });
        logger.info({
          event: 'phase_ml_item_done',
          phase: 'ml_item',
          traceId,
          orderId,
          attempts: mlItemResult.attempts,
          elapsed_ms_ml_item: timings.elapsed_ms_ml_item
        });
      } else {
        warning = 'No itemId in ML order; skipping ML item lookup';
      }

      const preferredSku = mappedOrder.sku;
      const fallbackSku = mappedOrder.skuVariant;
      if (preferredSku) {
        try {
          const stockResult = await getStockBySku(preferredSku);
          timings.elapsed_ms_stock = stockResult.elapsedMs;
          stockRows = stockResult.rows;
          logger.info({
            event: 'phase_stock_done',
            phase: 'stock',
            traceId,
            orderId,
            skuQueried: preferredSku,
            attempts: stockResult.attempts,
            elapsed_ms_stock: timings.elapsed_ms_stock,
            rows: stockRows.length,
            stockPayloadType: Array.isArray(stockResult.data) ? 'array' : typeof stockResult.data
          });

          if (!stockRows.length && fallbackSku) {
            const stockFallbackResult = await getStockBySku(fallbackSku);
            timings.elapsed_ms_stock = stockFallbackResult.elapsedMs;
            stockRows = stockFallbackResult.rows;
            logger.warn({
              event: 'phase_stock_fallback_empty_primary',
              phase: 'stock',
              traceId,
              orderId,
              skuQueried: fallbackSku,
              rows: stockRows.length
            });
          }
        } catch (stockError) {
          warning = `Stock unavailable: ${toSummaryMessage(stockError)}`;
          if (fallbackSku) {
            try {
              const stockFallbackResult = await getStockBySku(fallbackSku);
              timings.elapsed_ms_stock = stockFallbackResult.elapsedMs;
              stockRows = stockFallbackResult.rows;
              logger.warn({
                event: 'phase_stock_fallback_done',
                phase: 'stock',
                traceId,
                orderId,
                skuQueried: fallbackSku,
                rows: stockRows.length
              });
            } catch (fallbackError) {
              warning = `Stock unavailable (sku+variant): ${toSummaryMessage(fallbackError)}`;
              logger.warn({
                event: 'phase_stock_fallback_failed',
                phase: 'stock',
                traceId,
                orderId,
                error: fallbackError.message
              });
            }
          }
        }
      } else {
        warning = 'No sku available for stock lookup';
      }
    } catch (error) {
      const classifiedError =
        error instanceof ProcessingError ? error : classifyMlError(error, error.stage || 'PROCESSING');
      timings.elapsed_ms_total = Date.now() - processStart;

      try {
        await sendTelegramNotification({
          html: buildErrorTelegramHtml({
            orderId,
            stage: classifiedError.stage,
            message: classifiedError.summary
          }),
          photoUrl: null,
          traceId,
          orderId
        });
      } catch (telegramError) {
        logger.error({
          event: 'phase_telegram_error_notification_failed',
          phase: 'telegram_error',
          traceId,
          orderId,
          error: telegramError.message
        });
      }

      try {
        await updateOrderEventStatus({
          orderId,
          status: classifiedError.ackStatus === 500 ? 'FAILED_TRANSIENT' : 'FAILED_PERMANENT',
          timings,
          warning,
          errorSummary: classifiedError.summary,
          stage: classifiedError.stage
        });
      } catch (statusError) {
        logger.error({
          event: 'phase_final_status_update_failed',
          phase: 'event_log_update',
          traceId,
          orderId,
          error: statusError.message
        });
      }

      logger.error({
        event: 'phase_processing_failed',
        phase: classifiedError.stage,
        traceId,
        orderId,
        ackStatus: classifiedError.ackStatus,
        error: classifiedError.summary
      });

      return {
        ackStatus: classifiedError.ackStatus,
        traceId,
        orderId
      };
    }

    timings.elapsed_ms_total = Date.now() - processStart;
    const totalMs = timings.elapsed_ms_total;

    const html = buildTelegramHtml({
      orderId: mappedOrder.orderId,
      packId: mappedOrder.packId,
      sku: mappedOrder.sku,
      skuVariant: mappedOrder.skuVariant,
      name: mappedOrder.name,
      quantity: mappedOrder.quantity,
      paymentId: mappedOrder.paymentId,
      shippingId: mappedOrder.shippingId,
      permalink: mlItemResponse && mlItemResponse.permalink ? mlItemResponse.permalink : null,
      stockRows,
      timings,
      totalMs
    });
    const itemPhotoUrl = resolveItemPhotoUrl(mlItemResponse);

    try {
      await sendTelegramNotification({
        html,
        photoUrl: itemPhotoUrl,
        traceId,
        orderId
      });
      logger.info({
        event: 'phase_telegram_done',
        phase: 'telegram',
        traceId,
        orderId
      });
    } catch (error) {
      warning = warning || `Telegram failed: ${toSummaryMessage(error)}`;
      logger.error({
        event: 'phase_telegram_failed',
        phase: 'telegram',
        traceId,
        orderId,
        error: error.message
      });
    }

    try {
      await updateOrderEventStatus({
        orderId,
        status: warning ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        timings,
        warning,
        errorSummary: null,
        stage: 'COMPLETED'
      });
      logger.info({
        event: 'phase_event_log_finalized',
        phase: 'event_log_update',
        traceId,
        orderId,
        status: warning ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        elapsed_ms_total: timings.elapsed_ms_total
      });
    } catch (statusError) {
      logger.error({
        event: 'phase_final_status_update_failed',
        phase: 'event_log_update',
        traceId,
        orderId,
        error: statusError.message
      });
    }

    return {
      ackStatus: 204,
      traceId,
      orderId,
      warning
    };
  }
}

module.exports = ProcessMlOrderEventUseCase;
