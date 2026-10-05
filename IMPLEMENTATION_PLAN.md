# DevMesh: from learning alone to shipping together

## Product scope

1. Available collaborators: explicit weekly availability and goals, renewed every 30 days; explainable skill and commitment matching.
2. Role-based projects: apply for a specific opening; atomic application submission and review; accepted applicants form the project team.
3. Collaboration trials: a scoped deliverable, deadline, participants, mutual continuation decisions; no automatic reputation score.
4. Team workspace: real milestones, check-ins, repository/demo links, completion evidence and team attribution. GitHub remains the code and issue tracker.
5. Messaging: cookie-authenticated Socket.IO, personal conversations for connected peers, groups formed from connections, project team channels, history pagination, retry-safe persisted sends, typing and read receipts.
6. Presentation: reproducible setup, deployment runbook, API contracts, CI, demo data and a walkthrough.

## Engineering requirements

- MongoDB is the source of truth. Redis supports cross-instance Socket.IO broadcasts and shared rate limits, not durable chat storage.
- Verify origin for browser writes and socket handshakes; derive identity from signed cookies; check membership on every event.
- Persist before broadcasting; unique client message IDs prevent duplicate retry writes. Reconnect clients fetch durable history.
- Bound lists and payloads, deterministic cursor order, query indexes, atomic transitions, stable public errors.
- Never use a live database for tests. Isolated ephemeral MongoDB, real socket clients, authorization and concurrent-request tests.
- Explicit environment validation, readiness checks, graceful shutdown, containers, CI and documented scaling constraints.

## Release gates

- Backend regression and new integration tests pass; frontend lint and production build pass.
- Personal/group/project channel authorization and reconnect behavior verified.
- Redis multi-instance delivery tested; deployment TLS, secrets, origin and proxy configuration verified.
- Browser walkthrough and representative load measurements recorded before claiming production readiness.

## Work tracking

Implementation status and remaining verification are recorded in the final delivery notes. This plan is the agreed target, not evidence that every gate has passed.
