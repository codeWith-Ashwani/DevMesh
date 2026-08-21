const mongoose = require("mongoose");
const connectDB = require("../src/config/database");
const User = require("../src/models/user");
const ConnectionRequest = require("../src/models/conectionRequest");
connectDB();


const TARGET_REQUESTS = 12;
const TARGET_CONNECTIONS = 12;

async function seedAshNetwork() {
  await mongoose.connection.asPromise();

  const matches = await User.find({
    firstName: /^ash$/i,
    lastName: /^singh$/i,
  }).select("_id firstName lastName email");

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Ash Singh profile, found ${matches.length}`);
  }

  const ash = matches[0];
  const demoUsers = await User.find({ email: /^demo\.techie\.\d+@(devtinder|devmesh)\.example$/ })
    .select("_id")
    .sort({ email: 1 });
  if (demoUsers.length < TARGET_REQUESTS + TARGET_CONNECTIONS) {
    throw new Error("Not enough demo users. Run npm.cmd run seed:users first.");
  }

  const existing = await ConnectionRequest.find({
    $or: [{ fromUserId: ash._id }, { toUserId: ash._id }],
  }).select("fromUserId toUserId status");
  const untouchedDemoUsers = demoUsers.filter((user) => !existing.some((request) =>
    request.fromUserId.equals(user._id) || request.toUserId.equals(user._id)
  ));

  const pendingUsers = untouchedDemoUsers.slice(0, TARGET_REQUESTS);
  const connectionUsers = untouchedDemoUsers.slice(TARGET_REQUESTS, TARGET_REQUESTS + TARGET_CONNECTIONS);
  if (pendingUsers.length < TARGET_REQUESTS || connectionUsers.length < TARGET_CONNECTIONS) {
    throw new Error("Not enough unused demo users to create the requested network.");
  }

  await ConnectionRequest.insertMany([
    ...pendingUsers.map((user) => ({ fromUserId: user._id, toUserId: ash._id, status: "interested" })),
    ...connectionUsers.map((user) => ({ fromUserId: user._id, toUserId: ash._id, status: "accepted" })),
  ]);

  console.log(`Created ${TARGET_REQUESTS} pending requests and ${TARGET_CONNECTIONS} accepted connections for ${ash.firstName} ${ash.lastName}.`);
  await mongoose.disconnect();
}

seedAshNetwork().catch(async (error) => {
  console.error("Unable to create Ash Singh's demo network:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
