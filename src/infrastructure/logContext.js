const env = require('../config/env');
const baseLogger = require('./logger');

function createLogContext(initial = {}) {
  return {
    service: initial.service || env.serviceName,
    env: initial.env || env.nodeEnv,
    traceId: initial.traceId || null,
    orderId: initial.orderId || null,
    packId: initial.packId || null,
    messageId: initial.messageId || null,
    startedAt: initial.startedAt || Date.now()
  };
}

function updateLogContext(ctx, updates = {}) {
  if (!ctx) {
    return;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'traceId')) {
    ctx.traceId = updates.traceId;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'orderId')) {
    ctx.orderId = updates.orderId;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'packId')) {
    ctx.packId = updates.packId;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'messageId')) {
    ctx.messageId = updates.messageId;
  }
}

function buildRecord(ctx, payload = {}) {
  const elapsedTotalMs =
    payload.elapsedTotalMs !== undefined
      ? payload.elapsedTotalMs
      : ctx && ctx.startedAt
        ? Date.now() - ctx.startedAt
        : null;

  const message = {
    traceId: ctx ? ctx.traceId : null,
    orderId: ctx ? ctx.orderId : null,
    packId: ctx ? ctx.packId : null,
    messageId: ctx ? ctx.messageId : null,
    ...payload,
    elapsedTotalMs
  };

  return {
    service: ctx ? ctx.service : env.serviceName,
    env: ctx ? ctx.env : env.nodeEnv,
    message,
    // Backward compatibility for legacy queries/dashboards.
    traceId: message.traceId,
    orderId: message.orderId,
    packId: message.packId,
    messageId: message.messageId,
    phase: message.phase,
    event: message.event,
    status: message.status,
    errorCode: message.errorCode
  };
}

function createLogger(ctx) {
  return {
    debug(payload) {
      baseLogger.debug(buildRecord(ctx, payload));
    },
    info(payload) {
      baseLogger.info(buildRecord(ctx, payload));
    },
    warn(payload) {
      baseLogger.warn(buildRecord(ctx, payload));
    },
    error(payload) {
      baseLogger.error(buildRecord(ctx, payload));
    }
  };
}

module.exports = {
  createLogContext,
  updateLogContext,
  createLogger,
  buildRecord
};
