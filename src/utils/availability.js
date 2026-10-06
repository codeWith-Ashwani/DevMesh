const databaseErrors = new Set(['MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNotConnectedError', 'MongoTopologyClosedError', 'MongoWaitQueueTimeoutError']);

function isDatabaseUnavailable(error) {
  return databaseErrors.has(error?.name) || error?.code === 50 || error?.codeName === 'MaxTimeMSExpired';
}
function unavailable() {
  return Object.assign(new Error('Database temporarily unavailable. Please try again.'), { status: 503 });
}
module.exports = { isDatabaseUnavailable, unavailable };
