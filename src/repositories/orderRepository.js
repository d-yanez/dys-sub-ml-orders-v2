const { getCollections } = require('../infrastructure/mongoClient');

async function upsertOrderDocument(orderDoc) {
  const now = new Date();
  const { order } = getCollections();

  await order.updateOne(
    { orderId: orderDoc.orderId },
    {
      $set: {
        ...orderDoc,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );
}

async function updateOrderEnrichment(orderId, enrichmentDoc) {
  const now = new Date();
  const { order } = getCollections();
  const { sourceUpdatedAt, sourceTimestampMissing, ...persistedEnrichment } = enrichmentDoc;
  const selector = sourceUpdatedAt
    ? {
        orderId,
        $or: [
          { shipmentLastUpdatedAt: { $exists: false } },
          { shipmentLastUpdatedAt: null },
          { shipmentLastUpdatedAt: { $lte: sourceUpdatedAt } }
        ]
      }
    : { orderId };

  const result = await order.updateOne(
    selector,
    {
      $set: {
        ...persistedEnrichment,
        updatedAt: now
      }
    }
  );

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    staleSkipped: Boolean(sourceUpdatedAt && !result.matchedCount)
  };
}

module.exports = {
  upsertOrderDocument,
  updateOrderEnrichment
};
