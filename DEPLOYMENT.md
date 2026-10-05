# Deployment and operations

## Configuration

Use Node 22 or newer. Set NODE_ENV=production, a randomly generated JWT_SECRET of at least 32 characters, DB_CONNECTION_STRING pointing to the intended MongoDB database, and CLIENT_URL equal to the exact HTTPS frontend origin. Never put backend secrets in VITE_ variables. Rotate the previously committed database credential outside this repository; removing it from the current tree does not remove it from Git history.

For multiple API instances, set REDIS_URL to the same private, authenticated Redis service. Use TLS (`rediss://`) outside a trusted private network, dedicated credentials and firewall rules. The development compose stack exposes only the API on localhost; it is not a production deployment template.

Configure TRUST_PROXY_HOPS only when the exact proxy chain is known. Do not trust arbitrary X-Forwarded-For headers. Terminate HTTPS at your proxy. Forward WebSocket upgrades for /socket.io/, and configure an idle timeout longer than Socket.IO heartbeat intervals. Both client and server use WebSocket-only transport; HTTP polling fallback is intentionally disabled, so proxies must support upgrades.

Cross-site cookies use Secure, HttpOnly and SameSite=None in production. Browser third-party cookie restrictions may block separate-site deployments; prefer app.example.com and api.example.com, or a same-origin reverse proxy. Browser writes and socket handshakes enforce CLIENT_URL. Non-browser API clients may send authenticated requests without Origin. Logout invalidates all existing sessions for that user; password changes renew the current cookie and disconnect existing sockets.

## Startup and shutdown

`npm ci --omit=dev` then `npm start`. Startup validates the JWT secret and origin, connects MongoDB/optional Redis, and waits for model initialization/index creation before accepting traffic. Account for index creation time on existing large collections. SIGTERM/SIGINT stop sockets and HTTP, disconnect Redis and MongoDB, with a 10-second shutdown timeout.

- GET /health: process liveness.
- GET /ready: MongoDB and configured Redis publisher readiness.
- Structured HTTP logs contain a generated request ID, method, path, status and duration. They exclude cookies, bodies and query strings.
- Monitor API errors, Redis disconnects, MongoDB health and socket connection failures. Subscriber-only failures currently appear in logs rather than in /ready; include a cross-instance delivery probe in operational monitoring.

## Message guarantees

MongoDB stores messages before live broadcasts. Unique (conversation, sender, clientId) indexes make client retries idempotent. If an acknowledgement times out, resend the same clientId and body. Conflicting reuse returns 409. Broadcasts may repeat and clients deduplicate persisted IDs.

Live events are best-effort, not an exactly-once transport. Clients synchronize missed history with the forward `after` cursor when reconnecting and page older history with `before`. Redis Pub/Sub distributes live packets and does not store chat history or support Socket.IO connection-state recovery. Losing Redis temporarily interrupts cross-instance broadcasts; durable history still allows recovery. Shared send/authentication limits fail closed while Redis is unavailable.

Rooms are per authenticated user. The server derives recipients from current membership rather than trusting client-provided room names. Project membership is derived from the owner and accepted applications; removal immediately blocks subsequent access. Every event verifies the cookie, expiry and auth version.

## Compatibility and limits

- Existing projects without role openings default to one seat per legacy role. Old applications default to the project's first role.
- Existing personal Message records import idempotently into ChatMessage on opening a personal conversation. Legacy /chat endpoints remain for compatibility; use /conversations and Socket.IO for the new client. Historical imports stream records but can add latency on large conversations. Schedule a dedicated migration before a large rollout.
- Applications remain embedded and are capped at 200 per project. Large recruitment workflows should migrate to a separate application collection with a unique project/user index.
- Discovery ranks batches of the latest 50 candidates/opportunities; it is not a global ranking. Availability expires in 30 days.
- Conversation listing currently resolves up to 100 joined projects. Workspace returns the latest 50 milestones and 30 check-ins/trials, with progress computed over all milestones. Extend these views with full cursor navigation before exceeding those supported limits.
- Read receipts indicate client acknowledgement while the page is visible, not proof a human read the text.

## Release checklist

1. Run backend tests with REDIS_TEST_URL set to an isolated Redis service, frontend lint/build and Playwright tests.
2. Verify HTTPS, actual browser cookie behavior, proxy upgrades, graceful shutdown, backups and database credentials in staging.
3. Run representative load tests and record dataset, concurrency, hardware, p95 and error rate. No production capacity claim is implied by passing functional tests.
4. Protect main, require passing CI, configure dependency/secret scanning and alerts in GitHub settings.
5. Deploy both compatible repositories together. Docker build and hosted CI must pass; local source checks alone do not verify the hosting environment.
