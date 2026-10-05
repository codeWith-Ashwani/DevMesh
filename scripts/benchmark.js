// Reproducible local functional benchmark, not a production capacity test.
const { startTestServer, stopTestServer, request, createTestUser } = require('../tests/helpers/testUtils');
const Message = require('../src/models/chatMessage');
const fs = require('node:fs/promises');
const os = require('node:os');
async function main() {
  const base = await startTestServer();
  try {
    const a = await createTestUser({ firstName: 'BenchmarkSender' }), b = await createTestUser({ firstName: 'BenchmarkReceiver' });
    const sent = await request('POST', `/request/send/interested/${b._id}`, {}, a.cookie);
    await request('POST', `/request/review/accepted/${sent.data.data._id}`, {}, b.cookie);
    const opened = await request('POST', '/conversations/direct', { userId: b._id }, a.cookie);
    const conversation = opened.data.data._id;
    await Message.insertMany(Array.from({ length: 5000 }, (_, i) => ({ conversation, sender: a._id, clientId: `benchmark-${i}`, text: `Seed message ${i}` })));
    const path = `${base}/conversations/${conversation}/messages?limit=30`;
    const run = async () => {
      const start = performance.now();
      const response = await fetch(path, { headers: { Cookie: b.cookie } });
      await response.arrayBuffer();
      return { ms: performance.now() - start, status: response.status };
    };
    for (let i = 0; i < 10; i++) await run();
    const results = []; const started = performance.now();
    for (let batch = 0; batch < 20; batch++) results.push(...await Promise.all(Array.from({ length: 10 }, run)));
    const durationMs = performance.now() - started;
    const durations = results.map(r => r.ms).sort((a,b) => a-b);
    const percentile = p => Number(durations[Math.ceil(p * durations.length) - 1].toFixed(2));
    const report = { environment: 'Local isolated ephemeral MongoDB; not production capacity', node: process.version, platform: os.platform(), cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, datasetMessages: 5000, pageSize: 30, concurrency: 10, requests: 200, warmupRequests: 10, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), errors: results.filter(r => r.status !== 200).length, durationMs: Number(durationMs.toFixed(2)) };
    await fs.writeFile('BENCHMARK_RESULTS.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (report.errors) process.exitCode = 1;
  } finally { await stopTestServer(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
