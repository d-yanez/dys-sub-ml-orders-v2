const ERROR_CODES = {
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_RESOURCE: 'INVALID_RESOURCE',
  IDEMPOTENCY_FAILED: 'IDEMPOTENCY_FAILED',

  TIMEOUT_ML_ORDER: 'TIMEOUT_ML_ORDER',
  TIMEOUT_ML_ITEM: 'TIMEOUT_ML_ITEM',
  TIMEOUT_ML_SHIPMENT: 'TIMEOUT_ML_SHIPMENT',
  TIMEOUT_STOCK: 'TIMEOUT_STOCK',
  TIMEOUT_TELEGRAM: 'TIMEOUT_TELEGRAM',
  TIMEOUT_PROCESS_BUDGET: 'TIMEOUT_PROCESS_BUDGET',

  ABORTED_STOCK: 'ABORTED_STOCK',
  ABORTED_ML_ORDER: 'ABORTED_ML_ORDER',
  ABORTED_ML_ITEM: 'ABORTED_ML_ITEM',
  ABORTED_ML_SHIPMENT: 'ABORTED_ML_SHIPMENT',

  HTTP_429_ML_ORDER: 'HTTP_429_ML_ORDER',
  HTTP_429_ML_ITEM: 'HTTP_429_ML_ITEM',
  HTTP_429_ML_SHIPMENT: 'HTTP_429_ML_SHIPMENT',
  HTTP_429_STOCK: 'HTTP_429_STOCK',

  HTTP_5XX_ML_ORDER: 'HTTP_5XX_ML_ORDER',
  HTTP_5XX_ML_ITEM: 'HTTP_5XX_ML_ITEM',
  HTTP_5XX_ML_SHIPMENT: 'HTTP_5XX_ML_SHIPMENT',
  HTTP_5XX_STOCK: 'HTTP_5XX_STOCK',

  NETWORK_ML_ORDER: 'NETWORK_ML_ORDER',
  NETWORK_ML_ITEM: 'NETWORK_ML_ITEM',
  NETWORK_ML_SHIPMENT: 'NETWORK_ML_SHIPMENT',
  NETWORK_STOCK: 'NETWORK_STOCK',

  MONGO_WRITE_FAILED: 'MONGO_WRITE_FAILED',
  TELEGRAM_FAILED: 'TELEGRAM_FAILED',

  CIRCUIT_OPEN_STOCK: 'CIRCUIT_OPEN_STOCK'
};

const transientCodes = new Set([
  ERROR_CODES.TIMEOUT_ML_ORDER,
  ERROR_CODES.TIMEOUT_ML_ITEM,
  ERROR_CODES.TIMEOUT_ML_SHIPMENT,
  ERROR_CODES.TIMEOUT_STOCK,
  ERROR_CODES.TIMEOUT_TELEGRAM,
  ERROR_CODES.TIMEOUT_PROCESS_BUDGET,
  ERROR_CODES.ABORTED_STOCK,
  ERROR_CODES.ABORTED_ML_ORDER,
  ERROR_CODES.ABORTED_ML_ITEM,
  ERROR_CODES.ABORTED_ML_SHIPMENT,
  ERROR_CODES.HTTP_429_ML_ORDER,
  ERROR_CODES.HTTP_429_ML_ITEM,
  ERROR_CODES.HTTP_429_ML_SHIPMENT,
  ERROR_CODES.HTTP_429_STOCK,
  ERROR_CODES.HTTP_5XX_ML_ORDER,
  ERROR_CODES.HTTP_5XX_ML_ITEM,
  ERROR_CODES.HTTP_5XX_ML_SHIPMENT,
  ERROR_CODES.HTTP_5XX_STOCK,
  ERROR_CODES.NETWORK_ML_ORDER,
  ERROR_CODES.NETWORK_ML_ITEM,
  ERROR_CODES.NETWORK_ML_SHIPMENT,
  ERROR_CODES.NETWORK_STOCK,
  ERROR_CODES.CIRCUIT_OPEN_STOCK,
  ERROR_CODES.MONGO_WRITE_FAILED,
  ERROR_CODES.TELEGRAM_FAILED
]);

function buildSummary(prefix, error) {
  const msg = error && error.message ? String(error.message) : 'Unknown error';
  return `${prefix}: ${msg}`.slice(0, 180);
}

function normalizeErrorCode({ dependency, error }) {
  const status = Number(error && error.statusCode ? error.statusCode : 0);
  const name = error && error.name ? String(error.name) : '';
  const message = error && error.message ? String(error.message) : '';
  const lower = message.toLowerCase();

  if (error && error.code === ERROR_CODES.CIRCUIT_OPEN_STOCK) {
    return ERROR_CODES.CIRCUIT_OPEN_STOCK;
  }

  if (dependency === 'stock' && lower.includes('this operation was aborted')) {
    return ERROR_CODES.ABORTED_STOCK;
  }

  if (name === 'AbortError' || lower.includes('aborted')) {
    if (dependency === 'stock') {
      return ERROR_CODES.ABORTED_STOCK;
    }
    if (dependency === 'ml_order') {
      return ERROR_CODES.ABORTED_ML_ORDER;
    }
    if (dependency === 'ml_item') {
      return ERROR_CODES.ABORTED_ML_ITEM;
    }
    if (dependency === 'ml_shipment') {
      return ERROR_CODES.ABORTED_ML_SHIPMENT;
    }
  }

  if (error && error.isTimeout) {
    if (dependency === 'stock') {
      return ERROR_CODES.TIMEOUT_STOCK;
    }
    if (dependency === 'ml_order') {
      return ERROR_CODES.TIMEOUT_ML_ORDER;
    }
    if (dependency === 'ml_item') {
      return ERROR_CODES.TIMEOUT_ML_ITEM;
    }
    if (dependency === 'ml_shipment') {
      return ERROR_CODES.TIMEOUT_ML_SHIPMENT;
    }
    return ERROR_CODES.TIMEOUT_PROCESS_BUDGET;
  }

  if (status === 429) {
    if (dependency === 'stock') {
      return ERROR_CODES.HTTP_429_STOCK;
    }
    if (dependency === 'ml_order') {
      return ERROR_CODES.HTTP_429_ML_ORDER;
    }
    if (dependency === 'ml_item') {
      return ERROR_CODES.HTTP_429_ML_ITEM;
    }
    if (dependency === 'ml_shipment') {
      return ERROR_CODES.HTTP_429_ML_SHIPMENT;
    }
  }

  if (status >= 500) {
    if (dependency === 'stock') {
      return ERROR_CODES.HTTP_5XX_STOCK;
    }
    if (dependency === 'ml_order') {
      return ERROR_CODES.HTTP_5XX_ML_ORDER;
    }
    if (dependency === 'ml_item') {
      return ERROR_CODES.HTTP_5XX_ML_ITEM;
    }
    if (dependency === 'ml_shipment') {
      return ERROR_CODES.HTTP_5XX_ML_SHIPMENT;
    }
  }

  if (error && error.isNetworkError) {
    if (dependency === 'stock') {
      return ERROR_CODES.NETWORK_STOCK;
    }
    if (dependency === 'ml_order') {
      return ERROR_CODES.NETWORK_ML_ORDER;
    }
    if (dependency === 'ml_item') {
      return ERROR_CODES.NETWORK_ML_ITEM;
    }
    if (dependency === 'ml_shipment') {
      return ERROR_CODES.NETWORK_ML_SHIPMENT;
    }
  }

  if (dependency === 'telegram') {
    return ERROR_CODES.TELEGRAM_FAILED;
  }

  if (dependency === 'mongo') {
    return ERROR_CODES.MONGO_WRITE_FAILED;
  }

  return ERROR_CODES.UNKNOWN_ERROR;
}

function classifyDependencyError({ dependency, error, fallbackSummary }) {
  const errorCode = normalizeErrorCode({ dependency, error });
  const retryable = transientCodes.has(errorCode) || (error && error.retryable === true);
  const ackStatus = retryable ? 500 : 204;

  return {
    errorCode,
    retryable,
    ackStatus,
    errorSummary: (fallbackSummary || buildSummary(dependency, error)).slice(0, 180),
    errorDetails: error && error.message ? String(error.message).slice(0, 500) : null
  };
}

module.exports = {
  ERROR_CODES,
  classifyDependencyError,
  normalizeErrorCode,
  transientCodes
};
