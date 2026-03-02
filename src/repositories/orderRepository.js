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

  await order.updateOne(
    { orderId },
    {
      $set: {
        ...enrichmentDoc,
        updatedAt: now
      }
    }
  );
}

module.exports = {
  upsertOrderDocument,
  updateOrderEnrichment
};
