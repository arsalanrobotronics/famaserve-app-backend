const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const ObjectId = mongoose.Types.ObjectId;

const NOTIFICATION_TYPES = [
  "project_created",
  "quote_sent",
  "quote_accepted",
  "quote_rejected",
  "trade_completed",
  "review_added",
  "chat_created",
  "message_sent",
];

const notificationSchema = new Schema(
  {
    title: { type: String, default: null, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    recipientId: { type: ObjectId, ref: "Customer", required: true, index: true },
    senderId: { type: ObjectId, ref: "Customer", default: null, index: true },
    projectId: { type: ObjectId, ref: "Project", default: null, index: true },
    quoteId: { type: ObjectId, ref: "Quote", default: null, index: true },
    chatId: { type: ObjectId, ref: "Chat", default: null, index: true },
    isRead: { type: Boolean, default: false, index: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true, versionKey: false },
    toObject: { virtuals: true, versionKey: false },
  }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 }, { name: "inbox_read_time" });
notificationSchema.index({ type: 1, createdAt: -1 }, { name: "type_time" });

notificationSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = model("Notification", notificationSchema, "notifications");


