const mongoose = require("mongoose");
const env = require("./env");

let listenersAttached = false;

const attachConnectionListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    if (!env.isTest) {
      console.log("MongoDB connection established successfully.");
    }
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message || "Database connection error");
  });

  mongoose.connection.on("disconnected", () => {
    if (!env.isTest) {
      console.warn("MongoDB connection disconnected.");
    }
  });

  mongoose.connection.on("reconnected", () => {
    if (!env.isTest) {
      console.log("MongoDB connection re-established.");
    }
  });
};

const connectDB = async () => {
  attachConnectionListeners();
  const connectionString = env.getDBConnectionString();
  return mongoose.connect(connectionString);
};

module.exports = connectDB;
