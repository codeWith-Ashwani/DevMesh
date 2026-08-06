const express = require("express");
const chatRouter = express.Router();
const userAuth = require("../middlewares/auth");
const ConnectionRequestModel = require("../models/conectionRequest");
const Message = require("../models/message");

const hasAcceptedConnection = async (userId, otherUserId) =>
  ConnectionRequestModel.exists({
    status: "accepted",
    $or: [
      { fromUserId: userId, toUserId: otherUserId },
      { fromUserId: otherUserId, toUserId: userId },
    ],
  });

chatRouter.get("/chat/:userId", userAuth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const isConnected = await hasAcceptedConnection(req.user._id, otherUserId);
    if (!isConnected) {
      return res.status(403).json({ message: "You can only chat with accepted connections" });
    }

    const messages = await Message.find({
      $or: [
        { fromUserId: req.user._id, toUserId: otherUserId },
        { fromUserId: otherUserId, toUserId: req.user._id },
      ],
    })
      .sort({ createdAt: 1 })
      .select("fromUserId toUserId text createdAt");

    return res.json({ data: messages });
  } catch (error) {
    return res.status(400).json({ message: "Unable to load this conversation" });
  }
});

chatRouter.post("/chat/:userId", userAuth, async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const text = req.body?.text?.trim();
    if (!text) {
      return res.status(400).json({ message: "A message cannot be empty" });
    }

    const isConnected = await hasAcceptedConnection(req.user._id, otherUserId);
    if (!isConnected) {
      return res.status(403).json({ message: "You can only chat with accepted connections" });
    }

    const message = await Message.create({
      fromUserId: req.user._id,
      toUserId: otherUserId,
      text,
    });
    return res.status(201).json({ data: message });
  } catch (error) {
    return res.status(400).json({ message: "Unable to send this message" });
  }
});

module.exports = chatRouter;
