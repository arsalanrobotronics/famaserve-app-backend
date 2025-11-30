const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const ObjectId = mongoose.Types.ObjectId;

const chatSchema = new Schema(
  {
    projectId: {
      type: ObjectId,
      ref: "Project",
      required: true,
    },
    tradieId: {
      type: ObjectId,
      ref: "Customer", // Reference to Customer model where tradie data is stored
      required: true,
    },
    builderId: {
      type: ObjectId,
      ref: "Customer", // Reference to Customer model where builder data is stored
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "closed", "archived"],
      default: "active",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    lastMessage: {
      type: String,
      default: null,
      maxlength: 500,
    },
    unreadCount: {
      tradieCount: {
        type: Number,
        default: 0,
      },
      builderCount: {
        type: Number,
        default: 0,
      },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { toJSON: { virtuals: true } }
);
chatSchema.virtual("project", {
  ref: "Project",
  localField: "projectId",
  foreignField: "_id",
  justOne: true,
});
chatSchema.virtual("tradie", {
  ref: "Customer",
  localField: "tradieId",
  foreignField: "_id",
  justOne: true,
});
chatSchema.virtual("builder", {
  ref: "Customer",
  localField: "builderId",
  foreignField: "_id",
  justOne: true,
});
chatSchema.index({ projectId: 1, tradieId: 1, builderId: 1 }, { unique: true });
chatSchema.index({ tradieId: 1, status: 1 });
chatSchema.index({ builderId: 1, status: 1 });
chatSchema.index({ projectId: 1, status: 1 });
chatSchema.index({ lastMessageAt: -1 });
chatSchema.statics.findUserChats = function(userId, status = "active") {
  return this.find({
    $or: [{ tradieId: userId }, { builderId: userId }],
    status: status,
  })
  .populate("project", "title description status")
  .populate("tradie", "fullName avatar companyName")
  .populate("builder", "fullName avatar companyName")
  .sort({ lastMessageAt: -1 });
};
chatSchema.methods.getOtherParticipant = function(currentUserId) {
  if (this.tradieId.toString() === currentUserId.toString()) {
    return this.builderId;
  }
  return this.tradieId;
};
chatSchema.methods.getUnreadCount = function(userId) {
  if (this.tradieId.toString() === userId.toString()) {
    return this.unreadCount.tradieCount;
  }
  return this.unreadCount.builderCount;
};
chatSchema.methods.resetUnreadCount = function(userId) {
  if (this.tradieId.toString() === userId.toString()) {
    this.unreadCount.tradieCount = 0;
  } else {
    this.unreadCount.builderCount = 0;
  }
  return this.save();
};
chatSchema.methods.incrementUnreadCount = function(senderId) {
  if (this.tradieId.toString() === senderId.toString()) {
    this.unreadCount.builderCount += 1;
  } else {
    this.unreadCount.tradieCount += 1;
  }
  return this.save();
};

module.exports = model("Chat", chatSchema, "chats");
