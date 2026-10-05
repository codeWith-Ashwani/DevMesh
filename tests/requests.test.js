const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Connection Requests & Network Mesh", () => {
  const trackedEmails = [];
  let userA, userB, userC;

  before(async () => {
    await startTestServer();
    userA = await createTestUser({ firstName: "UserReqA" });
    userB = await createTestUser({ firstName: "UserReqB" });
    userC = await createTestUser({ firstName: "UserReqC" });
    trackedEmails.push(userA.email, userB.email, userC.email);
  });

  after(async () => {
    await cleanupTestData(trackedEmails);
    await stopTestServer();
  });

  it("returns successful empty collections for a developer with no network yet", async () => {
    for (const path of ['/user/connections', '/user/requests/received']) {
      const response = await request('GET', path, null, userC.cookie);
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(response.data.data, []);
    }
  });

  it("requires authentication even when network collections are empty", async () => {
    for (const path of ['/user/connections', '/user/requests/received']) {
      const response = await request('GET', path);
      assert.strictEqual(response.status, 401);
    }
  });

  it("should allow a user to send a connection request to another user", async () => {
    const res = await request("POST", `/request/send/interested/${userB._id}`, {}, userA.cookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.message, "Connection request sent successfully");
    assert.strictEqual(res.data.data.status, "interested");
    assert.strictEqual(res.data.data.fromUserId, userA._id);
    assert.strictEqual(res.data.data.toUserId, userB._id);
  });

  it("should reject self-connection request with 400 Bad Request", async () => {
    const res = await request("POST", `/request/send/interested/${userA._id}`, {}, userA.cookie);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.message, "Cannot send connection request to yourself");
  });

  it("should reject duplicate connection requests in either direction with 400", async () => {
    // Attempt A -> B again
    const res1 = await request("POST", `/request/send/interested/${userB._id}`, {}, userA.cookie);
    assert.strictEqual(res1.status, 400);
    assert.strictEqual(res1.data.message, "Connection request already exists");

    // Attempt B -> A reverse duplicate
    const res2 = await request("POST", `/request/send/interested/${userA._id}`, {}, userB.cookie);
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.data.message, "Connection request already exists");
  });

  it("should reject unauthorized review attempts by the sender or third party with 403 Forbidden", async () => {
    // Get the request ID
    const receivedRes = await request("GET", "/user/requests/received", null, userB.cookie);
    assert.strictEqual(receivedRes.status, 200);
    const requestId = receivedRes.data.data[0]._id;

    // Sender User A attempts to review request -> 403
    const senderReview = await request("POST", `/request/review/accepted/${requestId}`, {}, userA.cookie);
    assert.strictEqual(senderReview.status, 403);
    assert.ok(senderReview.data.message.includes("Access denied"));

    // Third party User C attempts to review request -> 403
    const thirdPartyReview = await request("POST", `/request/review/accepted/${requestId}`, {}, userC.cookie);
    assert.strictEqual(thirdPartyReview.status, 403);
  });

  it("should allow recipient user to accept a connection request", async () => {
    const receivedRes = await request("GET", "/user/requests/received", null, userB.cookie);
    assert.strictEqual(receivedRes.status, 200);
    const requestId = receivedRes.data.data[0]._id;

    const acceptRes = await request("POST", `/request/review/accepted/${requestId}`, {}, userB.cookie);
    assert.strictEqual(acceptRes.status, 200);
    assert.strictEqual(acceptRes.data.message, "Connection request reviewed successfully");
    assert.strictEqual(acceptRes.data.data.status, "accepted");

    // Check connections list
    const connRes = await request("GET", "/user/connections", null, userB.cookie);
    assert.strictEqual(connRes.status, 200);
    assert.ok(connRes.data.data.some((u) => u._id === userA._id));
  });

  it("should allow recipient to reject a connection request", async () => {
    // Send C -> B request
    const sendRes = await request("POST", `/request/send/interested/${userB._id}`, {}, userC.cookie);
    assert.strictEqual(sendRes.status, 200);
    const requestId = sendRes.data.data._id;

    const rejectRes = await request("POST", `/request/review/rejected/${requestId}`, {}, userB.cookie);
    assert.strictEqual(rejectRes.status, 200);
    assert.strictEqual(rejectRes.data.data.status, "rejected");
  });
});
