const env = require('../config/env');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCode(value, fallback) {
  const normalized = value === null || value === undefined || value === '' ? fallback : value;
  return `<code>${escapeHtml(normalized)}</code>`;
}

function pickSuggestedLocation(stockRows) {
  if (!Array.isArray(stockRows) || !stockRows.length) {
    return null;
  }

  let winner = null;
  for (const row of stockRows) {
    const location = row.location || row.ubicacion || row.name || row.zone || null;
    const stock = Number(row.stock || row.quantity || row.qty || 0);

    if (!location) {
      continue;
    }

    if (!winner || stock > winner.stock) {
      winner = { location, stock };
    }
  }

  if (!winner || winner.stock <= 0) {
    return null;
  }

  return winner;
}

function buildStockTable(stockRows, compact) {
  if (!Array.isArray(stockRows) || !stockRows.length) {
    return '<b>Stock:</b>\n<i>sin stock/stock no encontrado</i>';
  }

  const normalizedRows = stockRows
    .map((row) => ({
      location: String(row.location || row.ubicacion || row.name || row.zone || '-'),
      stock: Number(row.stock || row.quantity || row.qty || 0)
    }))
    .sort((a, b) => b.stock - a.stock);

  const displayRows = compact ? normalizedRows.slice(0, 4) : normalizedRows;
  const lines = ['<b>Stock:</b>'];

  for (const row of displayRows) {
    lines.push(`• <code>${escapeHtml(row.location)}</code>: <b>${escapeHtml(row.stock)}</b>`);
  }

  if (compact && normalizedRows.length > displayRows.length) {
    lines.push(`... +${normalizedRows.length - displayRows.length}`);
  }

  return lines.join('\n');
}

function buildTelegramHtml(payload, compact = false) {
  const suggestedLocation = pickSuggestedLocation(payload.stockRows);
  const title = compact ? '<b>🛒 Orden ML</b>' : '<b>🛒 Nueva orden ML</b>';
  const nameValue = escapeHtml(payload.name || '-');
  const permalink = payload.permalink ? escapeHtml(payload.permalink) : null;
  const permalinkLine = permalink
    ? `<b>Publicacion:</b> <a href="${permalink}">Ver en Mercado Libre</a>`
    : '<i>Sin permalink</i>';

  const lines = [
    title,
    `<b>OrderId:</b> ${formatCode(payload.orderId, '-')}`,
    `<b>PackId:</b> ${formatCode(payload.packId, '-')}`,
    `<b>SKU:</b> ${formatCode(payload.sku, '-')}`,
    `<b>SKU Variant:</b> ${formatCode(payload.skuVariant, 'N/A')}`,
    `<b>Nombre:</b> ${nameValue}`,
    `<b>Cantidad:</b> <b>${escapeHtml(payload.quantity || 0)}</b>`,
    `<b>PaymentId:</b> ${formatCode(payload.paymentId, '-')}`,
    `<b>ShippingId:</b> ${formatCode(payload.shippingId, '-')}`
  ];

  if (suggestedLocation) {
    lines.push(
      `✅ Ubicacion sugerida: <b>${escapeHtml(suggestedLocation.location)}</b> (${escapeHtml(suggestedLocation.stock)})`
    );
  } else {
    lines.push('⚠️ Ubicacion sugerida: <i>sin stock/stock no encontrado</i>');
  }

  if (payload.stockStatusText) {
    lines.push(`<b>Estado stock:</b> ${escapeHtml(payload.stockStatusText)}`);
  }

  lines.push(buildStockTable(payload.stockRows, compact));
  lines.push(
    `<b>Tiempos:</b> ML Order ${formatCode(`${payload.timings.elapsed_ms_ml_order || 0} ms`, '0 ms')} | ML Item ${formatCode(`${payload.timings.elapsed_ms_ml_item || 0} ms`, '0 ms')} | Stock ${formatCode(`${payload.timings.elapsed_ms_stock || 0} ms`, '0 ms')} | <b>Total:</b> ${escapeHtml(payload.totalMs || payload.timings.elapsed_ms_total || 0)} ms`
  );
  lines.push(`<b>TraceId:</b> ${formatCode(payload.traceId, '-')}`);
  lines.push(`🔎 Buscar en GCP: <code>traceId=${escapeHtml(payload.traceId || '-')}</code>`);
  lines.push(permalinkLine);

  let html = lines.join('\n');

  if (html.length > env.telegramCaptionLimit && !compact) {
    return buildTelegramHtml(payload, true);
  }

  if (html.length > env.telegramCaptionLimit && compact) {
    const compactLines = [
      '<b>🛒 Orden ML</b>',
      `<b>OrderId:</b> ${formatCode(payload.orderId, '-')}`,
      `<b>SKU:</b> ${formatCode(payload.sku, '-')}`,
      `<b>Cantidad:</b> <b>${escapeHtml(payload.quantity || 0)}</b>`,
      `<b>TraceId:</b> ${formatCode(payload.traceId, '-')}`
    ];
    html = `${compactLines.join('\n')}\n<i>Mensaje compactado por limite de Telegram</i>`;
  }

  return html;
}

function buildErrorTelegramHtml({ orderId, traceId, stage, errorCode, message }) {
  return [
    '<b>⚠️ Error procesamiento ML</b>',
    `<b>OrderId:</b> ${formatCode(orderId, '-')}`,
    `<b>TraceId:</b> ${formatCode(traceId, '-')}`,
    `<b>Etapa:</b> <b>${escapeHtml(stage || 'UNKNOWN')}</b>`,
    `<b>ErrorCode:</b> ${formatCode(errorCode, 'UNKNOWN_ERROR')}`,
    `Detalle: ${escapeHtml((message || 'Error desconocido').slice(0, 180))}`
  ].join('\n');
}

module.exports = {
  buildTelegramHtml,
  buildErrorTelegramHtml
};
