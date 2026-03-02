const { MongoClient } = require('mongodb');
const env = require('../config/env');
const { createLogContext, createLogger } = require('./logContext');

let client = null;
let db = null;

function getCollections() {
  return {
    eventOrderLogs: db.collection('eventOrderLogs'),
    processingLocks: db.collection('processingLocks'),
    order: db.collection('order')
  };
}

async function dropIndexIfExists(collection, indexName) {
  try {
    await collection.dropIndex(indexName);
  } catch (error) {
    if (error && (error.codeName === 'IndexNotFound' || String(error.message).includes('index not found'))) {
      return;
    }
    throw error;
  }
}

async function ensureIndexes() {
  const { eventOrderLogs, processingLocks, order } = getCollections();
  const ttlSeconds = Math.max(env.eventLogTtlDays, 1) * 24 * 60 * 60;

  await dropIndexIfExists(eventOrderLogs, 'ux_eventOrderLogs_orderId');
  await dropIndexIfExists(eventOrderLogs, 'ux_eventOrderLogs_idempotencyKey');
  await dropIndexIfExists(eventOrderLogs, 'ux_eventOrderLogs_messageId');

  await eventOrderLogs.createIndexes([
    {
      key: { orderId: 1 },
      unique: true,
      name: 'ux_eventOrderLogs_orderId',
      partialFilterExpression: { orderId: { $type: 'string' } }
    },
    { key: { traceId: 1 }, name: 'ix_eventOrderLogs_traceId' },
    { key: { messageId: 1 }, name: 'ix_eventOrderLogs_messageId' },
    { key: { createdAt: 1 }, expireAfterSeconds: ttlSeconds, name: 'ttl_eventOrderLogs_createdAt' }
  ]);

  await processingLocks.createIndexes([
    { key: { key: 1 }, unique: true, name: 'ux_processingLocks_key' },
    {
      key: { createdAt: 1 },
      expireAfterSeconds: Math.max(env.processingLockTtlSeconds, 60),
      name: 'ttl_processingLocks_createdAt'
    }
  ]);

  await order.createIndexes([
    { key: { orderId: 1 }, unique: true, name: 'ux_order_orderId' },
    { key: { packId: 1 }, name: 'ix_order_packId' },
    { key: { createdAt: -1 }, name: 'ix_order_createdAt_desc' },
    { key: { 'orderItems.itemId': 1 }, name: 'ix_order_orderItems_itemId' },
    { key: { 'orderItems.sku': 1 }, name: 'ix_order_orderItems_sku' }
  ]);
}

async function connectMongo() {
  const log = createLogger(
    createLogContext({
      service: env.serviceName,
      env: env.nodeEnv
    })
  );

  if (db) {
    return db;
  }

  if (!env.mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  client = new MongoClient(env.mongodbUri, {
    maxPoolSize: 20,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 15000,
    retryWrites: true
  });

  client.on('serverDescriptionChanged', (event) => {
    log.info({
      event: 'mongo_server_description_changed',
      phase: 'persist_order',
      status: 'SUCCESS',
      address: event.address,
      previousType: event.previousDescription ? event.previousDescription.type : null,
      newType: event.newDescription ? event.newDescription.type : null
    });
  });

  await client.connect();
  db = client.db(env.mongodbDbName);

  await ensureIndexes();

  log.info({
    event: 'mongo_connected',
    phase: 'persist_order',
    status: 'SUCCESS',
    dbName: env.mongodbDbName,
    ttlDays: env.eventLogTtlDays
  });

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('MongoDB is not initialized');
  }
  return db;
}

module.exports = {
  connectMongo,
  getDb,
  getCollections
};
