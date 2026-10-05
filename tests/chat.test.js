const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Peer Chat & Real-Time Messaging", () => {
  const trackedEmails = [];
  let userA, userB, userC;

  before(async () => {
    await startTestServer();
    userA = await createTestUser({ firstName: "ChatUserA" });
    userB = await createTestUser({ firstName: "ChatUserB" });
    userC = await createTestUser({ firstName: "ChatUserC" });
    trackedEmails.push(userA.email, userB.email, userC.email);

    // Connect User A and User B
    const sendReq = await request("POST", `/request/send/interested/${userB._id}`, {}, userA.cookie);
    const requestId = sendReq.data.data._id;
    await request("POST", `/request/review/accepted/${requestId}`, {}, userB.cookie);
  });

  after(async () => {
    await cleanupTestData(trackedEmails);
    await stopTestServer();
  });

  it("should allow connected users to send and retrieve chat messages", async () => {
    const sendRes = await request(
      "POST",
      `/chat/${userB._id}`,
      { text: "Hey User B, ready to collaborate on the project?" },
      userA.cookie
    );

    assert.strictEqual(sendRes.status, 201);
    assert.strictEqual(sendRes.data.data.text, "Hey User B, ready to collaborate on the project?");
    assert.strictEqual(sendRes.data.data.fromUserId, userA._id);
    assert.strictEqual(sendRes.data.data.toUserId, userB._id);

    const getRes = await request("GET", `/chat/${userA._id}`, null, userB.cookie);
    assert.strictEqual(getRes.status, 200);
    assert.ok(Array.isArray(getRes.data.data));
    assert.ok(getRes.data.data.some((m) => m.text.includes("ready to collaborate")));
  });

  it("should reject chat attempts between unconnected users with 403 Forbidden", async () => {
    // User C (not connected to A) attempts to read chat
    const getRes = await request("GET", `/chat/${userA._id}`, null, userC.cookie);
    assert.strictEqual(getRes.status, 403);
    assert.ok(getRes.data.message.includes("accepted connections"));

    // User C attempts to send message to A
    const postRes = await request("POST", `/chat/${userA._id}`, { text: "Spam message" }, userC.cookie);
    assert.strictEqual(postRes.status, 403);
  });

  it("should reject invalid user ID format with 400 Bad Request", async () => {
    const res = await request("GET", "/chat/invalid-user-id", null, userA.cookie);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.message, "Invalid user ID format");
  });

  it("should support pagination on GET /chat/:userId and return chronological messages", async () => {
    // Send a second message
    await request(
      "POST",
      `/chat/${userB._id}`,
      { text: "Second message for pagination test" },
      userA.cookie
    );

    // Query with limit 1
    const p1Res = await request("GET", `/chat/${userB._id}?page=1&limit=1`, null, userA.cookie);
    assert.strictEqual(p1Res.status, 200);
    assert.ok(Array.isArray(p1Res.data.data));
    assert.strictEqual(p1Res.data.data.length, 1);
    assert.strictEqual(p1Res.data.data[0].text, "Second message for pagination test");
  });

  it("should reject empty or oversized messages with 400 Bad Request", async () => {

    // Empty message
    const res1 = await request("POST", `/chat/${userB._id}`, { text: "" }, userA.cookie);
    assert.strictEqual(res1.status, 400);
    assert.strictEqual(res1.data.message, "A message cannot be empty");

    // API and model use the same 2000-character limit.
    const longText = "a".repeat(2001);
    const res2 = await request("POST", `/chat/${userB._id}`, { text: longText }, userA.cookie);
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.data.message, "Message cannot exceed 2000 characters");
  });
});
