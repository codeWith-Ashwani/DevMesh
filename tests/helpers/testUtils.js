const http = require("http");
const mongoose = require("mongoose");
const app = require("../../src/app");
const connectDB = require("../../src/config/database");
const User = require("../../src/models/user");
const Project = require("../../src/models/project");
const ConnectionRequest = require("../../src/models/conectionRequest");
const Message = require("../../src/models/message");
const {
  loginLimiter,
  signupLimiter,
  passwordUpdateLimiter,
} = require("../../src/middlewares/rateLimiter");

let server = null;
let baseUrl = "";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_suite_super_secret_jwt_key_987654321";
process.env.CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
process.env.DB_CONNECTION_STRING =
  process.env.DB_CONNECTION_STRING || "mongodb+srv://work639280_db_user:La5udQvtNc1NELTr@cluster0.83xtjwl.mongodb.net/?appName=Cluster0";



const startTestServer = async () => {
  if (!server) {
    await connectDB();
    await mongoose.connection.asPromise();

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  }
  return baseUrl;
};

const stopTestServer = async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }
  await mongoose.disconnect();
};

const request = async (method, path, body = null, cookies = null) => {
  if (!server) {
    await startTestServer();
  }

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

const createTestUser = async (overrides = {}) => {
  const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const defaultPassword = "TestPassword#2026";
  const email = overrides.email || `test.${unique}@devmesh.example`.toLowerCase();
  const firstName = overrides.firstName || "Test";
  const lastName = overrides.lastName || "User";

  const res = await request("POST", "/signup", {
    firstName,
    lastName,
    email,
    password: overrides.password || defaultPassword,
    ...overrides,
  });

  const cookie = res.setCookie ? res.setCookie.split(";")[0] : null;
  return {
    _id: res.data?.data?._id,
    user: res.data?.data,
    email,
    password: overrides.password || defaultPassword,
    cookie,
    status: res.status,
  };
};

const resetRateLimiters = () => {
  if (loginLimiter.reset) loginLimiter.reset();
  if (signupLimiter.reset) signupLimiter.reset();
  if (passwordUpdateLimiter.reset) passwordUpdateLimiter.reset();
};

const cleanupTestData = async (emails = []) => {
  if (emails.length > 0) {
    const users = await User.find({ email: { $in: emails } }).select("_id");
    const userIds = users.map((u) => u._id);

    await User.deleteMany({ _id: { $in: userIds } });
    await Project.deleteMany({ creator: { $in: userIds } });
    await ConnectionRequest.deleteMany({
      $or: [{ fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }],
    });
    await Message.deleteMany({
      $or: [{ fromUserId: { $in: userIds } }, { toUserId: { $in: userIds } }],
    });
  }
};

module.exports = {
  startTestServer,
  stopTestServer,
  request,
  createTestUser,
  resetRateLimiters,
  cleanupTestData,
};
