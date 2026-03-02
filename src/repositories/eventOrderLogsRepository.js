const { getCollections } = require('../infrastructure/mongoClient');

function resolveSelector({ messageId, traceId, orderId }) {
  if (messageId) {
    return { messageId };
  }
  if (traceId) {
    return { traceId };
  }
  return { orderId };
}

async function registerOrderProcessing({
  orderId,
  packId,
  traceId,
  messageId,
  idempotencyKey,
  idempotencySource,
  payload,
  service,
  env
}) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();
  const resolvedKey = idempotencyKey || messageId || traceId || orderId;
  const resolvedSource = idempotencySource || (messageId ? 'messageId' : traceId ? 'traceId' : 'orderId');
  const selector = { idempotencyKey: resolvedKey };

  const result = await eventOrderLogs.updateOne(
    selector,
    {
      $setOnInsert: {
        idempotencyKey: resolvedKey,
        idempotencySource: resolvedSource,
        orderId,
        packId: packId || null,
        traceId,
        messageId: messageId || null,
        service,
        env,
        status: 'PROCESSING',
        payload,
        warning: null,
        errorCode: null,
        errorSummary: null,
        errorDetails: null,
        phases: [],
        createdAt: now
      },
      $set: {
        updatedAt: now
      }
    },
    { upsert: true }
  );

  return {
    inserted: Boolean(result.upsertedCount),
    selector
  };
}

async function appendOrderPhase({ selector, phase, elapsedMs, attempts, result, errorCode, errorSummary, errorDetails }) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();

  if (!selector) {
    return;
  }

  await eventOrderLogs.updateOne(
    selector,
    {
      $push: {
        phases: {
          phase,
          elapsedMs: elapsedMs || 0,
          attempts: attempts || 1,
          result,
          errorCode: errorCode || null,
          errorSummary: errorSummary || null,
          errorDetails: errorDetails || null,
          at: now
        }
      },
      $set: {
        updatedAt: now
      }
    }
  );
}

async function updateOrderEventStatus({
  selector,
  orderId,
  packId,
  traceId,
  messageId,
  status,
  timings,
  warning,
  errorCode,
  errorSummary,
  errorDetails,
  stage,
  phases
}) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();

  const finalSelector = selector || resolveSelector({ messageId, traceId, orderId });
  const updateSet = {
    orderId,
    packId: packId || null,
    traceId,
    messageId: messageId || null,
    status,
    timings: timings || null,
    warning: warning || null,
    errorCode: errorCode || null,
    errorSummary: errorSummary || null,
    errorDetails: errorDetails || null,
    stage: stage || null,
    updatedAt: now
  };
  if (Array.isArray(phases)) {
    updateSet.phases = phases;
  }

  await eventOrderLogs.updateOne(
    finalSelector,
    {
      $set: updateSet
    }
  );
}

module.exports = {
  registerOrderProcessing,
  appendOrderPhase,
  updateOrderEventStatus
};
