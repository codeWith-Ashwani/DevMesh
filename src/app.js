const express = require("express");
const connectDB = require("./config/database");
const app = express();
const cookieParser = require("cookie-parser");
const cors = require("cors");

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));
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

connectDB()
  .then(() => {
    console.log("Database connected successfully");
    app.listen(7777, () => {
      console.log("Server is running on port 7777");
    });
  })
  .catch((err) => {
    console.error("database cannot be connected");
  });
