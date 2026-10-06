const express = require("express");
const requestsRouter = express.Router();
const userAuth = require("../middlewares/auth");
const ConnectionRequestModel = require("../models/conectionRequest");
const User = require("../models/user");
const mutationLimiter = require('../middlewares/mutationLimiter')('connections');
const { isValidObjectId } = require("../utils/validation");

// sending connection request
requestsRouter.post(
  "/request/send/:status/:toUserId",
  userAuth,
  mutationLimiter,
  async (req, res, next) => {
    try {
      const fromUserId = req.user._id;
      const { toUserId, status } = req.params;

      if (!isValidObjectId(toUserId)) {
        return res.status(400).json({ message: "Invalid recipient user ID format" });
      }

      const allowedStatuses = ["ignore", "interested"];
      if (!allowedStatuses.includes(status)) {
        return res
          .status(400)
          .json({ message: "Invalid status for connection request" });
      }

      if (fromUserId.toString() === toUserId.toString()) {
        return res
          .status(400)
          .json({ message: "Cannot send connection request to yourself" });
      }

      const [toUser, existingRequest] = await Promise.all([
        User.findById(toUserId).select('_id').lean(),
        ConnectionRequestModel.exists({
          $or: [
            { fromUserId, toUserId },
            { fromUserId: toUserId, toUserId: fromUserId },
          ],
        }),
      ]);
      if (!toUser) {
        return res.status(404).json({ message: "Recipient user not found" });
      }

      // if a request already exists between these users, do not create a new one
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
      return res
        .status(200)
        .json({ message: "Connection request sent successfully", data });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ message: 'Connection request already exists' });
      return next(error);
    }
  }
);

// review connection request
requestsRouter.post(
  "/request/review/:status/:requestId",
  userAuth,
  mutationLimiter,
  async (req, res, next) => {
    try {
      const loggedInUser = req.user;
      const { status, requestId } = req.params;

      if (!isValidObjectId(requestId)) {
        return res.status(400).json({ message: "Invalid request ID format" });
      }

      const allowedStatuses = ["accepted", "rejected"];
      if (!allowedStatuses.includes(status)) {
        return res
          .status(400)
          .json({ message: "Invalid status for reviewing connection request" });
      }

      const connectionRequest = await ConnectionRequestModel.findById(requestId);
      if (!connectionRequest) {
        return res
          .status(404)
          .json({ message: "Connection request not found" });
      }

      // IDOR Check: Only the recipient user can review the request
      if (!connectionRequest.toUserId.equals(loggedInUser._id)) {
        return res
          .status(403)
          .json({ message: "Access denied: You can only review connection requests sent to you" });
      }

      if (connectionRequest.status !== "interested") {
        return res
          .status(400)
          .json({ message: "Connection request is not in a pending review state" });
      }

      const data = await ConnectionRequestModel.findOneAndUpdate({ _id: requestId, toUserId: loggedInUser._id, status: 'interested' }, { $set: { status } }, { returnDocument: 'after', runValidators: true });
      if (!data) return res.status(409).json({ message: 'Connection request has already been reviewed' });
      return res.status(200).json({
        message: "Connection request reviewed successfully",
        data,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = requestsRouter;

