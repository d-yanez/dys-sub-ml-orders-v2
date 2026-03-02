const { getCollections } = require('../infrastructure/mongoClient');

async function registerOrderProcessing({ orderId, traceId, messageId, payload }) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();

  const result = await eventOrderLogs.updateOne(
    { orderId },
    {
      $setOnInsert: {
        orderId,
        traceId,
        messageId: messageId || null,
        status: 'PROCESSING',
        payload,
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
    upsertedId: result.upsertedId || null
  };
}

async function updateOrderEventStatus({ orderId, status, timings, warning, errorSummary, stage }) {
  const now = new Date();
  const { eventOrderLogs } = getCollections();

  await eventOrderLogs.updateOne(
    { orderId },
    {
      $set: {
        status,
        timings: timings || null,
        warning: warning || null,
        errorSummary: errorSummary || null,
        stage: stage || null,
        updatedAt: now
      }
    }
  );
}

module.exports = {
  registerOrderProcessing,
  updateOrderEventStatus
};
