const { getCollections } = require('../infrastructure/mongoClient');

async function acquireLease({ key, owner, leaseMs }) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const { processingLocks } = getCollections();

  try {
    const result = await processingLocks.findOneAndUpdate(
      {
        key,
        $or: [{ leaseUntil: { $lt: now } }, { owner }]
      },
      {
        $set: {
          owner,
          leaseUntil,
          updatedAt: now
        },
        $setOnInsert: {
          key,
          createdAt: now
        }
      },
      {
        upsert: true,
        returnDocument: 'after'
      }
    );

    if (result && result.owner === owner) {
      return {
        acquired: true,
        lock: result
      };
    }
  } catch (error) {
    if (!(error && error.code === 11000)) {
      throw error;
    }
  }

  const current = await processingLocks.findOne({ key });
  return {
    acquired: false,
    lock: current || null
  };
}

async function releaseLease({ key, owner }) {
  const { processingLocks } = getCollections();
  await processingLocks.deleteOne({ key, owner });
}

module.exports = {
  acquireLease,
  releaseLease
};
