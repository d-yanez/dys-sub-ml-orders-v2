const test = require('node:test');
const assert = require('node:assert/strict');

const mongoClientPath = require.resolve('../src/infrastructure/mongoClient');
const repositoryPath = require.resolve('../src/repositories/orderRepository');

function loadRepositoryWithOrder(order) {
  delete require.cache[repositoryPath];
  require.cache[mongoClientPath] = {
    id: mongoClientPath,
    filename: mongoClientPath,
    loaded: true,
    exports: { getCollections: () => ({ order }) }
  };
  return require('../src/repositories/orderRepository');
}

test('upsertOrderDocument lets replay replace persisted orderFulfilled state', async () => {
  const calls = [];
  const repository = loadRepositoryWithOrder({ async updateOne(selector, update, options) { calls.push({ selector, update, options }); } });

  await repository.upsertOrderDocument({ orderId: '2000017470612098', orderFulfilled: false });
  await repository.upsertOrderDocument({ orderId: '2000017470612098', orderFulfilled: true });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].selector, { orderId: '2000017470612098' });
  assert.equal(calls[0].update.$set.orderFulfilled, false);
  assert.equal(calls[1].update.$set.orderFulfilled, true);
  assert.deepEqual(calls[1].options, { upsert: true });
});

test('updateOrderEnrichment uses atomic shipmentLastUpdatedAt freshness guard', async () => {
  const calls = [];
  const repository = loadRepositoryWithOrder({ async updateOne(selector, update) { calls.push({ selector, update }); return { matchedCount: 1, modifiedCount: 1 }; } });
  const sourceUpdatedAt = new Date('2026-04-26T22:14:30.000Z');

  const result = await repository.updateOrderEnrichment('2000017470612098', {
    status: 'ready_to_ship',
    shipmentSubstatus: 'ready_to_print',
    logisticType: 'xd_drop_off',
    shipmentLastUpdatedAt: sourceUpdatedAt,
    shipmentStatusUpdatedAt: new Date('2026-04-26T22:15:00.000Z'),
    sourceUpdatedAt
  });

  assert.equal(result.staleSkipped, false);
  assert.deepEqual(calls[0].selector, { orderId: '2000017470612098', $or: [{ shipmentLastUpdatedAt: { $exists: false } }, { shipmentLastUpdatedAt: null }, { shipmentLastUpdatedAt: { $lte: sourceUpdatedAt } }] });
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].update.$set, 'sourceUpdatedAt'), false);
});

test('updateOrderEnrichment returns staleSkipped when guarded update matches no document', async () => {
  const repository = loadRepositoryWithOrder({ async updateOne() { return { matchedCount: 0, modifiedCount: 0 }; } });

  const result = await repository.updateOrderEnrichment('2000017470612098', {
    status: 'ready_to_ship',
    sourceUpdatedAt: new Date('2026-04-26T22:14:30.000Z')
  });

  assert.equal(result.staleSkipped, true);
});
