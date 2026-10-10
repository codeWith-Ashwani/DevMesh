const express = require("express");
const { validateSingUpData, getSafeUser } = require("../utils/validation");
const { getCookieOptions, getClearCookieOptions } = require("../utils/security");
const { signupLimiter, loginLimiter } = require("../middlewares/rateLimiter");
const authRouter = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");

// signup API
authRouter.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    // validation of data
    validateSingUpData(req);

    const { firstName, lastName, email, password } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    // Hash before persisting; plaintext is only used to verify credentials.
    const passwordHash = await bcrypt.hash(password, 10);

    // create user object to be saved in the database
    const user = new User({
      firstName: firstName.trim(),
      lastName: lastName ? lastName.trim() : undefined,
      email: normalizedEmail,
      password: passwordHash,
    });

    const savedUser = await user.save();
    const token = await savedUser.getJWT();

    // Add the token to cookie and send the response back to user
    res.cookie("token", token, getCookieOptions());
    return res.status(201).json({
      message: "User signed up successfully",
      data: getSafeUser(savedUser),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email is already registered" });
    }
    if (
      error.name === "ValidationError" ||
      (error.message &&
        (error.message.includes("First name") ||
          error.message.includes("Last name") ||
          error.message.includes("Invalid email") ||
          error.message.includes("Password")))
    ) {
      return res.status(400).json({ message: error.message });
    }
    return next(error);
  }
});

// login API
authRouter.post("/login", loginLimiter, async (req, res, next) => {

  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || password.length > 256) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = typeof email === "string" ? email.toLowerCase().trim() : "";
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create a JWT Token
    const token = await user.getJWT();

    // Add the token to cookie and send the response back to user
    res.cookie("token", token, getCookieOptions());
    return res.json(getSafeUser(user));
  } catch (error) {
    return next(error);
  }
});

// logout API
authRouter.post("/logout", require('../middlewares/auth'), async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $inc: { authVersion: 1 } });
    req.app.get('io')?.in(`user:${req.user._id}`).disconnectSockets(true);
    res.cookie("token", null, getClearCookieOptions());
    return res.json({ message: "User logged out successfully" });
  } catch (error) {
    return next(error);
  }
});

module.exports = authRouter;

