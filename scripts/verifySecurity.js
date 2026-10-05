// Compatibility entry point: every test uses an isolated ephemeral database.
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'tests/security.test.js', 'tests/auth.test.js', 'tests/production.test.js'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
