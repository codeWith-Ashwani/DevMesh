const express = require("express");
const profileRouter = express.Router();
const userAuth = require("../middlewares/auth");
const { passwordUpdateLimiter } = require("../middlewares/rateLimiter");
const {
  validateEditProfileData,
  validatePassword,
  getSafeUser,
} = require("../utils/validation");
const bcrypt = require("bcrypt");

// get user profile API
profileRouter.get("/profile/view", userAuth, async (req, res) => {
  try {
    const safeUser = getSafeUser(req.user);
    return res.json(safeUser);
  } catch (error) {
    return res.status(500).json({ message: "Error fetching profile" });
  }
});

// update user profile API
profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
  try {
    if (!validateEditProfileData(req)) {
      return res.status(400).json({ message: "Invalid fields in profile update" });
    }
    const loggedInUser = req.user;
    loggedInUser.set(req.body);
    const savedUser = await loggedInUser.save();
    return res.json({
      message: `${savedUser.firstName}, your profile was updated successfully`,
      data: getSafeUser(savedUser),
    });
  } catch (error) {
    if (error.name === "ValidationError" || error.message) {
      return res.status(400).json({ message: error.message || "Invalid profile data" });
    }
    return res.status(500).json({ message: "Error updating profile" });
  }
});

// password update handler
const handlePasswordUpdate = async (req, res) => {
  try {
    const { password, newPassword } = req.body;

    if (!password || !newPassword) {
      return res
        .status(400)
        .json({ message: "Both current and new passwords are required" });
    }

    const user = req.user;

    // Check old password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Validate new password rules
    validatePassword(newPassword);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.authVersion = (user.authVersion || 0) + 1;
    await user.save();
    req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);
    const { getCookieOptions } = require('../utils/security');
    res.cookie('token', user.getJWT(), getCookieOptions());

    return res.json({ message: "Password updated successfully" });
  } catch (error) {
    if (
      error.message &&
      (error.message.includes("Password") ||
        error.message.includes("password") ||
        error.name === "ValidationError")
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Error updating password" });
  }
};

profileRouter.post(
  "/profile/forgot-password",
  userAuth,
  passwordUpdateLimiter,
  handlePasswordUpdate
);
profileRouter.patch(
  "/profile/password",
  userAuth,
  passwordUpdateLimiter,
  handlePasswordUpdate
);

module.exports = profileRouter;


