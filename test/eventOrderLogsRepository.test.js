const test = require('node:test');
const assert = require('node:assert/strict');

const mongoClientPath = require.resolve('../src/infrastructure/mongoClient');
const repositoryPath = require.resolve('../src/repositories/eventOrderLogsRepository');

function loadRepositoryWithCollections(collections) {
  delete require.cache[repositoryPath];
  require.cache[mongoClientPath] = {
    id: mongoClientPath,
    filename: mongoClientPath,
    loaded: true,
    exports: { getCollections: () => collections }
  };
  return require('../src/repositories/eventOrderLogsRepository');
}

function createEventLogDouble() {
  const seen = new Set();
  const calls = [];
  return {
    calls,
    async updateOne(selector) {
      calls.push(selector);
      const key = JSON.stringify(selector);
      if (seen.has(key)) {
        return { upsertedCount: 0 };
      }
      seen.add(key);
      return { upsertedCount: 1 };
    }
  };
}

test('registerOrderProcessing dedupes the same Mercado Libre event identity', async () => {
  const eventOrderLogs = createEventLogDouble();
  const repository = loadRepositoryWithCollections({ eventOrderLogs });
  const input = { orderId: '2000017470612098', messageId: 'pubsub-1', payload: { _id: 'event-1' } };

  const first = await repository.registerOrderProcessing(input);
  const duplicate = await repository.registerOrderProcessing({ ...input, messageId: 'pubsub-redelivery' });

  assert.equal(first.inserted, true);
  assert.equal(duplicate.inserted, false);
  assert.deepEqual(first.selector, { eventId: 'payload:event-1' });
});

test('registerOrderProcessing accepts different event IDs for the same order', async () => {
  const eventOrderLogs = createEventLogDouble();
  const repository = loadRepositoryWithCollections({ eventOrderLogs });

  const first = await repository.registerOrderProcessing({ orderId: '2000017470612098', payload: { _id: 'event-1' } });
  const second = await repository.registerOrderProcessing({ orderId: '2000017470612098', payload: { _id: 'event-2' } });

  assert.equal(first.inserted, true);
  assert.equal(second.inserted, true);
  assert.deepEqual(eventOrderLogs.calls, [{ eventId: 'payload:event-1' }, { eventId: 'payload:event-2' }]);
});

test('registerOrderProcessing falls back to Pub/Sub messageId', async () => {
  const eventOrderLogs = createEventLogDouble();
  const repository = loadRepositoryWithCollections({ eventOrderLogs });

  const result = await repository.registerOrderProcessing({ orderId: '2000017470612098', messageId: 'pubsub-1', payload: {} });

  assert.deepEqual(result.selector, { eventId: 'pubsub:pubsub-1' });
});

test('Telegram claim is send-once across multiple event documents for one order', async () => {
  let state = null;
  const orderNotificationStates = {
    async findOneAndUpdate(selector, update) {
      if (state && state.sentAt) {
        const error = new Error('duplicate order state');
        error.code = 11000;
        throw error;
      }
      state = { ...(state || {}), orderId: selector.orderId, ...update.$set };
      return state;
    },
    async updateOne(selector, update) {
      if (state && state.orderId === selector.orderId && state.claimOwner === selector.claimOwner) {
        state = { ...state, ...update.$set };
      }
    }
  };
  const repository = loadRepositoryWithCollections({ orderNotificationStates });

  assert.equal(await repository.claimTelegramSend({ orderId: 'order-1', owner: 'event-1', claimMs: 1000 }), true);
  await repository.markTelegramSent({ orderId: 'order-1', owner: 'event-1' });
  assert.equal(await repository.claimTelegramSend({ orderId: 'order-1', owner: 'event-2', claimMs: 1000 }), false);
});
