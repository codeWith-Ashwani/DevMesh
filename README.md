# DevMesh — find your team and ship together

DevMesh helps developers find compatible collaborators, try a small milestone, form a project team and document shipped work. GitHub remains the home for code, pull requests and issues.

## Implemented workflows

- Developer profiles and connection requests.
- Role-specific project applications, seat limits and owner-only reviews.
- Availability that expires after 30 days; explainable matching by skills, time, duration, roles and goals.
- Voluntary collaboration trials with invitations, short deadlines and mutual continuation decisions.
- Team workspaces with assigned milestones, completion evidence, check-ins and project showcases.
- Socket.IO personal, custom-group, project-team and trial conversations; durable history, read watermarks, typing and retry deduplication.
- Optional Redis cross-instance broadcasts and shared authentication/message limits.

## Stack and architecture

React/Vite client → Express HTTP + Socket.IO API → MongoDB. Redis distributes live events; MongoDB stores durable messages. Cookie authentication and per-event membership checks protect conversations. See [API contracts](API.md), [deployment runbook](DEPLOYMENT.md), and [implementation plan](IMPLEMENTATION_PLAN.md).

## Local setup

Use Node 22+. Run `npm ci`. Copy `.env.example` to `.env`, set JWT_SECRET and DB_CONNECTION_STRING, and leave CLIENT_URL at http://localhost:5173 for local development. REDIS_URL is optional for one server.

Run `npm start`. Alternatively, set JWT_SECRET and run `docker compose up --build` for the local API/MongoDB/Redis stack. The compose stack is for development and exposes only the API on localhost. Start the [frontend](https://github.com/codeWith-Ashwani/DevMesh-Web) separately.

## Verification

`npm test` runs isolated MongoDB tests; it never uses your configured live database. The first run downloads MongoDB 7.0.24 into an ignored dependency cache. Set REDIS_TEST_URL to an isolated Redis service to include cross-instance tests. `npm run test:security` runs the security-focused subset against an isolated database.

Browser tests live in the frontend repository and launch `scripts/startBrowserTestServer.js`, an ephemeral fixture using fake accounts. CI runs functional tests, dependency audit and a Docker build.

`npm run benchmark` seeds 5,000 chat messages in an isolated database and measures 200 history-page requests at concurrency 10. Results are recorded in BENCHMARK_RESULTS.json with the environment and error count. This local microbenchmark is reproducible evidence, not a production capacity claim.

## Interview walkthrough

1. Publish a project with a first deliverable, roles, seats and commitment.
2. Set a collaborator's availability and explain the matching reasons.
3. Apply to a role; invite the applicant to a short trial and communicate in trial chat.
4. Record both trial decisions, then accept the application to form the team.
5. Open team group chat, assign a milestone, post a check-in and link contribution evidence.
6. Publish the shipped demo and outcome.

## Practical limits

Scores are preference fit, not verified ability. Applications are embedded and capped at 200/project. Discovery ranks batches, not the entire database. Live delivery is best-effort with durable replay. See the runbook for compatibility, view limits, cookie/proxy requirements and release checks. Production readiness requires verifying the actual hosting environment and representative load; this repository does not claim measured production capacity.
