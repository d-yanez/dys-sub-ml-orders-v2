class ProcessingError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'ProcessingError';
    this.stage = options.stage || 'UNKNOWN';
    this.ackStatus = options.ackStatus || 204;
    this.summary = options.summary || message;
    this.errorCode = options.errorCode || 'UNKNOWN_ERROR';
    this.errorDetails = options.errorDetails || null;
    this.context = options.context || null;
  }
}

module.exports = ProcessingError;
