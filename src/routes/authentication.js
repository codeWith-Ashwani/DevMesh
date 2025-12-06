const express = require("express");
const { validateSingUpData } = require("../utils/validation");
const authRouter = express.Router();
const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// signup API
authRouter.post("/signup", async (req, res) => {
  // const userObj = {
  //   firstName: "Ashwani",
  //   lastName: "Singh",
  //   email: "ashwani@example.com",
  //   password: "securepassword"
  // };

  // creating a new instance of User model
  // const user = new User(userObj);
  try {
    // validation of data
    validateSingUpData(req);

    const { firstName, lastName, email, password } = req.body;

    // Encrypt password

    const passwordHash = await bcrypt.hash(password, 10);
    console.log("Hashed Password:", passwordHash);

    // create user object to be saved in the database
    const user = new User({
      firstName,
      lastName,
      email,
      password: passwordHash,
    }); // req.body will have the user data in JSON format sent by the client dynamically

    const savedUser = await user.save();

    const token = await savedUser.getJWT();

    // Add the token to cookie and send the response back to user
    res.cookie("token", token, {
      httpOnly: true,
      expires: new Date(Date.now() + 86400000),
    });
    res.json({ message: "User signed up successfully", data: savedUser });
  } catch (error) {
    res.status(500).send("Error signing up user");
  }
});

// login API
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(404).send("Invalid credentials");
    }
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (isPasswordMatch) {
      // Create a JWT Token

      const token = await user.getJWT();

      // Add the token to cookie and send the response back to user
      res.cookie("token", token, {
        httpOnly: true,
        expires: new Date(Date.now() + 86400000),
      });
      res.send(user);
    } else {
      return res.status(401).send("Invalid credentials");
    }
  } catch (error) {
    res.status(500).send("Error logging in user");
  }
});

// logout API
authRouter.post("/logout", async (req, res) => {
  try {
    res.cookie("token", null, {
      expires: new Date(Date.now()),
    });
    res.send("User logged out successfully");
  } catch (error) {
    res.status(500).send("Error logging out user");
  }
});

module.exports = authRouter;
