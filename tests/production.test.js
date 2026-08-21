const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");
const env = require("../src/config/env");
const {
  startTestServer,
  stopTestServer,
  request,
} = require("./helpers/testUtils");

describe("Production Readiness & Platform Hardening Suite", () => {
  let baseUrl;

  before(async () => {
    baseUrl = await startTestServer();
  });

  after(async () => {
    await stopTestServer();
  });

  it("GET /health should return 200 OK with minimal JSON liveness status", async () => {
    const res = await request("GET", "/health");
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data, { status: "ok" });
    assert.strictEqual(res.data.password, undefined);
    assert.strictEqual(res.data.secret, undefined);
  });

  it("GET /ready should return 200 OK when database is connected", async () => {
    const res = await request("GET", "/ready");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, "ready");
    assert.strictEqual(res.data.database, "connected");
  });

  it("should return standard JSON 404 for unknown routes", async () => {
    const res = await request("GET", "/api/non-existent-endpoint-12345");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.data.message, "Route not found");
  });

  it("should return standard JSON 400 for malformed JSON request bodies", async () => {
    const res = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "this is not valid json{",
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.message, "Invalid JSON payload in request");
  });

  it("should reject oversized JSON payloads (> 50kb) with standard JSON 413 error", async () => {
    const largeString = "a".repeat(55 * 1024); // 55kb string
    const res = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ largeField: largeString }),
    });

    assert.strictEqual(res.status, 413);
    const data = await res.json();
    assert.strictEqual(data.message, "Request payload exceeds size limit (50kb)");
  });

  it("should include standard security headers in HTTP responses", async () => {
    const res = await request("GET", "/health");
    assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
    assert.strictEqual(res.headers.get("x-frame-options"), "DENY");
    assert.strictEqual(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
    assert.strictEqual(res.headers.get("x-xss-protection"), "0");
  });

  it("should enforce environment variable production validation", () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    const originalDb = process.env.DB_CONNECTION_STRING;
    const originalClient = process.env.CLIENT_URL;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      delete process.env.DB_CONNECTION_STRING;
      delete process.env.CLIENT_URL;

      assert.throws(() => env.getJWTSecret(), /FATAL: JWT_SECRET environment variable is required/);
      assert.throws(() => env.getDBConnectionString(), /FATAL: DB_CONNECTION_STRING environment variable is required/);
      assert.throws(() => env.getClientURL(), /FATAL: CLIENT_URL environment variable must be explicitly configured in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
      if (originalDb !== undefined) process.env.DB_CONNECTION_STRING = originalDb;
      if (originalClient !== undefined) process.env.CLIENT_URL = originalClient;
    }
  });

});
