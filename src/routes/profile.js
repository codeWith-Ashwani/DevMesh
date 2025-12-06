const express = require("express");
const profileRouter = express.Router();
const userAuth = require("../middlewares/auth");
const { validate } = require("../models/user");
const { validateEditProfileData } = require("../utils/validation");
const bcrypt = require("bcrypt");

// get user profile API
profileRouter.get("/profile/view", userAuth, async (req, res) => {
  try {
    const user = req.user;
    res.send(user);
  } catch (error) {
    res.status(500).send("Error fetching profile");
  }
});

// update user profile API
profileRouter.patch("/profile/edit", userAuth, async (req, res) => {
  try {
    if (!validateEditProfileData(req)) {
      throw new Error("Invalid fields in profile update");
    }
    const loggedInUser = req.user;
    loggedInUser.set(req.body);
    await loggedInUser.save();
    res.send({
      message: `${loggedInUser.firstName} your updated successfully`,
      data: loggedInUser,
    });
  } catch (error) {
    res.status(500).send("Error updating profile" + error.message);
  }
});

// forgot password API
profileRouter.post("/profile/forgot-password", userAuth, async (req, res) => {
  try {
    const { password, newPassword } = req.body;

    if (!password || !newPassword) {
      return res
        .status(400)
        .send({ message: "Both current and new passwords are required" });
    }

    const user = req.user;

    // Check old password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    return res.send({ message: "Password updated successfully" });
  } catch (error) {
    return res.status(500).send("Error updating password: " + error.message);
  }
});



module.exports = profileRouter;
