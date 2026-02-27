require('dotenv').config({ override: true });

const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./infrastructure/logger');
const ProcessMlOrderEventUseCase = require('./useCases/ProcessMlOrderEventUseCase');

const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('dys-sub-ml-orders-v2 is up');
});

app.post('/', (req, res) => {
  const envelope = req.body || {};

  if (!envelope.message || !envelope.message.data) {
    logger.error({
      event: 'pubsub_bad_envelope',
      reason: 'missing message or data'
    });
    return res.status(204).end();
  }

  try {
    ProcessMlOrderEventUseCase.execute(envelope);
  } catch (err) {
    logger.error({
      event: 'pubsub_processing_error',
      error: err.message
    });
  }

  return res.status(204).end();
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info({ event: 'server_started', port: PORT });
});

module.exports = app;
