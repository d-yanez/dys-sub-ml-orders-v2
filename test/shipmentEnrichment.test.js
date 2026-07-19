const test = require('node:test');
const assert = require('node:assert/strict');

const { buildShipmentEnrichment, normalizeShipmentSubstatus } = require('../src/utils/shipmentEnrichment');
const { mapOrderDoc } = require('../src/utils/orderMapping');

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

test('mapOrderDoc stores ML commercial state without shipment-owned fields', () => {
  const result = mapOrderDoc({
    id: 2000017470612098,
    pack_id: null,
    status: 'paid',
    status_detail: 'accredited',
    tags: ['paid', 'no_shipping'],
    shipping: { id: null },
    payments: [{ id: 111 }],
    order_items: [
      {
        quantity: 1,
        item: { id: 'MLC123', variation_id: 'MLC456', title: 'Pickup item' }
      }
    ]
  });

  assert.equal(result.orderStatus, 'paid');
  assert.equal(result.statusDetail, 'accredited');
  assert.deepEqual(result.tags, ['paid', 'no_shipping']);
  assert.equal(result.shippingId, null);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'status'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'shipmentSubstatus'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'logisticType'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'shipmentStatusUpdatedAt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'shipmentLastUpdatedAt'), false);
});

test('buildShipmentEnrichment exposes parseable shipment last_updated as source timestamp', () => {
  const now = new Date('2026-04-26T22:15:00.000Z');
  const result = buildShipmentEnrichment(
    {
      logistic_type: 'xd_drop_off',
      status: 'ready_to_ship',
      substatus: 'ready_to_print',
      last_updated: '2026-04-26T22:14:30.000Z'
    },
    now
  );

  assert.equal(result.shipmentLastUpdatedAt.toISOString(), '2026-04-26T22:14:30.000Z');
  assert.equal(result.sourceUpdatedAt.toISOString(), '2026-04-26T22:14:30.000Z');
  assert.equal(result.shipmentStatusUpdatedAt, now);
});

test('buildShipmentEnrichment reports missing source timestamp without changing current enrichment shape', () => {
  const result = buildShipmentEnrichment({ logistic_type: 'self_service', status: 'handling' });

  assert.equal(result.sourceUpdatedAt, null);
  assert.equal(result.sourceTimestampMissing, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'shipmentLastUpdatedAt'), false);
});
