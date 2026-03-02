function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function parseRetryAfterToMs(retryAfterHeader) {
  if (!retryAfterHeader) {
    return null;
  }

  const seconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const retryDate = new Date(retryAfterHeader);
  if (Number.isNaN(retryDate.getTime())) {
    return null;
  }

  return Math.max(retryDate.getTime() - Date.now(), 0);
}

function getRemainingBudgetMs({ budgetStartedAt, totalBudgetMs }) {
  if (!budgetStartedAt || !totalBudgetMs) {
    return null;
  }
  return totalBudgetMs - (Date.now() - budgetStartedAt);
}

function shouldRetryNetworkError(error) {
  const retriableNetworkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED']);
  const code = error && error.code ? String(error.code) : '';
  return retriableNetworkCodes.has(code) || !error.statusCode;
}

async function requestJsonWithRetry({
  url,
  method = 'GET',
  headers = {},
  body,
  timeoutMs,
  maxAttempts,
  retryBaseMs = 200,
  budgetStartedAt,
  totalBudgetMs
}) {
  let attempt = 0;
  let lastError = null;
  const startedAt = Date.now();

  while (attempt < maxAttempts) {
    attempt += 1;

    const remainingBudgetMs = getRemainingBudgetMs({ budgetStartedAt, totalBudgetMs });
    if (remainingBudgetMs !== null && remainingBudgetMs <= 50) {
      const budgetError = new Error('Process total budget exhausted before external request');
      budgetError.isTimeout = true;
      budgetError.retryable = true;
      budgetError.attempts = attempt - 1;
      budgetError.elapsedMs = Date.now() - startedAt;
      throw budgetError;
    }

    const effectiveTimeoutMs =
      remainingBudgetMs !== null ? Math.max(100, Math.min(timeoutMs, remainingBudgetMs - 50)) : timeoutMs;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });

      if (!response.ok) {
        const responseText = await response.text();
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.statusCode = response.status;
        error.responseText = responseText;
        error.retryAfterMs = parseRetryAfterToMs(response.headers.get('retry-after'));

        if (attempt < maxAttempts && isRetryableStatus(response.status)) {
          const retryDelayMs =
            error.retryAfterMs || retryBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);

          const remainingBeforeDelay = getRemainingBudgetMs({ budgetStartedAt, totalBudgetMs });
          if (remainingBeforeDelay !== null && remainingBeforeDelay <= retryDelayMs + 50) {
            error.attempts = attempt;
            error.elapsedMs = Date.now() - startedAt;
            error.retryable = true;
            throw error;
          }

          await sleep(retryDelayMs);
          continue;
        }

        throw error;
      }

      const json = await response.json();
      return {
        data: json,
        attempts: attempt,
        elapsedMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = error;
      const isAbort = error && error.name === 'AbortError';
      const isNetworkError = shouldRetryNetworkError(error);
      const retryable = isAbort || isNetworkError || isRetryableStatus(error.statusCode);

      if (isAbort) {
        error.isTimeout = true;
      }
      if (isNetworkError) {
        error.isNetworkError = true;
      }

      if (attempt < maxAttempts && retryable) {
        const retryDelayMs = retryBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
        const remainingBeforeDelay = getRemainingBudgetMs({ budgetStartedAt, totalBudgetMs });

        if (remainingBeforeDelay !== null && remainingBeforeDelay <= retryDelayMs + 50) {
          error.attempts = attempt;
          error.elapsedMs = Date.now() - startedAt;
          error.retryable = true;
          throw error;
        }

        await sleep(retryDelayMs);
        continue;
      }

      error.attempts = attempt;
      error.elapsedMs = Date.now() - startedAt;
      error.retryable = retryable;
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`requestJsonWithRetry exhausted attempts for ${url}`);
}

module.exports = {
  requestJsonWithRetry,
  isRetryableStatus,
  getRemainingBudgetMs
};
