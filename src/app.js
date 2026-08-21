try {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile();
  }
} catch (e) {
  // .env file is optional if env vars are set via environment
}

const express = require("express");
const connectDB = require("./config/database");
const app = express();
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { getJWTSecret } = require("./utils/security");

// Fail fast in production if JWT_SECRET is missing
try {
  getJWTSecret();
} catch (err) {
  console.error(err.message);
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: clientUrl,
    credentials: true,
  })
);
app.use(express.json()); // to parse JSON request body
app.use(cookieParser()); // to parse cookies from request headers

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

const PORT = process.env.PORT || 7777;

if (require.main === module) {
  connectDB()
    .then(() => {
      console.log("Database connected successfully");
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("database cannot be connected", err);
    });
}

module.exports = app;
