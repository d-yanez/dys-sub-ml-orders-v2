const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const useCasePath = require.resolve('../src/useCases/ProcessMlOrderEventUseCase');

async function runProcessFlow({ shipmentPayload, enrichmentResult }) {
  const records = [];
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'uuid') {
      return { v4: () => 'test-uuid' };
    }
    if (request === '../config/env') {
      return {
        serviceName: 'dys-sub-ml-orders-v2-test',
        nodeEnv: 'test',
        subscriptionName: 'test-subscription',
        processTotalBudgetMs: 30000,
        processingLeaseMs: 1000
      };
    }
    if (request === '../infrastructure/logContext') {
      return {
        createLogContext: (input) => ({ ...input }),
        updateLogContext: (ctx, patch) => Object.assign(ctx, patch),
        createLogger: () => ({
          debug: (record) => records.push({ level: 'debug', ...record }),
          info: (record) => records.push({ level: 'info', ...record }),
          warn: (record) => records.push({ level: 'warn', ...record }),
          error: (record) => records.push({ level: 'error', ...record })
        })
      };
    }
    if (request === '../infrastructure/telegramClient') {
      return { sendTelegramNotification: async () => {} };
    }
    if (request === '../repositories/eventOrderLogsRepository') {
      return {
        registerOrderProcessing: async () => ({ inserted: true, selector: { orderId: '2000017470612098' } }),
        appendOrderPhase: async () => {},
        updateOrderEventStatus: async () => {},
        claimTelegramSend: async () => true,
        markTelegramSent: async () => {},
        clearTelegramClaim: async () => {}
      };
    }
    if (request === '../repositories/leaseLock') {
      return { acquireLease: async () => ({ acquired: true, lock: { leaseUntil: new Date('2026-04-26T22:20:00.000Z') } }) };
    }
    if (request === '../repositories/orderRepository') {
      return {
        upsertOrderDocument: async () => {},
        updateOrderEnrichment: async () => enrichmentResult
      };
    }
    if (request === '../services/mlService') {
      return {
        getMlOrder: async () => ({
          elapsedMs: 1,
          attempts: 1,
          data: {
            id: 2000017470612098,
            pack_id: null,
            status: 'paid',
            status_detail: 'accredited',
            tags: ['paid'],
            shipping: { id: 'ship-123' },
            payments: [],
            order_items: []
          }
        }),
        getMlShipment: async () => ({ elapsedMs: 1, attempts: 1, data: shipmentPayload }),
        getMlItem: async () => ({ elapsedMs: 1, attempts: 1, data: {} })
      };
    }
    if (request === '../services/stockService') {
      return {
        getStockBySku: async () => ({ elapsedMs: 1, attempts: 1, rows: [] }),
        getStockCircuitSnapshot: () => ({ state: 'closed' })
      };
    }
    if (request === '../services/telegramMessageBuilder') {
      return {
        buildTelegramHtml: () => '<p>ok</p>',
        buildErrorTelegramHtml: () => '<p>error</p>'
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[useCasePath];
    const ProcessMlOrderEventUseCase = require('../src/useCases/ProcessMlOrderEventUseCase');
    const payload = Buffer.from(JSON.stringify({ resource: '/orders/2000017470612098' })).toString('base64');
    const result = await ProcessMlOrderEventUseCase.execute({ message: { data: payload, attributes: { traceId: 'trace-log-test' }, messageId: 'msg-1' } });
    return { result, records };
  } finally {
    Module._load = originalLoad;
    delete require.cache[useCasePath];
  }
}

test('ProcessMlOrderEventUseCase logs timestamp-missing shipment enrichment branch', async () => {
  const { result, records } = await runProcessFlow({
    shipmentPayload: { logistic_type: 'xd_drop_off', status: 'ready_to_ship', substatus: 'pending' },
    enrichmentResult: { matchedCount: 1, modifiedCount: 1, staleSkipped: false }
  });

  assert.equal(result.ackStatus, 204);
  assert.equal(records.some((record) => record.event === 'shipment_enrichment_timestamp_missing' && record.level === 'warn'), true);
  assert.equal(records.some((record) => record.event === 'shipment_enrichment_stale_skipped'), false);
});

test('ProcessMlOrderEventUseCase logs stale-skipped shipment enrichment branch', async () => {
  const { result, records } = await runProcessFlow({
    shipmentPayload: {
      logistic_type: 'xd_drop_off',
      status: 'ready_to_ship',
      substatus: 'pending',
      last_updated: '2026-04-26T22:14:30.000Z'
    },
    enrichmentResult: { matchedCount: 0, modifiedCount: 0, staleSkipped: true }
  });

  assert.equal(result.ackStatus, 204);
  assert.equal(records.some((record) => record.event === 'shipment_enrichment_stale_skipped' && record.level === 'warn'), true);
  assert.equal(records.some((record) => record.event === 'shipment_enrichment_timestamp_missing'), false);
});
