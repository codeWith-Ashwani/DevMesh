# Performance measurements and release checks

## Inbox benchmark

Run `npm run benchmark:inbox -- INBOX_BENCHMARK_AFTER.json` from the backend checkout. It starts an isolated MongoDB 7.0.24 instance and seeds fake accounts, 30 groups, 50 messages per group and read receipts. It warms up three requests, then measures 15 sequential authenticated HTTP requests. Every response must contain the correct latest message and 15 unread peer messages per room.

Measured on Windows with Node 22.19.0:

| Metric | Before | After |
| --- | ---: | ---: |
| Mongoose database operations per HTTP request | 153 | 5 |
| Median HTTP response | 99.83 ms | 26.36 ms |
| p95 HTTP response, 15 samples | 119.97 ms | 33.42 ms |

These are local, warm microbenchmark results, not production latency or a capacity estimate. The sample size is small. The operation counter counts Mongoose queries/aggregations, including authentication; lookup work happens inside MongoDB and is not counted as separate client queries. Mixed room types add bounded batch queries for accepted direct connections, trials and projects. Unread counting still scales with unread messages.

The old implementation queried access, members, receipts, unread counts and the last message for each room in sequence. The new implementation batches membership and member profiles, then computes summaries with indexed lookups. Conversation indexes now match the `_id` cursor sort. Authorization still uses current accepted connections, project applications, trial status and parent existence on every request; no access decisions are cached in Redis or the browser. Tests cover revocation, unread watermarks, empty rooms, pagination and private field exclusion.

Connection-request creation now checks recipient existence and duplicate requests concurrently, preserving validation order and response contracts.

## Frontend loading

Route-level lazy imports reduce the initial JavaScript from about 481.64 kB (148.97 kB gzip) to 343.78 kB (112.67 kB gzip) after the chat reliability release. The Socket.IO library downloads after authentication and is reused across workspace pages; the chat page and network graph download with their routes. Shared navigation remains visible during route chunk loading.

Dashboard and collaboration sections publish each response independently. Connections render when the people request completes, while project graph enrichment continues. Chat loads the active room independently, refreshes its inbox on socket connection/reconnection, and serializes replay using the last HTTP cursor so live events cannot skip missed history. One session socket persists across workspace navigation. Web fonts no longer block initial rendering. Browser tests hold the font and data requests open to verify useful content renders before they complete.

## Deployment and remaining latency

Push the backend first, then the frontend. Confirm Render has deployed the backend commit; Vercel deploying the frontend alone does not apply the inbox optimization. Backend startup initializes the declared indexes. Keep a single frontend/API release compatible while the two services roll out.

Public warm measurements before the release found the Vercel HTML responding in roughly 34–278 ms and simple Render endpoints responding in roughly 264–978 ms from the developer machine. A fresh-browser public login page loaded in roughly 434–670 ms. These measurements did not include a real user's authenticated production endpoints or an observed cold start.

If delays remain across routes, inspect browser Network timings and Render request logs for the same request ID. Separate DNS/TLS/network time, server waiting time, database work and response transfer. Check the API, MongoDB and Redis regions and hosting tier. Render Free services sleep after 15 minutes without inbound traffic and can take about a minute to wake; this only applies if the deployment actually uses Free hosting. See [Render Free service documentation](https://render.com/docs/free). Do not treat warm measurements as evidence of a cold start. Region and plan changes require deployment configuration and may incur cost.

Use `node scripts/measureLoading.mjs <public-login-url>` from the frontend checkout for read-only browser resource/navigation timings. It uses installed Edge on Windows or Playwright Chromium elsewhere and opens fresh browser contexts. Timing varies with the network; compare multiple runs and the same environment. Obtain authenticated traces from a consenting existing user rather than creating production test accounts.

The current owner reports Atlas in Mumbai and Render in another region; the exact Render region and tier are unverified. Render's [listed regions](https://render.com/docs/regions) include Singapore but not Mumbai. Singapore is the nearest listed choice geographically to Mumbai; measure the resulting database and end-user latency before treating it as the best deployment. For full colocation, plan a separate Atlas migration to the backend's region with data validation. Render requires creating a new service to change regions. Copy the existing environment configuration securely, verify readiness and authenticated HTTP/WebSocket workflows, then update the Vercel API origin and redeploy. Keep the old service available until the cutover succeeds. Redis private URLs only work within their Render region; migrate or reconfigure that dependency too if it is enabled. This code release does not move data, change paid plans or change the deployed API origin.
