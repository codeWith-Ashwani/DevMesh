// Both implementations run against a disposable MongoDB, never the configured Atlas database.
const { startTestServer, stopTestServer, createTestUser } = require('../tests/helpers/testUtils');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const path = require('node:path');
const mongoose = require('mongoose');
const User = require('../src/models/user');
const Connection = require('../src/models/conectionRequest');
const Legacy = require('../src/models/message');
const current = require('../src/services/chat');
const ref = '5f2c8ec73984723ce599be35770bfc0ddb1f0cce';
const filename = path.resolve('src/services/chat.js');
const baseline = new Module(filename);
baseline.filename = filename; baseline.paths = Module._nodeModulePaths(path.dirname(filename));
baseline._compile(execFileSync('git', ['show', `${ref}:src/services/chat.js`], { encoding: 'utf8' }), filename);
async function measure(fn, runs = 5) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    let operations = 0;
    mongoose.set('debug', () => operations++);
    const start = performance.now();
    await fn();
    samples.push({ ms: +(performance.now() - start).toFixed(2), operations });
  }
  mongoose.set('debug', false);
  samples.sort((a, b) => a.ms - b.ms);
  return { medianMs: samples[Math.floor(runs / 2)].ms, mongooseOperations: samples[Math.floor(runs / 2)].operations, samples };
}
(async () => {
  try {
    await startTestServer();
    const owner = await createTestUser(), peer = await createTestUser();
    const password = await require('bcrypt').hash(require('node:crypto').randomBytes(32).toString('hex'), 10);
    const others = await User.create(Array.from({ length: 19 }, (_, i) => ({ firstName: `Peer${i}`, email: `benchmark-peer-${i}@devmesh.example`, password })));
    const peers = [peer._id, ...others.map(user => user._id)];
    await Connection.insertMany(peers.map(toUserId => ({ fromUserId: owner._id, toUserId, status: 'accepted' })));
    await Legacy.insertMany(Array.from({ length: 300 }, (_, i) => ({ fromUserId: owner._id, toUserId: peer._id, text: `Previous message ${i}` })));
    const oldDirect = await measure(() => baseline.exports.openDirect(owner._id, peer._id));
    await current.openDirect(owner._id, peer._id);
    const newDirect = await measure(() => current.openDirect(owner._id, peer._id));
    const oldGroup = await measure(() => baseline.exports.createGroup(owner._id, { name: 'Benchmark team', members: peers }));
    const newGroup = await measure(() => current.createGroup(owner._id, { name: 'Benchmark team', members: peers }));
    console.log(JSON.stringify({ environment: 'Isolated MongoDB 7.0.24, warm local database, five runs; not deployed latency', baseline: ref, directReopen300Messages: { before: oldDirect, after: newDirect }, group20Peers: { before: oldGroup, after: newGroup } }, null, 2));
  } finally { mongoose.set('debug', false); await stopTestServer(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
