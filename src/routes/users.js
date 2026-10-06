const express = require("express");
const usersRouter = express.Router();
const ConnectionRequestModel = require("../models/conectionRequest");
const userAuth = require("../middlewares/auth");
const User = require("../models/user");
const { PUBLIC_USER_FIELDS } = require("../utils/validation");

const publicProjection = PUBLIC_USER_FIELDS.filter((f) => f !== "_id");

// Get all the pending connection requests for a user
usersRouter.get("/user/requests/received", userAuth, async (req, res, next) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequestModel.find({
      toUserId: loggedInUser._id,
      status: "interested",
    })
      .populate("fromUserId", publicProjection)
      .lean();

    return res.status(200).json({
      message: "Connection requests fetched successfully",
      data: connectionRequests.filter(row => row.fromUserId),
    });
  } catch (error) {
    return next(error);
  }
});

// Get all the accepted connections for a user
usersRouter.get("/user/connections", userAuth, async (req, res, next) => {
  try {
    const loggedInUser = req.user;
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [
        { toUserId: loggedInUser._id, status: "accepted" },
        { fromUserId: loggedInUser._id, status: "accepted" },
      ],
    })
      .populate("toUserId fromUserId", publicProjection)
      .lean();

    const data = connectionRequests.map((row) => {
      const fromId = row.fromUserId?._id ? row.fromUserId._id.toString() : row.fromUserId?.toString();
      if (fromId === loggedInUser._id.toString()) {
        return row.toUserId;
      } else {
        return row.fromUserId;
      }
    }).filter(Boolean);

    return res.status(200).json({
      message: "Connections fetched successfully",
      data,
    });
  } catch (error) {
    return next(error);
  }
});

// Feed API
usersRouter.get("/feed", userAuth, async (req, res, next) => {
  try {
    const loggedInUser = req.user;

    const { limit, skip } = require('../utils/pagination')(req.query, 10, 50);

    // Find all connection requests sent and received
    const connectionRequests = await ConnectionRequestModel.find({
      $or: [{ toUserId: loggedInUser._id }, { fromUserId: loggedInUser._id }],
    })
      .select("fromUserId toUserId")
      .lean();

    const hideUsersFromFeed = new Set();
    connectionRequests.forEach((request) => {
      if (request.fromUserId) hideUsersFromFeed.add(request.fromUserId.toString());
      if (request.toUserId) hideUsersFromFeed.add(request.toUserId.toString());
    });

    const users = await User.find({
      $and: [
        { _id: { $nin: Array.from(hideUsersFromFeed) } },
        { _id: { $ne: loggedInUser._id } },
      ],
    })
      .select(publicProjection.join(" "))
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json(users);

  } catch (error) {
    return next(error);
  }
});

module.exports = usersRouter;
