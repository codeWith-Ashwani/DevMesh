const express = require("express");
const chatRouter = express.Router();
const userAuth = require("../middlewares/auth");
const ConnectionRequestModel = require("../models/conectionRequest");
const Message = require("../models/message");
const { isValidObjectId } = require("../utils/validation");

const hasAcceptedConnection = async (userId, otherUserId) => {
  if (!isValidObjectId(userId) || !isValidObjectId(otherUserId)) {
    return false;
  }
  return ConnectionRequestModel.exists({
    status: "accepted",
    $or: [
      { fromUserId: userId, toUserId: otherUserId },
      { fromUserId: otherUserId, toUserId: userId },
    ],
  });
};

chatRouter.get("/chat/:userId", userAuth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    if (!isValidObjectId(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const isConnected = await hasAcceptedConnection(req.user._id, otherUserId);
    if (!isConnected) {
      return res.status(403).json({ message: "You can only chat with accepted connections" });
    }

    const parsedPage = parseInt(req.query.page, 10);
    const page = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const parsedLimit = parseInt(req.query.limit, 10);
    let limit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30;
    if (limit > 100) limit = 100;

    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { fromUserId: req.user._id, toUserId: otherUserId },
        { fromUserId: otherUserId, toUserId: req.user._id },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .select("fromUserId toUserId text createdAt")
      .lean();

    messages.reverse();

    return res.json({ data: messages });
  } catch (error) {
    return res.status(500).json({ message: "Unable to load this conversation" });
  }
});

chatRouter.post("/chat/:userId", userAuth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    if (!isValidObjectId(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const text = req.body?.text;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ message: "A message cannot be empty" });
    }

    if (text.length > 2000) {
      return res.status(400).json({ message: "Message cannot exceed 2000 characters" });
    }

    const isConnected = await hasAcceptedConnection(req.user._id, otherUserId);
    if (!isConnected) {
      return res.status(403).json({ message: "You can only chat with accepted connections" });
    }

    const message = await Message.create({
      fromUserId: req.user._id,
      toUserId: otherUserId,
      text: text.trim(),
    });

    return res.status(201).json({ data: message });
  } catch (error) {
    return res.status(500).json({ message: "Unable to send this message" });
  }
});

module.exports = chatRouter;
