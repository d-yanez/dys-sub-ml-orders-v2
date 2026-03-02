require('dotenv').config({ override: true });

const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./infrastructure/logger');
const { createLogContext, createLogger } = require('./infrastructure/logContext');
const ProcessMlOrderEventUseCase = require('./useCases/ProcessMlOrderEventUseCase');
const { connectMongo } = require('./infrastructure/mongoClient');
const env = require('./config/env');

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('dys-sub-ml-orders-v2 is up');
});

app.post('/', async (req, res) => {
  const envelope = req.body || {};
  const message = envelope.message || {};
  const ctx = createLogContext({
    traceId: message.attributes && message.attributes.traceId ? message.attributes.traceId : null,
    messageId: message.messageId || null,
    service: env.serviceName,
    env: env.nodeEnv
  });
  const log = createLogger(ctx);

  if (!envelope.message || !envelope.message.data) {
    log.error({
      event: 'pubsub_bad_envelope',
      phase: 'ingest',
      status: 'ERROR',
      errorCode: 'INVALID_PAYLOAD',
      errorSummary: 'Missing message or data in push envelope'
    });
    return res.status(204).end();
  }

  try {
    const result = await ProcessMlOrderEventUseCase.execute(envelope);
    const ackStatus = result && result.ackStatus ? result.ackStatus : 204;

    createLogger(
      createLogContext({
        traceId: result && result.traceId ? result.traceId : null,
        orderId: result && result.orderId ? result.orderId : null,
        messageId: message.messageId || null,
        service: env.serviceName,
        env: env.nodeEnv
      })
    ).info({
      event: 'pubsub_ack_sent',
      phase: 'finalize',
      status: ackStatus === 204 ? 'SUCCESS' : 'ERROR',
      ackStatus,
      duplicate: Boolean(result && result.duplicate),
      warning: result && result.warning ? result.warning : null
    });

    return res.status(ackStatus).end();
  } catch (err) {
    log.error({
      event: 'pubsub_processing_error',
      phase: 'finalize',
      status: 'ERROR',
      errorCode: 'UNKNOWN_ERROR',
      errorSummary: 'Unhandled exception in request handler',
      errorDetails: err.message
    });
    return res.status(500).end();
  }
});

async function startServer() {
  try {
    await connectMongo();
    app.listen(env.port, () => {
      logger.info({
        service: env.serviceName,
        env: env.nodeEnv,
        message: {
          event: 'server_started',
          phase: 'bootstrap',
          status: 'SUCCESS',
          port: env.port,
          traceId: null,
          orderId: null,
          packId: null,
          messageId: null
        }
      });
    });
  } catch (error) {
    logger.error({
      service: env.serviceName,
      env: env.nodeEnv,
      message: {
        event: 'server_startup_failed',
        phase: 'bootstrap',
        status: 'ERROR',
        errorCode: 'UNKNOWN_ERROR',
        errorSummary: 'Server startup failed',
        errorDetails: error.message,
        traceId: null,
        orderId: null,
        packId: null,
        messageId: null
      }
    });
    process.exit(1);
  }
}

startServer();

module.exports = app;
