const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  resetRateLimiters,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Authentication & Session Flows", () => {
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

  it("should successfully sign up a new user with secure cookie and safe DTO", async () => {
    const email = `auth.signup.${Date.now()}@devmesh.example`;
    trackedEmails.push(email);

    const res = await request("POST", "/signup", {
      firstName: "Grace",
      lastName: "Hopper",
      email,
      password: "StrongPassword#2026",
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.message, "User signed up successfully");
    assert.ok(res.data.data);
    assert.strictEqual(res.data.data.email, email.toLowerCase());
    assert.strictEqual(res.data.data.firstName, "Grace");
    assert.strictEqual(res.data.data.password, undefined, "Password hash must not be exposed");
    assert.ok(res.setCookie.includes("HttpOnly"), "Auth cookie must be HttpOnly");
  });

  it("should reject duplicate signup with 409 Conflict", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);

    const dupRes = await request("POST", "/signup", {
      firstName: "Duplicate",
      lastName: "User",
      email: user.email,
      password: "StrongPassword#2026",
    });

    assert.strictEqual(dupRes.status, 409);
    assert.ok(dupRes.data.message.includes("already registered"));
  });

  it("should reject invalid signup data with 400 Bad Request", async () => {
    // Missing first name
    const res1 = await request("POST", "/signup", {
      lastName: "Doe",
      email: "invalid1@devmesh.example",
      password: "StrongPassword#2026",
    });
    assert.strictEqual(res1.status, 400);

    // Invalid email
    const res2 = await request("POST", "/signup", {
      firstName: "John",
      email: "not-an-email",
      password: "StrongPassword#2026",
    });
    assert.strictEqual(res2.status, 400);

    // Weak password
    const res3 = await request("POST", "/signup", {
      firstName: "John",
      email: "weakpass@devmesh.example",
      password: "123",
    });
    assert.strictEqual(res3.status, 400);
  });

  it("should successfully log in an existing user and return safe user", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);

    const res = await request("POST", "/login", {
      email: user.email,
      password: user.password,
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.email, user.email);
    assert.strictEqual(res.data.password, undefined, "Password hash must not be in login response");
    assert.ok(res.setCookie.includes("HttpOnly"));
  });

  it("should reject invalid login credentials with 401 Unauthorized", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);

    // Wrong password
    const res1 = await request("POST", "/login", {
      email: user.email,
      password: "IncorrectPassword#123",
    });
    assert.strictEqual(res1.status, 401);
    assert.strictEqual(res1.data.message, "Invalid credentials");

    // Non-existent email
    const res2 = await request("POST", "/login", {
      email: "nonexistent@devmesh.example",
      password: "SomePassword#123",
    });
    assert.strictEqual(res2.status, 401);
    assert.strictEqual(res2.data.message, "Invalid credentials");
  });

  it("should successfully log out and invalidate cookie", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);

    const logoutRes = await request("POST", "/logout", {}, user.cookie);
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.data.message, "User logged out successfully");
    assert.ok(
      logoutRes.setCookie.includes("Expires=Thu, 01 Jan 1970") || logoutRes.setCookie.includes("Max-Age=0"),
      "Logout should clear cookie"
    );
  });

  it("should reject access to protected routes when JWT is missing, invalid, or expired", async () => {
    // Missing JWT
    const noTokenRes = await request("GET", "/profile/view");
    assert.strictEqual(noTokenRes.status, 401);

    // Invalid JWT
    const badTokenRes = await request("GET", "/profile/view", null, "token=malformed.fake.jwt");
    assert.strictEqual(badTokenRes.status, 401);

    // Expired JWT
    const expiredToken = jwt.sign({ _id: "60c72b2f9b1d8b2bad000001" }, process.env.JWT_SECRET, { expiresIn: -10 });
    const expiredRes = await request("GET", "/profile/view", null, `token=${expiredToken}`);
    assert.strictEqual(expiredRes.status, 401);
  });

  it("should change password with correct current password and enforce complexity", async () => {
    const user = await createTestUser();
    trackedEmails.push(user.email);
    const newPassword = "BrandNewPassword#2026";

    // Incorrect current password -> 400
    const failCurrentRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: "WrongCurrentPassword#123", newPassword },
      user.cookie
    );
    assert.strictEqual(failCurrentRes.status, 400);
    assert.strictEqual(failCurrentRes.data.message, "Current password is incorrect");

    // Weak new password -> 400
    const failWeakRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: user.password, newPassword: "weak" },
      user.cookie
    );
    assert.strictEqual(failWeakRes.status, 400);

    // Successful password update -> 200
    const successRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: user.password, newPassword },
      user.cookie
    );
    assert.strictEqual(successRes.status, 200);
    assert.strictEqual(successRes.data.message, "Password updated successfully");

    // Old password no longer works
    const oldLogin = await request("POST", "/login", { email: user.email, password: user.password });
    assert.strictEqual(oldLogin.status, 401);

    // New password works
    const newLogin = await request("POST", "/login", { email: user.email, password: newPassword });
    assert.strictEqual(newLogin.status, 200);
  });
});
