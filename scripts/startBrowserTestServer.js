// Isolated browser-test fixture. Never connects to the configured live database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'browser_test_secret_only_123456789';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.REDIS_URL;
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcrypt');
const http = require('http');
const app = require('../src/app');
const { attachRealtime } = require('../src/realtime');
async function main() {
  const memory = await MongoMemoryServer.create({ binary: { version: '7.0.24', downloadDir: require('path').resolve(__dirname, '../node_modules/.cache/devmesh-test-mongo') } });
  await mongoose.connect(memory.getUri('devmesh_browser_test'));
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
  const User = mongoose.model('User');
  const password = await bcrypt.hash('TestPassword#2026', 10);
  const [alice, bob, charlie] = await User.create(['Alice', 'Bob', 'Charlie'].map(firstName => ({ firstName, lastName: 'Developer', email: `${firstName.toLowerCase()}@devmesh.example`, password, skills: ['React', 'Node.js'], photoUrl: 'https://example.com/avatar.png' })));
  await mongoose.model('ConnectionRequest').create([{ fromUserId: alice._id, toUserId: bob._id, status: 'accepted' }, { fromUserId: alice._id, toUserId: charlie._id, status: 'accepted' }]);
  const server = http.createServer(app);
  const realtime = await attachRealtime(server); app.set('io', realtime.io);
  await new Promise(resolve => server.listen(7778, resolve));
  console.log('Isolated browser test API listening on 7778');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await realtime.close(); await mongoose.disconnect(); await memory.stop(); process.exit(0); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
main().catch(error => { console.error(error.message); process.exit(1); });
