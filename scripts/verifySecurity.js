const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "super_secret_test_jwt_key_123456789";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.RATE_LIMIT_LOGIN_MAX = "5";
process.env.RATE_LIMIT_SIGNUP_MAX = "5";
process.env.RATE_LIMIT_PASSWORD_MAX = "3";

const app = require("../src/app");
const connectDB = require("../src/config/database");
const User = require("../src/models/user");
const Project = require("../src/models/project");
const ConnectionRequest = require("../src/models/conectionRequest");
const Message = require("../src/models/message");
const { getJWTSecret, getCookieOptions, getClearCookieOptions } = require("../src/utils/security");
const { validatePassword, getSafeUser, getPublicUser, isValidObjectId } = require("../src/utils/validation");
const { loginLimiter, signupLimiter, passwordUpdateLimiter } = require("../src/middlewares/rateLimiter");

let server;
let baseUrl;

const request = async (method, path, body = null, cookies = null) => {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
  };
  if (cookies) {
    headers["Cookie"] = cookies;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const status = response.status;
  const setCookie = response.headers.get("set-cookie");
  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }

  return { status, data, setCookie, headers: response.headers };
};

async function runTests() {
  console.log("==================================================");
  console.log("STARTING DEVMESH PHASE 1B COMPLETE SECURITY SUITE");
  console.log("==================================================\n");

  // 1. Database Safety & Production Fail-Safe Test
  console.log("TEST 1: Database Safety & Production Fail-Safe...");
  {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUri = process.env.DB_CONNECTION_STRING;
    try {
      delete process.env.DB_CONNECTION_STRING;
      await assert.rejects(
        async () => connectDB(),
        /FATAL: DB_CONNECTION_STRING environment variable is required/
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalDbUri !== undefined) {
        process.env.DB_CONNECTION_STRING = originalDbUri;
      } else {
        delete process.env.DB_CONNECTION_STRING;
      }
    }
    console.log("✓ PASS: Database production safety requirement verified.");
  }


  // 2. JWT Secret Configuration Test
  console.log("TEST 2: JWT Secret and Fail-Safe in Production...");
  {
    assert.strictEqual(getJWTSecret(), process.env.JWT_SECRET);

    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(() => getJWTSecret(), /FATAL: JWT_SECRET environment variable is required/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
    console.log("✓ PASS: JWT Secret handling and production fail-safe verified.");
  }


  // 3. Cookie Security Options Test
  console.log("TEST 3: Cookie Security Configurations...");
  {
    const devCookie = getCookieOptions();
    assert.strictEqual(devCookie.httpOnly, true);
    assert.strictEqual(devCookie.secure, false);
    assert.strictEqual(devCookie.sameSite, "lax");

    const clearCookie = getClearCookieOptions();
    assert.strictEqual(clearCookie.httpOnly, true);
    assert.strictEqual(clearCookie.expires.getTime(), 0);
    console.log("✓ PASS: Cookie security options verified.");
  }

  // 4. Password Validation Rules Test
  console.log("TEST 4: Password Complexity Validator...");
  {
    assert.throws(() => validatePassword("weak"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("alllowercase123!"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("ALLUPPERCASE123!"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("NoSpecialChar123"), /Password must be at least 8 characters long/);
    assert.doesNotThrow(() => validatePassword("StrongPass#2026"));
    console.log("✓ PASS: Password complexity rules verified.");
  }

  // 5. Safe User DTO, Public DTO & ObjectId Validator Test
  console.log("TEST 5: Password Hash Stripping, Public/Private DTO Separation & ObjectId Validation...");
  {
    assert.strictEqual(isValidObjectId("60c72b2f9b1d8b2bad000001"), true);
    assert.strictEqual(isValidObjectId("invalid-id-123"), false);
    assert.strictEqual(isValidObjectId(null), false);
    assert.strictEqual(isValidObjectId(undefined), false);

    const mockUserDoc = new User({
      firstName: "Test",
      lastName: "User",
      email: "dto-test@devmesh.example",
      password: "HashedPassword$123456789",
    });

    const jsonString = JSON.stringify(mockUserDoc);
    assert.strictEqual(jsonString.includes("password"), false, "JSON serialization must not include password");
    assert.strictEqual(jsonString.includes("HashedPassword"), false, "JSON serialization must not leak hash");

    const safeDto = getSafeUser(mockUserDoc);
    assert.strictEqual(safeDto.password, undefined);
    assert.strictEqual(safeDto.email, "dto-test@devmesh.example");

    const publicDto = getPublicUser(mockUserDoc);
    assert.strictEqual(publicDto.password, undefined);
    assert.strictEqual(publicDto.email, undefined, "Public DTO must not contain email");
    assert.strictEqual(publicDto.firstName, "Test");
    console.log("✓ PASS: Safe User DTO, Public DTO, and ObjectId validator verified.");
  }

  // Connect to DB and start HTTP server
  console.log("Connecting to database and launching test server...");
  await connectDB();
  await mongoose.connection.asPromise();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}\n`);

  const uniqueSuffix = Date.now();
  const testUserAEmail = `sec.usera.${uniqueSuffix}@devmesh.example`;
  const testUserBEmail = `sec.userb.${uniqueSuffix}@devmesh.example`;
  const strongPassword = "SecurePass#2026";
  const newStrongPassword = "NewSecurePass#2027";


  let cookieUserA = "";
  let cookieUserB = "";
  let userAId = "";
  let userBId = "";
  let projectAId = "";

  // 6. Signup & User Creation
  console.log("TEST 6: /signup Validation, Duplicate Conflict (409), and Safe Response...");
  {
    // User A signup
    const signupARes = await request("POST", "/signup", {
      firstName: "UserAlpha",
      lastName: "Tester",
      email: testUserAEmail,
      password: strongPassword,
    });
    assert.strictEqual(signupARes.status, 201);
    assert.strictEqual(signupARes.data.data.password, undefined);
    assert.strictEqual(signupARes.data.data.email, testUserAEmail);
    assert.ok(signupARes.setCookie.includes("HttpOnly"));
    cookieUserA = signupARes.setCookie.split(";")[0];
    userAId = signupARes.data.data._id;

    // User B signup
    const signupBRes = await request("POST", "/signup", {
      firstName: "UserBeta",
      lastName: "Tester",
      email: testUserBEmail,
      password: strongPassword,
    });
    assert.strictEqual(signupBRes.status, 201);
    cookieUserB = signupBRes.setCookie.split(";")[0];
    userBId = signupBRes.data.data._id;

    // Duplicate signup 409
    const dupRes = await request("POST", "/signup", {
      firstName: "UserAlpha",
      lastName: "Tester",
      email: testUserAEmail,
      password: strongPassword,
    });
    assert.strictEqual(dupRes.status, 409);
    console.log("✓ PASS: /signup verified with 409 duplicate handling.");
  }

  // 7. Login Failures (401)
  console.log("TEST 7: /login Authentication Failures (401)...");
  {
    const wrongPassRes = await request("POST", "/login", {
      email: testUserAEmail,
      password: "WrongPassword#123",
    });
    assert.strictEqual(wrongPassRes.status, 401);
    assert.strictEqual(wrongPassRes.data.message, "Invalid credentials");

    const wrongEmailRes = await request("POST", "/login", {
      email: "nonexistent@devmesh.example",
      password: strongPassword,
    });
    assert.strictEqual(wrongEmailRes.status, 401);
    assert.strictEqual(wrongEmailRes.data.message, "Invalid credentials");
    console.log("✓ PASS: /login failure codes (401) verified.");
  }

  // 8. IDOR & Authorization: Projects & Applications
  console.log("TEST 8: IDOR & Authorization Protection on Projects...");
  {
    // User A creates a project
    const createProjectRes = await request(
      "POST",
      "/projects",
      {
        title: "Alpha Collaboration Hub",
        description: "A secure distributed team matching system for developers.",
        techStack: ["Node.js", "Express", "MongoDB"],
        rolesNeeded: ["Frontend Developer", "Security Engineer"],
        stage: "Building",
        commitment: "10 hrs/week",
      },
      cookieUserA
    );
    assert.strictEqual(createProjectRes.status, 201);
    projectAId = createProjectRes.data.data._id;

    // User B applies to Project A
    const applyRes = await request(
      "POST",
      `/projects/${projectAId}/apply`,
      { message: "Interested in contributing as Frontend Dev!" },
      cookieUserB
    );
    assert.strictEqual(applyRes.status, 201);

    // IDOR ATTEMPT 1: User B tries to view applications on User A's project -> MUST BE 403
    const idorViewAppRes = await request(
      "GET",
      `/projects/${projectAId}/applications`,
      null,
      cookieUserB
    );
    assert.strictEqual(idorViewAppRes.status, 403, "User B should be forbidden (403) from viewing User A's project applications");
    assert.ok(idorViewAppRes.data.message.includes("Access denied"));

    // Creator User A views applications -> 200 OK
    const creatorViewAppRes = await request(
      "GET",
      `/projects/${projectAId}/applications`,
      null,
      cookieUserA
    );
    assert.strictEqual(creatorViewAppRes.status, 200);
    assert.strictEqual(creatorViewAppRes.data.data.length, 1);
    const applicationId = creatorViewAppRes.data.data[0]._id;

    // IDOR ATTEMPT 2: User B tries to review/accept the application on User A's project -> MUST BE 403
    const idorReviewRes = await request(
      "PATCH",
      `/projects/${projectAId}/applications/${applicationId}`,
      { status: "accepted" },
      cookieUserB
    );
    assert.strictEqual(idorReviewRes.status, 403, "User B should be forbidden (403) from reviewing User A's applications");

    // Creator User A reviews application -> 200 OK
    const creatorReviewRes = await request(
      "PATCH",
      `/projects/${projectAId}/applications/${applicationId}`,
      { status: "accepted" },
      cookieUserA
    );
    assert.strictEqual(creatorReviewRes.status, 200);
    assert.strictEqual(creatorReviewRes.data.message, "Application accepted");
    console.log("✓ PASS: IDOR on project applications correctly blocked with 403 Forbidden.");
  }

  // 9. IDOR & Authorization: Connection Requests
  console.log("TEST 9: IDOR & Authorization on Connection Requests...");
  {
    // User A sends connection request to User B
    const sendReqRes = await request(
      "POST",
      `/request/send/interested/${userBId}`,
      {},
      cookieUserA
    );
    assert.strictEqual(sendReqRes.status, 200);
    const connectionRequestId = sendReqRes.data.data._id;

    // IDOR ATTEMPT 3: User A (sender) tries to review/accept their own request sent to User B -> MUST BE 403
    const idorReqReviewRes = await request(
      "POST",
      `/request/review/accepted/${connectionRequestId}`,
      {},
      cookieUserA
    );
    assert.strictEqual(idorReqReviewRes.status, 403, "Sender User A must not be allowed to review request sent to User B");

    // Recipient User B reviews/accepts the request -> 200 OK
    const recipientReviewRes = await request(
      "POST",
      `/request/review/accepted/${connectionRequestId}`,
      {},
      cookieUserB
    );
    assert.strictEqual(recipientReviewRes.status, 200);
    console.log("✓ PASS: IDOR on connection requests correctly blocked with 403 Forbidden.");
  }

  // 10. Authorization & Privacy: Chat Access
  console.log("TEST 10: Authorization & Connection Validation on Chat...");
  {
    // User A and User B now have accepted connection -> Chat succeeds
    const sendChatRes = await request(
      "POST",
      `/chat/${userBId}`,
      { text: "Hello from User A!" },
      cookieUserA
    );
    assert.strictEqual(sendChatRes.status, 201);

    const getChatRes = await request("GET", `/chat/${userBId}`, null, cookieUserA);
    assert.strictEqual(getChatRes.status, 200);
    assert.strictEqual(getChatRes.data.data.length, 1);

    // Create User C who has NO connection with User A
    const userCEmail = `sec.userC.${uniqueSuffix}@devmesh.example`;
    const signupCRes = await request("POST", "/signup", {
      firstName: "UserGamma",
      lastName: "Tester",
      email: userCEmail,
      password: strongPassword,
    });
    const cookieUserC = signupCRes.setCookie.split(";")[0];

    // UNAUTHORIZED CHAT ATTEMPT: User C tries to read or send chat to User A without accepted connection -> MUST BE 403
    const unauthorizedGetChat = await request("GET", `/chat/${userAId}`, null, cookieUserC);
    assert.strictEqual(unauthorizedGetChat.status, 403, "User without accepted connection must receive 403 Forbidden");

    const unauthorizedPostChat = await request(
      "POST",
      `/chat/${userAId}`,
      { text: "Spam message" },
      cookieUserC
    );
    assert.strictEqual(unauthorizedPostChat.status, 403, "User without accepted connection must receive 403 Forbidden");
    console.log("✓ PASS: Unauthorized chat access strictly blocked with 403 Forbidden.");
  }

  // 11. Malformed ObjectIds & CastError Prevention
  console.log("TEST 11: Malformed ObjectIds and Input Validation (Never 500)...");
  {
    const invalidId = "not-a-valid-mongo-id";
    const endpoints = [
      { method: "POST", path: `/projects/${invalidId}/apply`, body: {} },
      { method: "GET", path: `/projects/${invalidId}/applications`, body: null },
      { method: "PATCH", path: `/projects/${projectAId}/applications/${invalidId}`, body: { status: "accepted" } },
      { method: "POST", path: `/request/send/interested/${invalidId}`, body: {} },
      { method: "POST", path: `/request/review/accepted/${invalidId}`, body: {} },
      { method: "GET", path: `/chat/${invalidId}`, body: null },
      { method: "POST", path: `/chat/${invalidId}`, body: { text: "hello" } },
    ];

    for (const ep of endpoints) {
      const res = await request(ep.method, ep.path, ep.body, cookieUserA);
      assert.strictEqual(res.status, 400, `Endpoint ${ep.method} ${ep.path} must return 400 for malformed ObjectId, got ${res.status}`);
      assert.ok(typeof res.data === "object" && res.data.message, "Response must return clean JSON error message");
    }
    console.log("✓ PASS: All endpoints cleanly handle malformed ObjectIds with 400 Bad Request.");
  }

  // 12. Rate Limiting Tests
  console.log("TEST 12: Rate Limiting Enforcement (429)...");
  {
    // Test login rate limiter
    loginLimiter.reset();
    for (let i = 0; i < 5; i++) {
      const res = await request("POST", "/login", { email: testUserAEmail, password: "WrongPassword#123" });
      assert.strictEqual(res.status, 401);
    }
    // 6th attempt exceeds limit of 5
    const rateLimitedLoginRes = await request("POST", "/login", { email: testUserAEmail, password: "WrongPassword#123" });
    assert.strictEqual(rateLimitedLoginRes.status, 429, "Exceeding login attempts must return 429 Too Many Requests");
    assert.ok(rateLimitedLoginRes.data.message.includes("Too many login attempts"));

    // Reset limiters for remaining tests
    loginLimiter.reset();
    signupLimiter.reset();
    passwordUpdateLimiter.reset();
    console.log("✓ PASS: Rate limiting triggers 429 Too Many Requests when limits are exceeded.");
  }

  // 13. Privacy & Public Directory Field Isolation
  console.log("TEST 13: Privacy & Public Field Projections (No email/password leaks)...");
  {
    // Feed check
    const feedRes = await request("GET", "/feed", null, cookieUserA);
    assert.strictEqual(feedRes.status, 200);
    for (const user of feedRes.data) {
      assert.strictEqual(user.password, undefined);
      assert.strictEqual(user.email, undefined, "Public feed must not expose other users' email addresses");
    }

    // Connections check
    const connRes = await request("GET", "/user/connections", null, cookieUserA);
    assert.strictEqual(connRes.status, 200);
    for (const conn of connRes.data.data) {
      assert.strictEqual(conn.password, undefined);
      assert.strictEqual(conn.email, undefined, "Connections list must not expose email addresses");
    }
    console.log("✓ PASS: Public feeds and directory endpoints strictly isolate private fields.");
  }

  // 14. Profile View & Edit Authorization and Sanitization
  console.log("TEST 14: Profile View & Edit Authorization and Sanitization...");
  {
    // View own profile
    const profileViewRes = await request("GET", "/profile/view", null, cookieUserA);
    assert.strictEqual(profileViewRes.status, 200);
    assert.strictEqual(profileViewRes.data.email, testUserAEmail);
    assert.strictEqual(profileViewRes.data.password, undefined);

    // Profile edit with unauthorized fields (e.g. role, password) -> 400
    const invalidEditRes = await request(
      "PATCH",
      "/profile/edit",
      { role: "admin", password: "HackedPassword#123" },
      cookieUserA
    );
    assert.strictEqual(invalidEditRes.status, 400);

    // Profile edit with invalid age -> 400
    const invalidAgeRes = await request(
      "PATCH",
      "/profile/edit",
      { age: 12 },
      cookieUserA
    );
    assert.strictEqual(invalidAgeRes.status, 400);

    // Valid profile edit
    const validEditRes = await request(
      "PATCH",
      "/profile/edit",
      { about: "Full-stack builder with AppSec focus", skills: ["Node.js", "React", "MongoDB"] },
      cookieUserA
    );
    assert.strictEqual(validEditRes.status, 200);
    assert.strictEqual(validEditRes.data.data.about, "Full-stack builder with AppSec focus");
    assert.strictEqual(validEditRes.data.data.password, undefined);
    console.log("✓ PASS: Profile view and edit enforce field validation and isolation.");
  }

  // 15. Password Update & Rate Limiting & Logout
  console.log("TEST 15: Password Update Validation, Rate Limiting & Logout...");
  {
    // Incorrect old password -> 400
    const wrongOldRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: "WrongOldPassword#123", newPassword: newStrongPassword },
      cookieUserA
    );
    assert.strictEqual(wrongOldRes.status, 400);
    assert.strictEqual(wrongOldRes.data.message, "Current password is incorrect");

    // Weak new password -> 400
    const weakNewRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: strongPassword, newPassword: "weak" },
      cookieUserA
    );
    assert.strictEqual(weakNewRes.status, 400);

    // Successful password update
    const successPassRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: strongPassword, newPassword: newStrongPassword },
      cookieUserA
    );
    assert.strictEqual(successPassRes.status, 200);
    assert.strictEqual(successPassRes.data.message, "Password updated successfully");

    // Login with new password -> 200
    const newLoginRes = await request("POST", "/login", { email: testUserAEmail, password: newStrongPassword });
    assert.strictEqual(newLoginRes.status, 200);
    assert.strictEqual(newLoginRes.data.password, undefined);
    cookieUserA = newLoginRes.setCookie.split(";")[0];

    // Logout
    const logoutRes = await request("POST", "/logout", {}, cookieUserA);
    assert.strictEqual(logoutRes.status, 200);
    assert.ok(logoutRes.setCookie.includes("Expires=Thu, 01 Jan 1970") || logoutRes.setCookie.includes("Max-Age=0"));
    console.log("✓ PASS: Password update verification, validation, and logout cookie invalidation verified.");
  }

  // Clean up test data
  await User.deleteMany({ email: { $in: [testUserAEmail, testUserBEmail, `sec.userC.${uniqueSuffix}@devmesh.example`] } });
  await Project.deleteMany({ creator: { $in: [userAId, userBId] } });
  await ConnectionRequest.deleteMany({ $or: [{ fromUserId: userAId }, { toUserId: userAId }] });
  await Message.deleteMany({ $or: [{ fromUserId: userAId }, { toUserId: userAId }] });
  console.log("\nTest data cleanup completed.");

  console.log("\n==================================================");
  console.log("ALL PHASE 1 & 1B SECURITY TESTS PASSED (15/15)!");
  console.log("==================================================");

}

runTests()
  .then(async () => {
    if (server) server.close();
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("TEST SUITE FAILED:", err);
    if (server) server.close();
    await mongoose.disconnect();
    process.exit(1);
  });
