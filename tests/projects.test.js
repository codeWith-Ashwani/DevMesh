const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  cleanupTestData,
} = require("./helpers/testUtils");

describe("Projects & Initiative Collaborations", () => {
  const trackedEmails = [];
  let userA, userB;
  let projectId;

  before(async () => {
    await startTestServer();
    userA = await createTestUser({ firstName: "ProjectOwner" });
    userB = await createTestUser({ firstName: "Collaborator" });
    trackedEmails.push(userA.email, userB.email);
  });

  after(async () => {
    await cleanupTestData(trackedEmails);
    await stopTestServer();
  });

  it("should create a new project initiative with valid data", async () => {
    const res = await request(
      "POST",
      "/projects",
      {
        title: "AI Pair Programming Assistant",
        description: "Building an open-source agentic coding workspace for developers.",
        techStack: ["Node.js", "React", "TypeScript", "Tailwind CSS"],
        rolesNeeded: ["Full Stack Developer", "Prompt Engineer"],
        stage: "Building",
        commitment: "10 hrs/week",
        githubUrl: "https://github.com/devmesh/ai-assistant",
      },
      userA.cookie
    );

    assert.strictEqual(res.status, 201);
    assert.ok(res.data.data);
    assert.strictEqual(res.data.data.title, "AI Pair Programming Assistant");
    assert.strictEqual(res.data.data.creator, userA._id);
    projectId = res.data.data._id;
  });

  it("should reject project creation with invalid data (400)", async () => {
    // Missing title
    const res1 = await request(
      "POST",
      "/projects",
      {
        description: "Valid description but missing title",
        techStack: ["Node.js"],
        rolesNeeded: ["Dev"],
      },
      userA.cookie
    );
    assert.strictEqual(res1.status, 400);

    // Invalid stage
    const res2 = await request(
      "POST",
      "/projects",
      {
        title: "Valid Title",
        description: "Valid description text over 10 chars",
        techStack: ["Node.js"],
        rolesNeeded: ["Dev"],
        stage: "NonExistentStage",
      },
      userA.cookie
    );
    assert.strictEqual(res2.status, 400);
  });

  it("should allow creator to edit their own project", async () => {
    const res = await request(
      "PATCH",
      `/projects/${projectId}`,
      {
        title: "AI Agentic Pair Programming Assistant (Updated)",
        stage: "Launched",
      },
      userA.cookie
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.title, "AI Agentic Pair Programming Assistant (Updated)");
    assert.strictEqual(res.data.data.stage, "Launched");
  });

  it("should reject unauthorized project modifications with 403 Forbidden", async () => {
    const res = await request(
      "PATCH",
      `/projects/${projectId}`,
      {
        title: "Hacked Title by Collaborator",
      },
      userB.cookie
    );

    assert.strictEqual(res.status, 403);
    assert.ok(res.data.message.includes("Access denied"));
  });

  it("should allow user to apply to a project and prevent creator self-applying", async () => {
    // Creator self-apply -> 400
    const selfApply = await request(
      "POST",
      `/projects/${projectId}/apply`,
      { message: "Applying to my own project" },
      userA.cookie
    );
    assert.strictEqual(selfApply.status, 400);

    // Valid collaborator apply -> 201
    const applyRes = await request(
      "POST",
      `/projects/${projectId}/apply`,
      { message: "Excited to join the team as Full Stack Dev!" },
      userB.cookie
    );
    assert.strictEqual(applyRes.status, 201);
    assert.strictEqual(applyRes.data.message, "Application sent successfully");

    // Duplicate application -> 409
    const dupApply = await request(
      "POST",
      `/projects/${projectId}/apply`,
      { message: "Applying again" },
      userB.cookie
    );
    assert.strictEqual(dupApply.status, 409);
  });

  it("should reject unauthorized application reviews with 403 Forbidden", async () => {
    // Creator views applications
    const appsRes = await request("GET", `/projects/${projectId}/applications`, null, userA.cookie);
    assert.strictEqual(appsRes.status, 200);
    const applicationId = appsRes.data.data[0]._id;

    // Non-creator User B attempts to view applications -> 403
    const unauthorizedView = await request("GET", `/projects/${projectId}/applications`, null, userB.cookie);
    assert.strictEqual(unauthorizedView.status, 403);

    // Non-creator User B attempts to review application -> 403
    const unauthorizedReview = await request(
      "PATCH",
      `/projects/${projectId}/applications/${applicationId}`,
      { status: "accepted" },
      userB.cookie
    );
    assert.strictEqual(unauthorizedReview.status, 403);

    // Creator accepts application -> 200
    const creatorReview = await request(
      "PATCH",
      `/projects/${projectId}/applications/${applicationId}`,
      { status: "accepted" },
      userA.cookie
    );
    assert.strictEqual(creatorReview.status, 200);
    assert.strictEqual(creatorReview.data.message, "Application accepted");
  });

  it("should support pagination on GET /projects", async () => {
    // Query page 1 with limit 1
    const p1Res = await request("GET", "/projects?page=1&limit=1", null, userA.cookie);
    assert.strictEqual(p1Res.status, 200);
    assert.ok(Array.isArray(p1Res.data.data));
    assert.strictEqual(p1Res.data.data.length, 1);

    // Query with invalid values falls back to sensible defaults
    const fallbackRes = await request("GET", "/projects?page=-1&limit=invalid", null, userA.cookie);
    assert.strictEqual(fallbackRes.status, 200);
    assert.ok(Array.isArray(fallbackRes.data.data));
  });

  it("should reject unauthorized project deletion with 403 and allow creator deletion", async () => {
    // Non-creator delete -> 403
    const unauthDelete = await request("DELETE", `/projects/${projectId}`, null, userB.cookie);
    assert.strictEqual(unauthDelete.status, 403);

    // Creator delete -> 200
    const creatorDelete = await request("DELETE", `/projects/${projectId}`, null, userA.cookie);
    assert.strictEqual(creatorDelete.status, 200);
    assert.strictEqual(creatorDelete.data.message, "Project deleted successfully");
  });
});

