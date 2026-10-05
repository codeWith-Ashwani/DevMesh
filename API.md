# Collaboration and chat contracts

All routes require the signed `token` cookie. Browser writes must use CLIENT_URL as Origin. Responses use `{data}` or `{message}`. Lists with cursors also return `hasMore` and `before` (oldest ID). Send those IDs without modifying them.

## Conversations

- GET /conversations?before=ID: newest conversations, 30 at a time, with members, unreadCount and lastMessage.
- GET /conversations/:id: authorized metadata and public member names.
- POST /conversations/direct `{userId}`: open a unique personal conversation with an accepted connection.
- POST /conversations/group `{name,members:[userId]}`: form a group with 1-49 accepted connections.
- POST /conversations/project/:projectId: open a channel for the current project team.
- POST /conversations/trial/:trialId: open chat after a trial invitation is accepted.
- PATCH /conversations/:id/members `{action:'add'|'remove',userId}`: owner manages custom groups; a member may remove themselves. Owner cannot leave.
- GET /conversations/:id/messages?before=ID&limit=30: older history in chronological order. `after=ID` replays new messages instead; do not combine before and after. Limit 1-100.
- GET /conversations/:id/receipts: persisted member read watermarks.

## Socket.IO events

Connect with credentials and WebSocket transport. Cookie identity is server-derived; never send sender/user identity for writes. Every client event below requires an acknowledgement callback. Successful acknowledgements are `{ok:true,data?}`; failures are `{ok:false,status,message}`.

- message:send `{conversationId,clientId,text}`; text 1-2000 chars, clientId 1-100 chars from A-Z/a-z/0-9/colon/underscore/hyphen. UUIDs are recommended. Server broadcasts message:new with persisted message.
- conversation:typing `{conversationId}`; server broadcasts the conversation and authenticated user ID.
- conversation:read `{conversationId,messageId}`; server verifies the message belongs to the conversation, stores a monotonic watermark and broadcasts it.

## Collaboration

- GET/PUT /collaboration/profile: `{hoursPerWeek:1..40,durationWeeks:1..52,goal,roles:[string]}`. PUT renews availability for 30 days. Goals: Learn together; Ship a portfolio project; Contribute to open source; Launch a product.
- GET /collaboration/recommendations?before=ID: explained project matches.
- GET /projects/:id/collaborators?before=ID: explained available developer matches; owner only.
- POST /projects: existing fields plus firstDeliverable, durationWeeks, goal and roleOpenings `[{title,seats:1..10}]`, matching rolesNeeded in order.
- POST /projects/:id/apply `{role,message}`: atomic, one application per user; capped at 200 applications.
- PATCH /projects/:id/applications/:applicationId `{status:'accepted'|'rejected'}`: owner; pending-only transition, optimistic concurrency and capacity check.
- DELETE /projects/:id/application: withdraw pending application.
- DELETE /projects/:id/team/:userId: owner removes a member, or a member leaves; frees the role seat.
- GET /projects/:id/workspace: team, latest milestones/check-ins/trials and true completion progress. Team only; applicant trials are accessed separately.
- POST /projects/:id/milestones `{title,definitionOfDone,assignee,dueAt}`: owner, team assignee.
- PATCH /projects/:id/milestones/:id `{status,evidenceUrl}`: owner or assignee. planned → building → completed; building may return to planned. Completion needs an HTTP(S) evidence link.
- POST /projects/:id/check-ins `{completed,blockers,next}`: current team members.
- POST /projects/:id/trials `{participant,deliverable,dueAt}`: owner invites a pending applicant, deadline within 14 days.
- GET /collaboration/trials?before=ID: invitations and trials involving the user.
- PATCH /collaboration/trials/:id: participant accepts/declines with status; active participants record `{decision:'continue'|'stop',evidenceUrl?}` once. Both decisions close the trial. Continuing does not automatically accept the project application.
- PATCH /projects/:id/showcase `{demoUrl,outcome}`: owner publishes a launched outcome.
- GET /collaboration/showcase?before=ID: latest published outcomes.

Matching: skill overlap 50 points, sufficient weekly availability 20, compatible duration 10, matching role 10 and shared goal 10. These are preference-fit scores, not verified ability scores.
