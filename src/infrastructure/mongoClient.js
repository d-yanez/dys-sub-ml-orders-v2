const { MongoClient } = require('mongodb');
const logger = require('./logger');
const env = require('../config/env');

let client = null;
let db = null;

function getCollections() {
  return {
    eventOrderLogs: db.collection('eventOrderLogs'),
    order: db.collection('order')
  };
}

async function ensureIndexes() {
  const { eventOrderLogs, order } = getCollections();
  const ttlSeconds = Math.max(env.eventLogTtlDays, 1) * 24 * 60 * 60;

  await eventOrderLogs.createIndexes([
    { key: { orderId: 1 }, unique: true, name: 'ux_eventOrderLogs_orderId' },
    { key: { createdAt: 1 }, expireAfterSeconds: ttlSeconds, name: 'ttl_eventOrderLogs_createdAt' }
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
    logger.info({
      event: 'mongo_server_description_changed',
      address: event.address,
      previousType: event.previousDescription ? event.previousDescription.type : null,
      newType: event.newDescription ? event.newDescription.type : null
    });
  });

  await client.connect();
  db = client.db(env.mongodbDbName);

  await ensureIndexes();

  logger.info({
    event: 'mongo_connected',
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
