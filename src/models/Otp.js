const mongoose = require("mongoose");
const moment = require("moment");

const { Schema, model } = mongoose;

const otpSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false, // Made optional to support phone verification during signup
    },
    email: {
      type: String,
      required: false, // Made optional to support phone verification during signup
      lowercase: true,
    },
    phoneNumber: {
      type: String,
      required: false,
    },
    otp: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["forget_password", "email_verification", "phone_verification"],
      default: "forget_password",
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { toJSON: { virtuals: true } }
);

// Index for faster queries
otpSchema.index({ userId: 1, type: 1 });
otpSchema.index({ email: 1, type: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual to check if OTP is expired
otpSchema.virtual("isExpired").get(function () {
  return moment().isAfter(moment(this.expiresAt));
});

// Method to mark OTP as used
otpSchema.methods.markAsUsed = function () {
  this.isUsed = true;
  return this.save();
};

module.exports = model("Otp", otpSchema, "otps");
