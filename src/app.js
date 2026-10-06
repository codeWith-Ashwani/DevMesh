const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const env = require("./config/env");
const connectDB = require("./config/database");
const securityHeaders = require("./middlewares/securityHeaders");
const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler");

const app = express();
app.disable('x-powered-by');
app.use(require('./middlewares/requestLog'));
if (process.env.TRUST_PROXY_HOPS) {
  const hops = Number(process.env.TRUST_PROXY_HOPS);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) throw new Error('Invalid TRUST_PROXY_HOPS');
  app.set('trust proxy', hops);
}

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
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (req.body === undefined) req.body = {};
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ message: 'Request body must be an object' });
  }
  next();
});

// 4. Cookie Parser
app.use(cookieParser());
app.use(require('./middlewares/origin'));

// 5. Liveness & Readiness Health Probes
app.get("/health", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

app.get("/ready", (req, res) => {
  // readyState 1 = connected
  const isDbReady = mongoose.connection.readyState === 1;
  const redis = require('./config/redis').getRedis();
  const isRedisReady = !process.env.REDIS_URL || (redis?.status === 'ready' && req.app.get('realtime')?.isReady());
  if (!isDbReady || !isRedisReady) {
    return res.status(503).json({
      status: "unavailable",
      database: isDbReady ? 'connected' : 'disconnected',
      redis: process.env.REDIS_URL ? (isRedisReady ? 'connected' : 'disconnected') : 'disabled',
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
app.use('/', require('./routes/conversations'));
app.use('/', require('./routes/collaboration'));

// 7. Centralized 404 Catch-All Handler
app.use(notFoundHandler);

// 8. Centralized Express Error Handler
app.use(errorHandler);

// 9. Process Server Lifecycle & Graceful Shutdown
if (require.main === module) {
  env.getJWTSecret();
  connectDB()
    .then(async () => {
      const { connectRedis, closeRedis } = require('./config/redis');
      const redis = await connectRedis();
      await Promise.all(Object.values(mongoose.models).map(model => model.init()));
      const server = require('http').createServer(app);
      const realtime = await require('./realtime').attachRealtime(server, redis);
      app.set('io', realtime.io);
      app.set('realtime', realtime);
      server.listen(env.PORT, () => {
        console.log(`DevMesh Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      });

      let isShuttingDown = false;
      const gracefulShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`Received ${signal}. Starting graceful shutdown...`);

        // Stop accepting new HTTP requests and finish active requests
        realtime.close().then(async () => {
          console.log("HTTP server closed.");
          try {
            await mongoose.connection.close(false);
            await closeRedis();
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
