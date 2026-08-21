const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const { getJWTSecret, getCookieOptions, getClearCookieOptions } = require("../src/utils/security");
const { validatePassword, getSafeUser, getPublicUser, isValidObjectId } = require("../src/utils/validation");
const connectDB = require("../src/config/database");
const User = require("../src/models/user");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  resetRateLimiters,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Security Regression & Protection Suite", () => {
  const trackedEmails = [];

  before(async () => {
    await startTestServer();
  });

  after(async () => {
    await cleanupTestData(trackedEmails);
    await stopTestServer();
  });

  beforeEach(() => {
    resetRateLimiters();
  });

  it("should enforce JWT_SECRET requirement and production fail-safe", () => {
    assert.strictEqual(getJWTSecret(), process.env.JWT_SECRET);

    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(() => getJWTSecret(), /FATAL: JWT_SECRET environment variable is required/);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.JWT_SECRET = origSecret;
    }
  });

  it("should enforce DB_CONNECTION_STRING in all runtime modes", async () => {
    const origEnv = process.env.NODE_ENV;
    const origDb = process.env.DB_CONNECTION_STRING;
    try {
      delete process.env.DB_CONNECTION_STRING;
      await assert.rejects(
        async () => connectDB(),
        /FATAL: DB_CONNECTION_STRING environment variable is required/
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origDb !== undefined) {
        process.env.DB_CONNECTION_STRING = origDb;
      } else {
        delete process.env.DB_CONNECTION_STRING;
      }
    }
  });


  it("should ensure Mongoose schemas and DTOs strip password hashes and __v", () => {
    const userDoc = new User({
      firstName: "SecUser",
      lastName: "Tester",
      email: "secuser@devmesh.example",
      password: "HashedValue$123456",
    });

    const serialized = JSON.stringify(userDoc);
    assert.strictEqual(serialized.includes("password"), false);
    assert.strictEqual(serialized.includes("HashedValue"), false);

    const safe = getSafeUser(userDoc);
    assert.strictEqual(safe.password, undefined);

    const pub = getPublicUser(userDoc);
    assert.strictEqual(pub.password, undefined);
    assert.strictEqual(pub.email, undefined);
  });

  it("should enforce Rate Limiting returning 429 Too Many Requests", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);

    // Exceed login attempts
    for (let i = 0; i < 10; i++) {
      await request("POST", "/login", { email: user.email, password: "WrongPassword#123" });
    }

    const limitedRes = await request("POST", "/login", { email: user.email, password: "WrongPassword#123" });
    assert.strictEqual(limitedRes.status, 429);
    assert.ok(limitedRes.data.message.includes("Too many login attempts"));
  });


  it("should safely handle malformed ObjectIds across all parameterized endpoints with 400", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);
    const badId = "malformed-id";

    const endpoints = [
      { method: "POST", path: `/projects/${badId}/apply`, body: {} },
      { method: "GET", path: `/projects/${badId}/applications`, body: null },
      { method: "PATCH", path: `/projects/60c72b2f9b1d8b2bad000001/applications/${badId}`, body: { status: "accepted" } },
      { method: "POST", path: `/request/send/interested/${badId}`, body: {} },
      { method: "POST", path: `/request/review/accepted/${badId}`, body: {} },
      { method: "GET", path: `/chat/${badId}`, body: null },
      { method: "POST", path: `/chat/${badId}`, body: { text: "hello" } },
      { method: "PATCH", path: `/projects/${badId}`, body: { title: "New Title" } },
      { method: "DELETE", path: `/projects/${badId}`, body: null },
    ];

    for (const ep of endpoints) {
      const res = await request(ep.method, ep.path, ep.body, user.cookie);
      assert.strictEqual(res.status, 400, `Endpoint ${ep.method} ${ep.path} expected 400, got ${res.status}`);
      assert.ok(typeof res.data === "object" && res.data.message);
    }
  });
});
