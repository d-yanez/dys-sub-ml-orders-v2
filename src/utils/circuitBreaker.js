class CircuitBreaker {
  constructor({ failureThreshold = 5, windowMs = 30000, openDurationMs = 25000 } = {}) {
    this.failureThreshold = failureThreshold;
    this.windowMs = windowMs;
    this.openDurationMs = openDurationMs;
    this.state = 'CLOSED';
    this.failures = [];
    this.openUntil = 0;
  }

  _prune(now) {
    this.failures = this.failures.filter((ts) => now - ts <= this.windowMs);
  }

  getState(now = Date.now()) {
    if (this.state === 'OPEN' && now >= this.openUntil) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  snapshot(now = Date.now()) {
    this._prune(now);
    return {
      state: this.getState(now),
      failuresInWindow: this.failures.length,
      failureThreshold: this.failureThreshold,
      windowMs: this.windowMs,
      openUntil: this.openUntil || null
    };
  }

  canRequest(now = Date.now()) {
    return this.getState(now) !== 'OPEN';
  }

  onSuccess(now = Date.now()) {
    this._prune(now);
    this.state = 'CLOSED';
    this.failures = [];
    this.openUntil = 0;
  }

  onFailure(now = Date.now()) {
    this._prune(now);
    this.failures.push(now);

    if (this.state === 'HALF_OPEN' || this.failures.length >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openUntil = now + this.openDurationMs;
    }
  }

  async execute(fn) {
    const now = Date.now();
    if (!this.canRequest(now)) {
      const error = new Error('Circuit breaker is open');
      error.code = 'CIRCUIT_OPEN_STOCK';
      error.retryable = true;
      error.circuit = this.snapshot(now);
      throw error;
    }

    try {
      const result = await fn();
      this.onSuccess(Date.now());
      return result;
    } catch (error) {
      this.onFailure(Date.now());
      error.circuit = this.snapshot(Date.now());
      throw error;
    }
  }
}

module.exports = CircuitBreaker;
