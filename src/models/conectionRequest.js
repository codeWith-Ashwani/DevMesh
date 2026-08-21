const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema({
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  toUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  status: {
    type: String,
    enum:{
    values :  ["ignore", "interested", "accepted", "rejected"],
    message: "{VALUE} is invalid status for connection request"},
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

connectionRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
connectionRequestSchema.index({ toUserId: 1, status: 1 });
connectionRequestSchema.index({ fromUserId: 1, status: 1 });


// connectionRequestSchema.pre('save', function(next) {
//     const conectionRequest = this;
//     // check that fromUserId and toUserId are not the same
//     if (conectionRequest.fromUserId.toString() === conectionRequest.toUserId.toString()) {
//         throw new Error('Cannot send connection request to yourself');
//     }
//     next();
// });

const ConnectionRequestModel = new mongoose.model(
  "ConnectionRequest",
  connectionRequestSchema
);

module.exports = ConnectionRequestModel;
