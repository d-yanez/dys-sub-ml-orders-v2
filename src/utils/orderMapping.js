function stripMlcPrefix(idValue) {
  if (idValue === null || idValue === undefined) {
    return null;
  }
  return String(idValue).replace(/^MLC/i, '');
}

function mapOrderDoc(mlOrder) {
  const orderItems = Array.isArray(mlOrder.order_items) ? mlOrder.order_items : [];
  const firstOrderItem = orderItems[0] || {};
  const firstItem = firstOrderItem.item || {};
  const payments = Array.isArray(mlOrder.payments) ? mlOrder.payments : [];
  const shipping = mlOrder.shipping || {};

  const mappedOrderItems = orderItems.map((orderItem) => {
    const item = orderItem.item || {};
    const normalizedSku = stripMlcPrefix(item.id);
    const normalizedVariant = stripMlcPrefix(item.variation_id);
    return {
      itemId: item.id || null,
      variationId: item.variation_id || null,
      sku: normalizedSku || null,
      skuVariant: normalizedVariant || null,
      name: item.title || null,
      quantity: orderItem.quantity || 0
    };
  });

  return {
    orderId: String(mlOrder.id || ''),
    packId: mlOrder.pack_id || null,
    itemId: firstItem.id || null,
    variationId: firstItem.variation_id || null,
    sku: stripMlcPrefix(firstItem.id) || null,
    skuVariant: stripMlcPrefix(firstItem.variation_id) || null,
    name: firstItem.title || null,
    quantity: firstOrderItem.quantity || 0,
    paymentId: payments[0] ? payments[0].id : null,
    shippingId: shipping.id || null,
    orderStatus: mlOrder.status || null,
    orderFulfilled: typeof mlOrder.fulfilled === 'boolean' ? mlOrder.fulfilled : null,
    statusDetail: mlOrder.status_detail || mlOrder.statusDetail || null,
    tags: Array.isArray(mlOrder.tags) ? mlOrder.tags : [],
    orderItems: mappedOrderItems
  };
}

module.exports = {
  mapOrderDoc,
  stripMlcPrefix
};
