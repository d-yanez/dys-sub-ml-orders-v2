const { getCollections } = require('../infrastructure/mongoClient');

function resolveSelector({ messageId, traceId, orderId }) {
  if (orderId) {
    return { orderId };
  }
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
  payload,
  service,
  env
}) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();
  const selector = { orderId };

  const result = await eventOrderLogs.updateOne(
    selector,
    {
      $setOnInsert: {
        orderId,
        packId: packId || null,
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
        traceId,
        messageId: messageId || null,
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

async function claimTelegramSend({ orderId, owner, claimMs }) {
  const now = new Date();
  const claimUntil = new Date(now.getTime() + claimMs);
  const { eventOrderLogs } = getCollections();

  const result = await eventOrderLogs.findOneAndUpdate(
    {
      orderId,
      'telegram.sentAt': { $exists: false },
      $or: [
        { 'telegram.claimedAt': { $exists: false } },
        { 'telegram.claimUntil': { $lt: now } },
        { 'telegram.claimOwner': owner }
      ]
    },
    {
      $set: {
        'telegram.claimedAt': now,
        'telegram.claimUntil': claimUntil,
        'telegram.claimOwner': owner,
        updatedAt: now
      }
    },
    { returnDocument: 'after' }
  );

  return Boolean(result && result.orderId === orderId);
}

async function markTelegramSent({ orderId, owner }) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();
  await eventOrderLogs.updateOne(
    {
      orderId,
      'telegram.claimOwner': owner
    },
    {
      $set: {
        'telegram.sent': true,
        'telegram.sentAt': now,
        'telegram.sentBy': owner,
        updatedAt: now
      }
    }
  );
}

async function clearTelegramClaim({ orderId, owner, error }) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();
  await eventOrderLogs.updateOne(
    {
      orderId,
      'telegram.claimOwner': owner
    },
    {
      $set: {
        'telegram.claimUntil': now,
        'telegram.lastError': error ? String(error).slice(0, 200) : null,
        updatedAt: now
      }
    }
  );
}

module.exports = {
  registerOrderProcessing,
  appendOrderPhase,
  updateOrderEventStatus,
  claimTelegramSend,
  markTelegramSent,
  clearTelegramClaim
};
