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

function resolveEventId({ payload, messageId }) {
  if (payload && payload._id !== null && payload._id !== undefined && String(payload._id).trim()) {
    return `payload:${String(payload._id).trim()}`;
  }
  if (messageId !== null && messageId !== undefined && String(messageId).trim()) {
    return `pubsub:${String(messageId).trim()}`;
  }
  return null;
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
  const eventId = resolveEventId({ payload, messageId });
  if (!eventId) {
    throw new Error('Event identity requires payload._id or Pub/Sub messageId');
  }
  const selector = { eventId };

  const result = await eventOrderLogs.updateOne(
    selector,
    {
      $setOnInsert: {
        orderId,
        eventId,
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

async function isOrderEventRegistered({ payload, messageId }) {
  const eventId = resolveEventId({ payload, messageId });
  if (!eventId) return false;
  const { eventOrderLogs } = getCollections();
  return Boolean(await eventOrderLogs.findOne({ eventId }, { projection: { _id: 1 } }));
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
  const { orderNotificationStates } = getCollections();

  let result = null;
  try {
    result = await orderNotificationStates.findOneAndUpdate(
      {
        orderId,
        sentAt: { $exists: false },
        $or: [
          { claimedAt: { $exists: false } },
          { claimUntil: { $lt: now } },
          { claimOwner: owner }
        ]
      },
      {
        $set: { claimedAt: now, claimUntil, claimOwner: owner, updatedAt: now },
        $setOnInsert: { orderId, createdAt: now }
      },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (error) {
    if (!(error && error.code === 11000)) throw error;
  }

  return Boolean(result && result.orderId === orderId);
}

async function markTelegramSent({ orderId, owner }) {
  const now = new Date();
  const { orderNotificationStates } = getCollections();
  await orderNotificationStates.updateOne(
    {
      orderId,
      claimOwner: owner
    },
    {
      $set: {
        sent: true,
        sentAt: now,
        sentBy: owner,
        updatedAt: now
      }
    }
  );
}

async function clearTelegramClaim({ orderId, owner, error }) {
  const now = new Date();
  const { orderNotificationStates } = getCollections();
  await orderNotificationStates.updateOne(
    {
      orderId,
      claimOwner: owner
    },
    {
      $set: {
        claimUntil: now,
        lastError: error ? String(error).slice(0, 200) : null,
        updatedAt: now
      }
    }
  );
}

module.exports = {
  resolveEventId,
  registerOrderProcessing,
  isOrderEventRegistered,
  appendOrderPhase,
  updateOrderEventStatus,
  claimTelegramSend,
  markTelegramSent,
  clearTelegramClaim
};
