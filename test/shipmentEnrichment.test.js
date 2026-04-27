const test = require('node:test');
const assert = require('node:assert/strict');

const { buildShipmentEnrichment, normalizeShipmentSubstatus } = require('../src/utils/shipmentEnrichment');

test('normalizeShipmentSubstatus trims values and maps empty to null', () => {
  assert.equal(normalizeShipmentSubstatus(' ready_to_print '), 'ready_to_print');
  assert.equal(normalizeShipmentSubstatus('   '), null);
  assert.equal(normalizeShipmentSubstatus(null), null);
  assert.equal(normalizeShipmentSubstatus(undefined), null);
});

test('buildShipmentEnrichment includes status + shipmentSubstatus + timestamp when shipment status exists', () => {
  const now = new Date('2026-04-26T22:00:00.000Z');
  const result = buildShipmentEnrichment(
    {
      logistic_type: 'xd_drop_off',
      status: 'ready_to_ship',
      substatus: 'ready_to_print'
    },
    now
  );

  assert.deepEqual(result, {
    logisticType: 'xd_drop_off',
    status: 'ready_to_ship',
    shipmentSubstatus: 'ready_to_print',
    shipmentStatusUpdatedAt: now
  });
});

test('buildShipmentEnrichment preserves logisticType and sets shipmentSubstatus null when empty', () => {
  const now = new Date('2026-04-26T22:05:00.000Z');
  const result = buildShipmentEnrichment(
    {
      logistic_type: 'self_service',
      status: 'ready_to_ship',
      substatus: '   '
    },
    now
  );

  assert.equal(result.logisticType, 'self_service');
  assert.equal(result.status, 'ready_to_ship');
  assert.equal(result.shipmentSubstatus, null);
  assert.equal(result.shipmentStatusUpdatedAt, now);
});

test('buildShipmentEnrichment omits status when source shipment has no status', () => {
  const now = new Date('2026-04-26T22:10:00.000Z');
  const result = buildShipmentEnrichment(
    {
      logistic_type: 'self_service',
      substatus: 'pending'
    },
    now
  );

  assert.equal(result.logisticType, 'self_service');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'status'), false);
  assert.equal(result.shipmentSubstatus, 'pending');
  assert.equal(result.shipmentStatusUpdatedAt, now);
});
