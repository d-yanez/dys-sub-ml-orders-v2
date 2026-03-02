require('dotenv').config({ override: true });

const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./infrastructure/logger');
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

  if (!envelope.message || !envelope.message.data) {
    logger.error({
      event: 'pubsub_bad_envelope',
      reason: 'missing message or data'
    });
    return res.status(204).end();
  }

  try {
    const result = await ProcessMlOrderEventUseCase.execute(envelope);
    const ackStatus = result && result.ackStatus ? result.ackStatus : 204;
    logger.info({
      event: 'pubsub_ack_sent',
      ackStatus,
      traceId: result && result.traceId ? result.traceId : null,
      orderId: result && result.orderId ? result.orderId : null,
      duplicate: Boolean(result && result.duplicate)
    });
    return res.status(ackStatus).end();
  } catch (err) {
    logger.error({
      event: 'pubsub_processing_error',
      error: err.message
    });
    return res.status(500).end();
  }
});

async function startServer() {
  try {
    await connectMongo();
    app.listen(env.port, () => {
      logger.info({ event: 'server_started', port: env.port });
    });
  } catch (error) {
    logger.error({
      event: 'server_startup_failed',
      error: error.message
    });
    process.exit(1);
  }
}

startServer();

module.exports = app;
