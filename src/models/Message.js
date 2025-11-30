const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const ObjectId = mongoose.Types.ObjectId;

const messageSchema = new Schema(
  {
    chatId: {
      type: ObjectId,
      ref: "Chat",
      required: true,
    },
    senderId: {
      type: ObjectId,
      ref: "Customer", // Reference to Customer model
      required: true,
    },
    messageType: {
      type: String,
      enum: ["text", "document", "image"],
      default: "text",
      required: true,
    },
    content: {
      type: String,
      required: function() {
        return this.messageType === "text";
      },
      maxlength: 2000,
    },
    documentUrl: {
      type: String,
      required: function() {
        return this.messageType === "document" || this.messageType === "image";
      },
    },
    documentName: {
      type: String,
      required: function() {
        return this.messageType === "document" || this.messageType === "image";
      },
    },
    documentSize: {
      type: Number, // Size in bytes
      required: function() {
        return this.messageType === "document" || this.messageType === "image";
      },
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { toJSON: { virtuals: true } }
);

messageSchema.virtual("chat", {
  ref: "Chat",
  localField: "chatId",
  foreignField: "_id",
  justOne: true,
});

messageSchema.virtual("sender", {
  ref: "Customer",
  localField: "senderId",
  foreignField: "_id",
  justOne: true,
});

messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, isDeleted: 1, createdAt: -1 });

messageSchema.statics.findChatMessages = function(chatId, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  
  return this.find({
    chatId: chatId,
    isDeleted: false,
  })
  .populate("sender", "fullName avatar avatarUrl email companyName")
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

messageSchema.statics.markAsRead = function(chatId, userId) {
  return this.updateMany(
    {
      chatId: chatId,
      senderId: { $ne: userId },
      isRead: false,
      isDeleted: false,
    },
    {
      $set: {
        isRead: true,
        readAt: new Date(),
        updatedAt: new Date(),
      },
    }
  );
};

messageSchema.statics.getUnreadCount = function(chatId, userId) {
  return this.countDocuments({
    chatId: chatId,
    senderId: { $ne: userId },
    isRead: false,
    isDeleted: false,
  });
};

messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

messageSchema.methods.editMessage = function(newContent) {
  if (this.messageType !== "text") {
    throw new Error("Only text messages can be edited");
  }
  
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

module.exports = model("Message", messageSchema, "messages");
