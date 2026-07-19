function normalizeShipmentSubstatus(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function parseShipmentLastUpdated(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildShipmentEnrichment(mlShipmentResponse, now = new Date()) {
  const source = mlShipmentResponse && typeof mlShipmentResponse === 'object' ? mlShipmentResponse : {};

  const logisticType = source.logistic_type || null;
  const status =
    typeof source.status === 'string' && source.status.trim()
      ? source.status.trim()
      : null;

  const enrichment = {
    logisticType,
    shipmentSubstatus: normalizeShipmentSubstatus(source.substatus),
    shipmentStatusUpdatedAt: now
  };
  const sourceUpdatedAt = parseShipmentLastUpdated(source.last_updated);

  Object.defineProperties(enrichment, {
    sourceUpdatedAt: { value: sourceUpdatedAt, enumerable: false },
    sourceTimestampMissing: { value: !sourceUpdatedAt, enumerable: false }
  });

  if (sourceUpdatedAt) {
    enrichment.shipmentLastUpdatedAt = sourceUpdatedAt;
  }

  if (status) {
    enrichment.status = status;
  }

  return enrichment;
}

module.exports = {
  buildShipmentEnrichment,
  normalizeShipmentSubstatus,
  parseShipmentLastUpdated
};
