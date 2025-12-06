const express = require("express");
const usersRouter = express.Router();
const ConnectionRequestModel = require("../models/conectionRequest");
const userAuth = require("../middlewares/auth");
const User = require("../models/user");

// Get all the pending connection requests for a user
usersRouter.get("/user/requests/received", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequestModel.find({
      toUserId: loggedInUser._id,
      status: "interested",
    }).populate("fromUserId", [
      "firstName",
      "lastName",
      "age",
      "photoUrl",
      "about",
      "skills",
    ]);
    if (connectionRequests.length === 0) {
      return res.status(404).json({
        message: "No pending connection requests found",
      });
    }

    res.status(200).json({
      message: "Connection requests fetched successfully",
      data: connectionRequests,
    });
  } catch (error) {
    res.status(500).send("Error fetching connection requests");
  }
});

// Get all the accepted connections for a user
usersRouter.get("/user/connections", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [
        { toUserId: loggedInUser._id, status: "accepted" },
        { fromUserId: loggedInUser._id, status: "accepted" },
      ],
    }).populate("toUserId fromUserId", [
      "firstName",
      "lastName",
      "age",
      "photoUrl",
      "about",
      "skills",
    ]);

    const data = connectionRequests.map((row) => {
      if (row.fromUserId._id.equals(loggedInUser._id)) {
        return row.toUserId;
      } else {
        return row.fromUserId;
      }
    });

    if (connectionRequests.length === 0) {
      return res.status(404).json({
        message: "No connections found",
      });
    }

    res.status(200).json({
      message: "Connections fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).send("Error fetching users");
  }
});

// Feed API
usersRouter.get("/feed", userAuth, async (req, res) => {
  try {
    const loggedInUser = req.user;

    const page = parseInt(req.query.page) || 1;
    let limit = parseInt(req.query.limit) || 10;
    if (limit > 50) limit = 50; // Max limit is 50
    const skip = (page - 1) * limit;

    // Find all connection requests sent and received
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [{ toUserId: loggedInUser._id }, { fromUserId: loggedInUser._id }],
    }).select("fromUserId toUserId");
    const hideUsersFromFeed = new Set();
    connectionRequests.forEach((request) => {
      hideUsersFromFeed.add(request.fromUserId.toString());
      hideUsersFromFeed.add(request.toUserId.toString());
    });

    const users = await User.find({
      $and: [
        { _id: { $nin: Array.from(hideUsersFromFeed) } },
        { _id: { $ne: loggedInUser._id } },
      ],
    })
      .select("firstName lastName age photoUrl about skills")
      .skip(skip)
      .limit(limit);

    res.send(users);
  } catch (error) {
    res.status(500).send("Error fetching feed");
  }
});

module.exports = usersRouter;
