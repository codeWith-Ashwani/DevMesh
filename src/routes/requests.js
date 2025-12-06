const express = require("express");
const requestsRouter = express.Router();
const userAuth = require("../middlewares/auth");
const ConnectionRequestModel = require("../models/conectionRequest");
const User = require("../models/user");

// sending connection request
requestsRouter.post(
  "/request/send/:status/:toUserId",
  userAuth,
  async (req, res) => {
    try {
      const fromUserId = req.user._id;
      const toUserId = req.params.toUserId;
      const status = req.params.status;

      const allowedStatuses = ["ignore", "interested"];
      if (!allowedStatuses.includes(status)) {
        return res
          .status(400)
          .json({ message: "Invalid status for connection request" });
      }

      const toUser = await User.findById(toUserId);
      if (!toUser) {
        return res.status(404).json({ message: "Recipient user not found" });
      }

      if (fromUserId.toString() === toUserId.toString()) {
        return res
          .status(400)
          .json({ message: "Cannot send connection request to yourself" });
      }

      // if a request already exists between these users, do not create a new one
      const existingRequest = await ConnectionRequestModel.findOne({
        $or: [
          // query for both directions
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId },
        ],
      });

      if (existingRequest) {
        return res
          .status(400)
          .json({ message: "Connection request already exists" });
      }

      const newRequest = new ConnectionRequestModel({
        fromUserId,
        toUserId,
        status,
      });

      const data = await newRequest.save();
      res
        .status(200)
        .json({ message: "Connection request sent successfully", data });
    } catch (error) {
      res.status(500).send("Error sending connection request");
    }
  }
);

// review connection request
requestsRouter.post(
  "/request/review/:status/:requestId",
  userAuth,
  async (req, res) => {
    try {
      const loggedInUser = req.user;
      const { status, requestId } = req.params;
      const allowedStatuses = ["accepted", "rejected"];

      if (!allowedStatuses.includes(status)) {
        return res
          .status(400)
          .json({ message: "Invalid status for reviewing connection request" });
      }
      const connectionRequest = await ConnectionRequestModel.findOne({
        _id: requestId,
        toUserId: loggedInUser._id,
        status: "interested",
      });
      if (!connectionRequest) {
        return res
          .status(404)
          .json({ message: "Connection request not found" });
      }
      connectionRequest.status = status;
      data = await connectionRequest.save();
      res.status(200).json({
        message: "Connection request reviewed successfully",
        data,
      });
    } catch (error) {
      res.status(500).send("Error reviewing connection request");
    }
  }
);


module.exports = requestsRouter;
