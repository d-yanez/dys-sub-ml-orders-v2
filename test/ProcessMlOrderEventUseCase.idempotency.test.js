const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const useCasePath = require.resolve('../src/useCases/ProcessMlOrderEventUseCase');

async function executeWithBusyLease({ eventId, registeredEventIds }) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'uuid') return { v4: () => 'owner-1' };
    if (request === '../config/env') return { serviceName: 'test', nodeEnv: 'test', subscriptionName: 'test', processTotalBudgetMs: 30000, processingLeaseMs: 1000 };
    if (request === '../infrastructure/logContext') return { createLogContext: (value) => ({ ...value }), updateLogContext: Object.assign, createLogger: () => ({ debug() {}, info() {}, warn() {}, error() {} }) };
    if (request === '../infrastructure/telegramClient') return { sendTelegramNotification: async () => {} };
    if (request === '../repositories/leaseLock') return { acquireLease: async () => ({ acquired: false, lock: { leaseUntil: new Date() } }), releaseLease: async () => {} };
    if (request === '../repositories/eventOrderLogsRepository') {
      return {
        isOrderEventRegistered: async ({ payload }) => registeredEventIds.has(payload._id)
      };
    }
    if (request === '../repositories/orderRepository') return {};
    if (request === '../services/mlService') return {};
    if (request === '../services/stockService') return {};
    if (request === '../services/telegramMessageBuilder') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[useCasePath];
    const UseCase = require('../src/useCases/ProcessMlOrderEventUseCase');
    const data = Buffer.from(JSON.stringify({ _id: eventId, resource: '/orders/order-1' })).toString('base64');
    return await UseCase.execute({ message: { data, messageId: `message-${eventId}`, attributes: {} } });
  } finally {
    Module._load = originalLoad;
    delete require.cache[useCasePath];
  }
}

test('occupied order lease only dedupes its recorded event and retries a distinct event', async () => {
  const registeredEventIds = new Set(['event-1']);

  assert.deepEqual(await executeWithBusyLease({ eventId: 'event-1', registeredEventIds }), {
    ackStatus: 204,
    traceId: 'owner-1',
    orderId: 'order-1',
    duplicate: true
  });

  assert.deepEqual(await executeWithBusyLease({ eventId: 'event-2', registeredEventIds }), {
    ackStatus: 500,
    traceId: 'owner-1',
    orderId: 'order-1',
    retryable: true
  });
});
