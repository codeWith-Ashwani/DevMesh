const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const env = require("./config/env");
const connectDB = require("./config/database");
const securityHeaders = require("./middlewares/securityHeaders");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

const app = express();

// 1. Security Headers Middleware
app.use(securityHeaders);

// 2. Cross-Origin Resource Sharing
const clientUrl = env.getClientURL();
app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);

// 3. Body Parsers with Explicit 50kb Size Limits
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// 4. Cookie Parser
app.use(cookieParser());

// 5. Liveness & Readiness Health Probes
app.get("/health", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

app.get("/ready", (req, res) => {
  // readyState 1 = connected
  const isDbReady = mongoose.connection.readyState === 1;
  if (!isDbReady) {
    return res.status(503).json({
      status: "unavailable",
      database: "disconnected",
    });
  }
  return res.status(200).json({
    status: "ready",
    database: "connected",
  });
});

// 6. Application Domain Routers
const authRouter = require("./routes/authentication");
const profileRouter = require("./routes/profile");
const requestRouter = require("./routes/requests");
const usersRouter = require("./routes/users");
const chatRouter = require("./routes/chat");
const projectsRouter = require("./routes/projects");

app.use("/", authRouter);
app.use("/", profileRouter);
app.use("/", requestRouter);
app.use("/", usersRouter);
app.use("/", chatRouter);
app.use("/", projectsRouter);

// 7. Centralized 404 Catch-All Handler
app.use(notFoundHandler);

// 8. Centralized Express Error Handler
app.use(errorHandler);

// 9. Process Server Lifecycle & Graceful Shutdown
if (require.main === module) {
  connectDB()
    .then(() => {
      const server = app.listen(env.PORT, () => {
        console.log(`DevMesh Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      });

      let isShuttingDown = false;
      const gracefulShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`Received ${signal}. Starting graceful shutdown...`);

        // Stop accepting new HTTP requests and finish active requests
        server.close(async () => {
          console.log("HTTP server closed.");
          try {
            await mongoose.connection.close(false);
            console.log("MongoDB connection closed.");
            process.exit(0);
          } catch (err) {
            console.error("Error closing MongoDB connection:", err.message || err);
            process.exit(1);
          }
        });

        // Fallback force shutdown if draining takes > 10 seconds
        setTimeout(() => {
          console.error("Graceful shutdown timed out. Forcing process termination.");
          process.exit(1);
        }, 10000).unref();
      };

      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
      process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    })
    .catch((err) => {
      console.error("Database connection failed during startup:", err.message || err);
      process.exit(1);
    });
}

module.exports = app;
