const assert = require("assert");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "super_secret_test_jwt_key_123456789";
process.env.CLIENT_URL = "http://localhost:5173";

const app = require("../src/app");
const connectDB = require("../src/config/database");
const User = require("../src/models/user");
const { getJWTSecret, getCookieOptions, getClearCookieOptions } = require("../src/utils/security");
const { validatePassword, getSafeUser } = require("../src/utils/validation");

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
  console.log("STARTING DEVMESH SECURITY & AUTH AUDIT TEST SUITE");
  console.log("==================================================\n");

  // 1. JWT Secret Configuration Test
  console.log("TEST 1: JWT Secret and Fail-Safe in Production...");
  {
    assert.strictEqual(getJWTSecret(), process.env.JWT_SECRET);

    // Test production fail-safe
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;
      assert.throws(() => getJWTSecret(), /FATAL: JWT_SECRET environment variable is not defined in production/);
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.JWT_SECRET = originalSecret;
    }
    console.log("✓ PASS: JWT Secret handling and production fail-safe verified.");
  }

  // 2. Cookie Security Options Test
  console.log("TEST 2: Cookie Security Configurations...");
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

  // 3. Password Validation Rules Test
  console.log("TEST 3: Password Complexity Validator...");
  {
    assert.throws(() => validatePassword("weak"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("alllowercase123!"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("ALLUPPERCASE123!"), /Password must be at least 8 characters long/);
    assert.throws(() => validatePassword("NoSpecialChar123"), /Password must be at least 8 characters long/);
    assert.doesNotThrow(() => validatePassword("StrongPass#2026"));
    console.log("✓ PASS: Password complexity rules verified.");
  }

  // 4. Safe User DTO & Schema Serialization Test
  console.log("TEST 4: Password Hash Striping & DTO Isolation...");
  {
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
    assert.strictEqual(safeDto.firstName, "Test");
    console.log("✓ PASS: Safe User DTO and schema transforms never expose password/hash.");
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
  const testEmail = `sec.test.${uniqueSuffix}@devmesh.example`;
  const strongPassword = "SecurePass#2026";
  const newStrongPassword = "NewSecurePass#2027";

  let authCookie = "";

  // 5. Signup Validation & Execution Test
  console.log("TEST 5: /signup Validation, Duplicate Conflict (409), and Safe Response...");
  {
    // Test weak password rejection (400)
    const weakRes = await request("POST", "/signup", {
      firstName: "Security",
      lastName: "Tester",
      email: testEmail,
      password: "123",
    });
    assert.strictEqual(weakRes.status, 400);

    // Test valid signup
    const signupRes = await request("POST", "/signup", {
      firstName: "Security",
      lastName: "Tester",
      email: testEmail,
      password: strongPassword,
    });
    assert.strictEqual(signupRes.status, 201);
    assert.strictEqual(signupRes.data.message, "User signed up successfully");
    assert.ok(signupRes.data.data, "Response must include data property");
    assert.strictEqual(signupRes.data.data.password, undefined, "Password must not be in signup response");
    assert.strictEqual(signupRes.data.data.email, testEmail);
    assert.ok(signupRes.setCookie, "Signup must return Set-Cookie");
    assert.ok(signupRes.setCookie.includes("HttpOnly"), "Cookie must be HttpOnly");

    authCookie = signupRes.setCookie.split(";")[0];

    // Test duplicate signup rejection (409)
    const dupRes = await request("POST", "/signup", {
      firstName: "Security",
      lastName: "Tester",
      email: testEmail,
      password: strongPassword,
    });
    assert.strictEqual(dupRes.status, 409, "Duplicate registration must return 409 Conflict");
    console.log("✓ PASS: /signup validation, 409 duplicate handling, and password protection verified.");
  }

  // 6. Login Validation & Authentication Failures (401)
  console.log("TEST 6: /login Authentication Failures (401) and Safe Output...");
  {
    // Test missing fields (400)
    const missingRes = await request("POST", "/login", { email: testEmail });
    assert.strictEqual(missingRes.status, 400);

    // Test wrong email (401)
    const wrongEmailRes = await request("POST", "/login", {
      email: `nonexistent.${uniqueSuffix}@devmesh.example`,
      password: strongPassword,
    });
    assert.strictEqual(wrongEmailRes.status, 401, "Invalid email must return 401");
    assert.strictEqual(wrongEmailRes.data.message, "Invalid credentials");

    // Test wrong password (401)
    const wrongPassRes = await request("POST", "/login", {
      email: testEmail,
      password: "WrongPassword#123",
    });
    assert.strictEqual(wrongPassRes.status, 401, "Invalid password must return 401");
    assert.strictEqual(wrongPassRes.data.message, "Invalid credentials");

    // Test valid login
    const validLoginRes = await request("POST", "/login", {
      email: testEmail,
      password: strongPassword,
    });
    assert.strictEqual(validLoginRes.status, 200);
    assert.strictEqual(validLoginRes.data.password, undefined, "Password must not be in login response");
    assert.strictEqual(validLoginRes.data.email, testEmail);
    assert.ok(validLoginRes.setCookie.includes("HttpOnly"), "Cookie must be HttpOnly");

    authCookie = validLoginRes.setCookie.split(";")[0];
    console.log("✓ PASS: /login failure codes (401) and safe responses verified.");
  }

  // 7. Protected Route Authorization (401 on missing/invalid token)
  console.log("TEST 7: Token Authorization & Protected Route Verification...");
  {
    // Missing token (401)
    const noTokenRes = await request("GET", "/profile/view");
    assert.strictEqual(noTokenRes.status, 401);

    // Tampered token (401)
    const fakeTokenRes = await request("GET", "/profile/view", null, "token=invalid.tampered.token");
    assert.strictEqual(fakeTokenRes.status, 401);

    // Expired token (401)
    const expiredToken = jwt.sign({ _id: "60c72b2f9b1d8b2bad000001" }, process.env.JWT_SECRET, { expiresIn: -10 });
    const expiredRes = await request("GET", "/profile/view", null, `token=${expiredToken}`);
    assert.strictEqual(expiredRes.status, 401);

    // Valid token
    const validRes = await request("GET", "/profile/view", null, authCookie);
    assert.strictEqual(validRes.status, 200);
    assert.strictEqual(validRes.data.email, testEmail);
    assert.strictEqual(validRes.data.password, undefined, "Profile view must not leak password");
    console.log("✓ PASS: Protected routes correctly enforce 401 on missing/invalid/expired tokens.");
  }

  // 8. Profile Edit Sanitization
  console.log("TEST 8: Profile Edit Sanitization & Response...");
  {
    // Disallowed field rejection (400)
    const invalidEditRes = await request(
      "PATCH",
      "/profile/edit",
      { role: "admin", password: "HackedPassword#123" },
      authCookie
    );
    assert.strictEqual(invalidEditRes.status, 400);

    // Valid edit
    const validEditRes = await request(
      "PATCH",
      "/profile/edit",
      { about: "Senior Security Specialist", skills: ["AppSec", "Node.js", "OWASP"] },
      authCookie
    );
    assert.strictEqual(validEditRes.status, 200);
    assert.strictEqual(validEditRes.data.data.about, "Senior Security Specialist");
    assert.strictEqual(validEditRes.data.data.password, undefined);
    console.log("✓ PASS: Profile edit prevents unauthorized fields and returns safe user DTO.");
  }

  // 9. Password Update Hardening
  console.log("TEST 9: Password Update Hardening & Validation...");
  {
    // Incorrect current password
    const wrongCurrentRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: "WrongOldPassword#123", newPassword: newStrongPassword },
      authCookie
    );
    assert.strictEqual(wrongCurrentRes.status, 400);
    assert.strictEqual(wrongCurrentRes.data.message, "Current password is incorrect");

    // Weak new password
    const weakNewRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: strongPassword, newPassword: "weak" },
      authCookie
    );
    assert.strictEqual(weakNewRes.status, 400);

    // Successful password update
    const successPassRes = await request(
      "POST",
      "/profile/forgot-password",
      { password: strongPassword, newPassword: newStrongPassword },
      authCookie
    );
    assert.strictEqual(successPassRes.status, 200);
    assert.strictEqual(successPassRes.data.message, "Password updated successfully");

    // Verify login with old password fails
    const oldLoginRes = await request("POST", "/login", { email: testEmail, password: strongPassword });
    assert.strictEqual(oldLoginRes.status, 401);

    // Verify login with new password succeeds
    const newLoginRes = await request("POST", "/login", { email: testEmail, password: newStrongPassword });
    assert.strictEqual(newLoginRes.status, 200);
    assert.strictEqual(newLoginRes.data.password, undefined);

    // Also test PATCH /profile/password alias
    authCookie = newLoginRes.setCookie.split(";")[0];
    const patchPassRes = await request(
      "PATCH",
      "/profile/password",
      { password: newStrongPassword, newPassword: strongPassword },
      authCookie
    );
    assert.strictEqual(patchPassRes.status, 200);
    console.log("✓ PASS: Password update verifies current password and enforces complexity.");
  }

  // 10. Logout and Cookie Invalidation
  console.log("TEST 10: Logout Cookie Clearance...");
  {
    const logoutRes = await request("POST", "/logout", {}, authCookie);
    assert.strictEqual(logoutRes.status, 200);
    assert.ok(logoutRes.setCookie, "Logout must return Set-Cookie");
    assert.ok(
      logoutRes.setCookie.includes("Expires=Thu, 01 Jan 1970") || logoutRes.setCookie.includes("Max-Age=0"),
      "Logout must invalidate cookie expiration"
    );
    console.log("✓ PASS: Logout properly clears session cookie.");
  }

  // Clean up test user
  await User.deleteOne({ email: testEmail });
  console.log(`Cleaned up test user ${testEmail}.`);

  console.log("\n==================================================");
  console.log("ALL 10 SECURITY & AUTHENTICATION AUDIT TESTS PASSED!");
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
