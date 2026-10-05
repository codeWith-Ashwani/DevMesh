// Isolated local benchmark. Never uses the deployed database or accounts.
const { startTestServer, stopTestServer, createTestUser, request } = require('../tests/helpers/testUtils');
const mongoose = require('mongoose');
const Conversation = require('../src/models/conversation');
const Message = require('../src/models/chatMessage');
const Receipt = require('../src/models/readReceipt');
const fs = require('node:fs/promises');

async function main() {
  await startTestServer();
  try {
    const me = await createTestUser({ firstName: 'InboxBenchmark' });
    const peer = await createTestUser({ firstName: 'InboxPeer' });
    const rows = await Conversation.insertMany(Array.from({ length: 30 }, (_, i) => ({
      kind: 'group', name: `Benchmark team ${i}`, owner: me._id, members: [me._id, peer._id],
    })));
    for (const row of rows) {
      const messages = await Message.insertMany(Array.from({ length: 50 }, (_, i) => ({
        conversation: row._id, sender: i % 2 ? me._id : peer._id, clientId: `benchmark-${i}`, text: `Message ${i}`,
      })));
      await Receipt.create({ conversation: row._id, user: me._id, message: messages[19]._id });
    }
    let queries = 0;
    mongoose.set('debug', () => { queries++; });
    const run = async () => {
      queries = 0;
      const start = performance.now();
      const result = await request('GET', '/conversations', null, me.cookie);
      if (result.status !== 200 || result.data.data.length !== 30 || result.data.data.some(r => r.unreadCount !== 15 || r.lastMessage?.text !== 'Message 49')) {
        throw new Error('Inbox benchmark response failed correctness checks');
      }
      return { ms: performance.now() - start, queries };
    };
    for (let i = 0; i < 3; i++) await run();
    const results = [];
    for (let i = 0; i < 15; i++) results.push(await run());
    const sorted = results.map(r => r.ms).sort((a, b) => a - b);
    const report = {
      environment: 'Local isolated MongoDB 7.0.24; warm sequential HTTP requests, not production latency',
      node: process.version, conversations: 30, messagesPerConversation: 50, requests: results.length,
      p50Ms: Number(sorted[7].toFixed(2)), p95Ms: Number(sorted[14].toFixed(2)),
      databaseOperationsPerRequest: [...new Set(results.map(r => r.queries))],
      correctness: '30 conversations, 15 unread peer messages each, latest message correct',
    };
    const output = process.argv[2];
    if (output) await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    mongoose.set('debug', false);
    await stopTestServer();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
