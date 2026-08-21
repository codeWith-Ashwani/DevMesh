const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Profile Operations & Privacy Isolation", () => {
  const trackedEmails = [];
  let userA, userB;

  before(async () => {
    await startTestServer();
    userA = await createTestUser({ firstName: "Ada", lastName: "Lovelace" });
    userB = await createTestUser({ firstName: "Alan", lastName: "Turing" });
    trackedEmails.push(userA.email, userB.email);
  });

  after(async () => {
    await cleanupTestData(trackedEmails);
    await stopTestServer();
  });

  it("should allow an authenticated user to view their own profile with private email", async () => {
    const res = await request("GET", "/profile/view", null, userA.cookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.email, userA.email);
    assert.strictEqual(res.data.firstName, "Ada");
    assert.strictEqual(res.data.lastName, "Lovelace");
    assert.strictEqual(res.data.password, undefined, "Password must not be returned in profile/view");
  });

  it("should allow an authenticated user to edit their own profile", async () => {
    const res = await request(
      "PATCH",
      "/profile/edit",
      {
        about: "Pioneer in computing algorithms and analytical engines.",
        skills: ["Math", "Algorithms", "Logic"],
        age: 36,
        gender: "Female",
        githubUrl: "https://github.com/ada-lovelace",
      },
      userA.cookie
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.about, "Pioneer in computing algorithms and analytical engines.");
    assert.strictEqual(res.data.data.age, 36);
    assert.strictEqual(res.data.data.gender, "Female");
    assert.strictEqual(res.data.data.githubUrl, "https://github.com/ada-lovelace");
    assert.strictEqual(res.data.data.password, undefined);
  });

  it("should reject invalid profile edit fields and invalid values with 400 Bad Request", async () => {
    // Disallowed fields (e.g. role or password injection)
    const res1 = await request(
      "PATCH",
      "/profile/edit",
      { role: "admin", password: "NewPassword#123" },
      userA.cookie
    );
    assert.strictEqual(res1.status, 400);

    // Invalid age (< 18)
    const res2 = await request("PATCH", "/profile/edit", { age: 10 }, userA.cookie);
    assert.strictEqual(res2.status, 400);

    // Invalid gender
    const res3 = await request("PATCH", "/profile/edit", { gender: "InvalidGender" }, userA.cookie);
    assert.strictEqual(res3.status, 400);

    // Invalid URL
    const res4 = await request("PATCH", "/profile/edit", { githubUrl: "not-a-valid-url" }, userA.cookie);
    assert.strictEqual(res4.status, 400);
  });

  it("should ensure private fields (email and password) are never exposed to other users in feed or lists", async () => {
    const feedRes = await request("GET", "/feed", null, userB.cookie);
    assert.strictEqual(feedRes.status, 200);
    assert.ok(Array.isArray(feedRes.data));

    for (const dev of feedRes.data) {
      assert.strictEqual(dev.password, undefined, "Public feed must never contain passwords");
      assert.strictEqual(dev.email, undefined, "Public feed must never leak developer emails");
    }
  });
});
