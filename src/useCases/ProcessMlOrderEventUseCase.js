const { v4: uuidv4 } = require('uuid');
const env = require('../config/env');
const { createLogContext, updateLogContext, createLogger } = require('../infrastructure/logContext');
const { sendTelegramNotification } = require('../infrastructure/telegramClient');
const {
  registerOrderProcessing,
  appendOrderPhase,
  updateOrderEventStatus,
  claimTelegramSend,
  markTelegramSent,
  clearTelegramClaim
} = require('../repositories/eventOrderLogsRepository');
const { acquireLease } = require('../repositories/leaseLock');
const { upsertOrderDocument, updateOrderEnrichment } = require('../repositories/orderRepository');
const { getMlOrder, getMlItem } = require('../services/mlService');
const { getStockBySku, getStockCircuitSnapshot } = require('../services/stockService');
const { buildTelegramHtml, buildErrorTelegramHtml } = require('../services/telegramMessageBuilder');
const ProcessingError = require('../utils/processingError');
const { ERROR_CODES, classifyDependencyError } = require('../utils/errorCatalog');

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
    status: null,
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

function getFailureStatusFromAck(ackStatus) {
  return ackStatus === 500 ? 'FAILED_TRANSIENT' : 'FAILED_PERMANENT';
}

class ProcessMlOrderEventUseCase {
  static async execute(envelope) {
    const processStart = Date.now();
    const message = envelope.message || {};
    const attributes = message.attributes || {};
    const traceId = attributes.traceId || uuidv4();
    const messageId = message.messageId || null;
    const timings = {
      elapsed_ms_ml_order: 0,
      elapsed_ms_ml_item: 0,
      elapsed_ms_ml_item_detail: 0,
      elapsed_ms_stock: 0,
      elapsed_ms_total: 0
    };

    const ctx = createLogContext({
      traceId,
      messageId,
      startedAt: processStart,
      service: env.serviceName,
      env: env.nodeEnv
    });
    const log = createLogger(ctx);
    const resilienceCtx = {
      startedAt: processStart,
      totalBudgetMs: env.processTotalBudgetMs
    };

    const phases = [];
    let payload = null;
    let orderId = null;
    let runSelector = null;
    let warning = null;
    let finalErrorCode = null;
    let finalErrorSummary = null;
    let finalErrorDetails = null;
    let lockLease = null;
    const telegramClaimOwner = uuidv4();

    const recordPhase = async ({ phase, startedAt, attempts = 1, result, errorCode, errorSummary, errorDetails }) => {
      const entry = {
        phase,
        elapsedMs: Date.now() - startedAt,
        attempts,
        result,
        errorCode: errorCode || null,
        errorSummary: errorSummary || null,
        errorDetails: errorDetails || null,
        at: new Date()
      };
      phases.push(entry);

      if (!runSelector) {
        return;
      }

      try {
        await appendOrderPhase({
          selector: runSelector,
          phase: entry.phase,
          elapsedMs: entry.elapsedMs,
          attempts: entry.attempts,
          result: entry.result,
          errorCode: entry.errorCode,
          errorSummary: entry.errorSummary,
          errorDetails: entry.errorDetails
        });
      } catch (phasePersistError) {
        log.error({
          event: 'phase_event_log_update_failed',
          phase: 'persist_order',
          status: 'ERROR',
          errorCode: ERROR_CODES.MONGO_WRITE_FAILED,
          errorSummary: 'Failed to append phase in eventOrderLogs',
          errorDetails: phasePersistError.message
        });
      }
    };

    const sendTelegramOnce = async ({ html, photoUrl }) => {
      const claimed = await claimTelegramSend({
        orderId,
        owner: telegramClaimOwner,
        claimMs: env.processingLeaseMs
      });

      if (!claimed) {
        log.debug({
          event: 'telegram_claim_rejected',
          phase: 'telegram',
          status: 'SUCCESS'
        });
        return false;
      }

      try {
        await sendTelegramNotification({
          html,
          photoUrl,
          traceId,
          orderId
        });
        await markTelegramSent({ orderId, owner: telegramClaimOwner });
        return true;
      } catch (error) {
        await clearTelegramClaim({ orderId, owner: telegramClaimOwner, error: error.message });
        throw error;
      }
    };

    try {
      const payloadRaw = Buffer.from(message.data || '', 'base64').toString();
      payload = payloadRaw ? JSON.parse(payloadRaw) : null;
    } catch (err) {
      log.error({
        event: 'phase_payload_parse_failed',
        phase: 'ingest',
        status: 'ERROR',
        errorCode: ERROR_CODES.INVALID_PAYLOAD,
        errorSummary: 'Invalid Pub/Sub payload',
        errorDetails: err.message
      });
      return { ackStatus: 204, traceId, orderId: null };
    }

    const extraction = extractOrderIdFromResource(payload);
    orderId = extraction.orderId;
    updateLogContext(ctx, { orderId });

    const lockOwner = uuidv4();

    log.info({
      event: 'phase_received_event',
      phase: 'ingest',
      status: 'SUCCESS',
      subscription: env.subscriptionName,
      publishTime: message.publishTime || null,
      attributes,
      payload
    });

    if (!orderId) {
      log.error({
        event: 'phase_invalid_resource',
        phase: 'ingest',
        status: 'ERROR',
        errorCode: ERROR_CODES.INVALID_RESOURCE,
        errorSummary: 'Resource does not include orderId',
        errorDetails: extraction.resource
      });
      return { ackStatus: 204, traceId, orderId: null };
    }

    try {
      lockLease = await acquireLease({
        key: String(orderId),
        owner: lockOwner,
        leaseMs: env.processingLeaseMs
      });
    } catch (lockError) {
      const classified = classifyDependencyError({
        dependency: 'mongo',
        error: lockError,
        fallbackSummary: 'Lease acquisition failed'
      });
      log.error({
        event: 'lock_error',
        phase: 'idempotency',
        status: 'ERROR',
        errorCode: classified.errorCode,
        errorSummary: classified.errorSummary,
        errorDetails: classified.errorDetails
      });
      return { ackStatus: 500, traceId, orderId };
    }

    if (!lockLease.acquired) {
      log.debug({
        event: 'lock_busy',
        phase: 'idempotency',
        status: 'SUCCESS',
        idempotencyKey: String(orderId),
        idempotencySource: 'orderId',
        lockOwner,
        lockLeaseUntil: lockLease.lock && lockLease.lock.leaseUntil ? lockLease.lock.leaseUntil : null
      });
      return { ackStatus: 204, traceId, orderId, duplicate: true };
    }

    log.debug({
      event: 'lock_ok',
      phase: 'idempotency',
      status: 'SUCCESS',
      idempotencyKey: String(orderId),
      idempotencySource: 'orderId',
      lockOwner,
      lockLeaseUntil: lockLease.lock && lockLease.lock.leaseUntil ? lockLease.lock.leaseUntil : null
    });

    try {
      const idempotencyStartedAt = Date.now();
      const idempotencyResult = await registerOrderProcessing({
        orderId,
        traceId,
        messageId,
        payload,
        service: env.serviceName,
        env: env.nodeEnv
      });
      runSelector = idempotencyResult.selector;

      await recordPhase({
        phase: 'idempotency',
        startedAt: idempotencyStartedAt,
        result: idempotencyResult.inserted ? 'SUCCESS' : 'DUPLICATE'
      });

      if (!idempotencyResult.inserted) {
        log.debug({
          event: 'phase_idempotency_duplicate',
          phase: 'idempotency',
          status: 'SUCCESS'
        });

        return { ackStatus: 204, traceId, orderId, duplicate: true };
      }

      log.debug({
        event: 'phase_idempotency_done',
        phase: 'idempotency',
        status: 'SUCCESS'
      });
    } catch (error) {
      const classified = classifyDependencyError({ dependency: 'mongo', error, fallbackSummary: 'Idempotency failed' });
      await recordPhase({
        phase: 'idempotency',
        startedAt: processStart,
        result: 'FAILED_TRANSIENT',
        errorCode: classified.errorCode,
        errorSummary: classified.errorSummary,
        errorDetails: classified.errorDetails
      });

      log.error({
        event: 'phase_idempotency_failed',
        phase: 'idempotency',
        status: 'ERROR',
        errorCode: classified.errorCode,
        errorSummary: classified.errorSummary,
        errorDetails: classified.errorDetails
      });

      return { ackStatus: 500, traceId, orderId };
    }

    let mappedOrder = null;
    let mlItemResponse = null;
    let stockRows = [];
    let stockStatusText = null;
    let derivedSkuVariant = null;
    let effectiveSkuVariant = null;

    try {
      const mlOrderStartedAt = Date.now();
      const mlOrderResponse = await getMlOrder(orderId, resilienceCtx);
      timings.elapsed_ms_ml_order = mlOrderResponse.elapsedMs;

      const mlOrder = mlOrderResponse.data;
      if (!mlOrder || !mlOrder.id) {
        throw new ProcessingError('Invalid ML order payload', {
          stage: 'ml_order',
          ackStatus: 204,
          summary: 'ML_ORDER payload does not contain id',
          errorCode: ERROR_CODES.INVALID_PAYLOAD
        });
      }

      mappedOrder = mapOrderDoc(mlOrder);
      updateLogContext(ctx, { packId: mappedOrder.packId || null });

      await upsertOrderDocument(mappedOrder);
      await recordPhase({
        phase: 'ml_order',
        startedAt: mlOrderStartedAt,
        attempts: mlOrderResponse.attempts,
        result: 'SUCCESS'
      });

      log.debug({
        event: 'phase_ml_order_done',
        phase: 'ml_order',
        status: 'SUCCESS',
        attempts: mlOrderResponse.attempts,
        elapsedMs: timings.elapsed_ms_ml_order
      });

      log.debug({
        event: 'phase_persist_order_done',
        phase: 'persist_order',
        status: 'SUCCESS'
      });

      if (mappedOrder.itemId) {
        const mlItemStartedAt = Date.now();
        try {
          const mlItemResult = await getMlItem(mappedOrder.itemId, resilienceCtx);
          timings.elapsed_ms_ml_item = mlItemResult.elapsedMs;
          timings.elapsed_ms_ml_item_detail = mlItemResult.elapsedMs;
          mlItemResponse = mlItemResult.data;
          const relatedItemId =
            mlItemResponse && Array.isArray(mlItemResponse.item_relations) && mlItemResponse.item_relations[0]
              ? mlItemResponse.item_relations[0].id
              : null;
          derivedSkuVariant = stripMlcPrefix(relatedItemId) || null;

          if (derivedSkuVariant) {
            log.info({
              event: 'phase_ml_item_variant_detected',
              phase: 'ml_item',
              status: 'SUCCESS',
              traceId,
              orderId,
              itemId: mappedOrder.itemId,
              derivedSkuVariant
            });
          }

          await updateOrderEnrichment(orderId, {
            'itemSnapshot.permalink': mlItemResponse.permalink || null,
            'itemSnapshot.thumbnail': mlItemResponse.thumbnail || null,
            'itemSnapshot.fetchedAt': new Date(),
            skuVariant: derivedSkuVariant || mappedOrder.skuVariant || null
          });

          await recordPhase({
            phase: 'ml_item',
            startedAt: mlItemStartedAt,
            attempts: mlItemResult.attempts,
            result: 'SUCCESS'
          });

          log.debug({
            event: 'phase_ml_item_done',
            phase: 'ml_item',
            status: 'SUCCESS',
            attempts: mlItemResult.attempts,
            elapsedMs: timings.elapsed_ms_ml_item_detail
          });
        } catch (mlItemError) {
          const mlItemClassified = classifyDependencyError({
            dependency: 'ml_item',
            error: mlItemError,
            fallbackSummary: 'ML item detail failed; continuing without derived skuVariant'
          });
          timings.elapsed_ms_ml_item = mlItemError && mlItemError.elapsedMs ? mlItemError.elapsedMs : Date.now() - mlItemStartedAt;
          timings.elapsed_ms_ml_item_detail = timings.elapsed_ms_ml_item;
          warning = warning || `ML item detail unavailable: ${toSummaryMessage(mlItemError)}`;

          await recordPhase({
            phase: 'ml_item',
            startedAt: mlItemStartedAt,
            attempts: (mlItemError && mlItemError.attempts) || 1,
            result: 'FAILED_TRANSIENT',
            errorCode: mlItemClassified.errorCode,
            errorSummary: mlItemClassified.errorSummary,
            errorDetails: mlItemClassified.errorDetails
          });

          log.warn({
            event: 'phase_ml_item_degraded',
            phase: 'ml_item',
            status: 'PARTIAL_SUCCESS',
            traceId,
            orderId,
            itemId: mappedOrder.itemId,
            elapsedMs: timings.elapsed_ms_ml_item_detail,
            errorSummary: toSummaryMessage(mlItemError),
            errorDetails: mlItemError.message
          });
        }
      } else {
        warning = 'No itemId in ML order; skipping ML item lookup';
        await recordPhase({
          phase: 'ml_item',
          startedAt: Date.now(),
          result: 'SKIPPED',
          errorSummary: warning
        });
      }

      const preferredSku = mappedOrder.sku;
      effectiveSkuVariant = derivedSkuVariant || mappedOrder.skuVariant || null;
      const fallbackSku = effectiveSkuVariant && effectiveSkuVariant !== preferredSku ? effectiveSkuVariant : null;
      if (preferredSku) {
        const stockStartedAt = Date.now();
        try {
          const stockResult = await getStockBySku(preferredSku, resilienceCtx);
          timings.elapsed_ms_stock = stockResult.elapsedMs;
          stockRows = stockResult.rows;

          if (!stockRows.length && fallbackSku) {
            const fallbackResult = await getStockBySku(fallbackSku, resilienceCtx);
            timings.elapsed_ms_stock = fallbackResult.elapsedMs;
            stockRows = fallbackResult.rows;
            stockStatusText = 'primary sku empty, used skuVariant fallback';

            log.info({
              event: 'phase_stock_lookup_fallback_done',
              phase: 'stock',
              status: 'PARTIAL_SUCCESS',
              traceId,
              orderId,
              attempts: fallbackResult.attempts,
              elapsedMs: timings.elapsed_ms_stock,
              preferredSku,
              skuQueried: fallbackSku,
              rows: stockRows.length
            });
          }

          await recordPhase({
            phase: 'stock',
            startedAt: stockStartedAt,
            attempts: stockResult.attempts,
            result: stockRows.length ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            errorSummary: stockRows.length ? null : 'No stock rows returned'
          });

          log.debug({
            event: 'phase_stock_lookup_done',
            phase: 'stock',
            status: stockRows.length ? 'SUCCESS' : 'PARTIAL_SUCCESS',
            attempts: stockResult.attempts,
            elapsedMs: timings.elapsed_ms_stock,
            skuQueried: preferredSku,
            rows: stockRows.length,
            circuitState: stockResult.circuit ? stockResult.circuit.state : null
          });
        } catch (stockError) {
          const stockClassified = classifyDependencyError({
            dependency: 'stock',
            error: stockError,
            fallbackSummary: 'Stock lookup failed'
          });
          warning = `Stock unavailable: ${toSummaryMessage(stockError)}`;
          stockStatusText = 'Stock no disponible temporalmente (degradado)';

          if (fallbackSku && stockClassified.errorCode !== ERROR_CODES.CIRCUIT_OPEN_STOCK) {
            try {
              const fallbackResult = await getStockBySku(fallbackSku, resilienceCtx);
              timings.elapsed_ms_stock = fallbackResult.elapsedMs;
              stockRows = fallbackResult.rows;
              stockStatusText = 'primary sku failed, used skuVariant fallback';

              log.info({
                event: 'phase_stock_lookup_fallback_done',
                phase: 'stock',
                status: 'PARTIAL_SUCCESS',
                traceId,
                orderId,
                attempts: fallbackResult.attempts,
                elapsedMs: timings.elapsed_ms_stock,
                preferredSku,
                skuQueried: fallbackSku,
                rows: stockRows.length,
                errorCode: stockClassified.errorCode,
                errorSummary: stockClassified.errorSummary,
                errorDetails: stockClassified.errorDetails
              });
            } catch (fallbackError) {
              const fallbackClassified = classifyDependencyError({
                dependency: 'stock',
                error: fallbackError,
                fallbackSummary: 'Stock fallback lookup failed'
              });
              warning = `Stock unavailable (sku+variant): ${toSummaryMessage(fallbackError)}`;

              await recordPhase({
                phase: 'stock',
                startedAt: stockStartedAt,
                attempts: fallbackError.attempts || 1,
                result: 'FAILED_TRANSIENT',
                errorCode: fallbackClassified.errorCode,
                errorSummary: fallbackClassified.errorSummary,
                errorDetails: fallbackClassified.errorDetails
              });

              log.warn({
                event: 'phase_stock_lookup_degraded',
                phase: 'stock',
                status: 'PARTIAL_SUCCESS',
                errorCode: fallbackClassified.errorCode,
                errorSummary: fallbackClassified.errorSummary,
                errorDetails: fallbackClassified.errorDetails,
                circuitState: getStockCircuitSnapshot().state
              });
            }
          } else {
            await recordPhase({
              phase: 'stock',
              startedAt: stockStartedAt,
              attempts: stockError.attempts || 1,
              result: stockClassified.errorCode === ERROR_CODES.CIRCUIT_OPEN_STOCK ? 'SKIPPED_CIRCUIT_OPEN' : 'FAILED_TRANSIENT',
              errorCode: stockClassified.errorCode,
              errorSummary: stockClassified.errorSummary,
              errorDetails: stockClassified.errorDetails
            });

            log.warn({
              event: 'phase_stock_lookup_degraded',
              phase: 'stock',
              status: 'PARTIAL_SUCCESS',
              errorCode: stockClassified.errorCode,
              errorSummary: stockClassified.errorSummary,
              errorDetails: stockClassified.errorDetails,
              circuitState: getStockCircuitSnapshot().state
            });
          }
        }
      } else {
        warning = 'No sku available for stock lookup';
        stockStatusText = 'Stock no disponible por SKU faltante';

        await recordPhase({
          phase: 'stock',
          startedAt: Date.now(),
          result: 'SKIPPED',
          errorSummary: warning
        });

        log.warn({
          event: 'phase_stock_lookup_degraded',
          phase: 'stock',
          status: 'PARTIAL_SUCCESS',
          errorCode: ERROR_CODES.INVALID_PAYLOAD,
          errorSummary: warning
        });
      }
    } catch (error) {
      let classifiedError;
      if (error instanceof ProcessingError) {
        classifiedError = {
          errorCode: error.errorCode || ERROR_CODES.UNKNOWN_ERROR,
          errorSummary: error.summary,
          errorDetails: error.errorDetails || error.message,
          ackStatus: error.ackStatus
        };
      } else {
        classifiedError = classifyDependencyError({
          dependency: 'ml_order',
          error,
          fallbackSummary: 'ML processing failed'
        });
      }

      timings.elapsed_ms_total = Date.now() - processStart;
      finalErrorCode = classifiedError.errorCode;
      finalErrorSummary = classifiedError.errorSummary;
      finalErrorDetails = classifiedError.errorDetails;

      await recordPhase({
        phase: 'finalize',
        startedAt: Date.now(),
        result: getFailureStatusFromAck(classifiedError.ackStatus),
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary,
        errorDetails: finalErrorDetails
      });

      try {
        await sendTelegramOnce({
          html: buildErrorTelegramHtml({
            orderId,
            traceId,
            stage: error.stage || 'PROCESSING',
            errorCode: finalErrorCode,
            message: finalErrorSummary
          }),
          photoUrl: null
        });
      } catch (telegramError) {
        log.error({
          event: 'phase_telegram_error_notification_failed',
          phase: 'telegram',
          status: 'ERROR',
          errorCode: ERROR_CODES.TELEGRAM_FAILED,
          errorSummary: 'Failed to send error telegram',
          errorDetails: telegramError.message
        });
      }

      try {
        await updateOrderEventStatus({
          selector: runSelector,
          orderId,
          packId: ctx.packId,
          traceId,
          messageId,
          status: getFailureStatusFromAck(classifiedError.ackStatus),
          timings,
          warning,
          errorCode: finalErrorCode,
          errorSummary: finalErrorSummary,
          errorDetails: finalErrorDetails,
          stage: error.stage || 'PROCESSING',
          phases
        });
      } catch (statusError) {
        log.error({
          event: 'phase_final_status_update_failed',
          phase: 'finalize',
          status: 'ERROR',
          errorCode: ERROR_CODES.MONGO_WRITE_FAILED,
          errorSummary: 'Failed to update final event log status',
          errorDetails: statusError.message
        });
      }

      log.error({
        event: 'phase_processing_failed',
        phase: error.stage || 'PROCESSING',
        status: 'ERROR',
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary,
        errorDetails: finalErrorDetails,
        ackStatus: classifiedError.ackStatus
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
      skuVariant: effectiveSkuVariant,
      name: mappedOrder.name,
      quantity: mappedOrder.quantity,
      paymentId: mappedOrder.paymentId,
      shippingId: mappedOrder.shippingId,
      permalink: mlItemResponse && mlItemResponse.permalink ? mlItemResponse.permalink : null,
      stockRows,
      timings,
      totalMs,
      traceId,
      stockStatusText
    });
    const itemPhotoUrl = resolveItemPhotoUrl(mlItemResponse);

    try {
      const sent = await sendTelegramOnce({
        html,
        photoUrl: itemPhotoUrl
      });
      if (sent) {
        log.debug({
          event: 'phase_telegram_done',
          phase: 'telegram',
          status: 'SUCCESS'
        });
      }
    } catch (error) {
      warning = warning || `Telegram failed: ${toSummaryMessage(error)}`;
      finalErrorCode = ERROR_CODES.TELEGRAM_FAILED;
      finalErrorSummary = 'Telegram notification failed';
      finalErrorDetails = error.message;
      log.error({
        event: 'phase_telegram_failed',
        phase: 'telegram',
        status: 'PARTIAL_SUCCESS',
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary,
        errorDetails: finalErrorDetails
      });
    }

    try {
      await updateOrderEventStatus({
        selector: runSelector,
        orderId,
        packId: ctx.packId,
        traceId,
        messageId,
        status: warning ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        timings,
        warning,
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary,
        errorDetails: finalErrorDetails,
        stage: 'COMPLETED',
        phases
      });

      await recordPhase({
        phase: 'finalize',
        startedAt: Date.now(),
        result: warning ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary,
        errorDetails: finalErrorDetails
      });

      log.debug({
        event: 'phase_finalize_done',
        phase: 'finalize',
        status: warning ? 'PARTIAL_SUCCESS' : 'SUCCESS',
        elapsedMs: timings.elapsed_ms_total,
        warning: warning || null,
        errorCode: finalErrorCode,
        errorSummary: finalErrorSummary
      });
    } catch (statusError) {
      log.error({
        event: 'phase_final_status_update_failed',
        phase: 'finalize',
        status: 'ERROR',
        errorCode: ERROR_CODES.MONGO_WRITE_FAILED,
        errorSummary: 'Failed to update final event log status',
        errorDetails: statusError.message
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
