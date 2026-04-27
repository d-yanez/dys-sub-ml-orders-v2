function normalizeShipmentSubstatus(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
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

  if (status) {
    enrichment.status = status;
  }

  return enrichment;
}

module.exports = {
  buildShipmentEnrichment,
  normalizeShipmentSubstatus
};
