const mongoose = require("mongoose");
const moment = require("moment");
const { arrayLimit } = require("../helpers/utils");
const { Certificate } = require("crypto");
const { Schema, model } = mongoose;
const ObjectId = mongoose.Types.ObjectId;

const userSchema = new Schema(
  {
    authProvider: {
      type: String,
      enum: ["manual", "google", "apple"],
      default: "manual",
    },
    fullName: {
      type: String,
      required: true,
      maxlength: 50,
    },
    username: {
      type: String,
      default: null,
      maxlength: 50,
    },
    registrationNumber: {
      type: String,
      default: null,
      maxlength: 50,
    },
    isdCode: {
      type: String,
      default: "0061",
      min: 1,
      max: 4,
    },
    phoneNumber: {
      type: String,
      required: false,
      maxlength: 15,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      match: [
        /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "Invalid email format",
      ],
      unique: true,
    },
    password: {
      type: String,
    },
    tradeId: {
      type: ObjectId,
      required: false,
      ref: "trade",
    },
    roleId: {
      type: ObjectId,
      required: true,
      ref: "Role",
    },
    image: { type: String },
    preferredLanguage: { type: String, default: "english" },
    avatar: {
      originalName: {
        type: String,
        default: null,
      },
      fileName: {
        type: String,
        default: null,
      },
    },
    isPhoneNumberValidated: {
      type: Boolean,
      default: false,
    },
    isEmailValidated: {
      type: Boolean,
      default: false,
    },
    companyName: {
      type: String,
      required: false,
    },
    street: {
      type: String,
      required: false,
    },
    postCode: {
      type: String,
      required: false,
    },
    suburb: {
      type: String,
      required: false,
    },
    state: {
      type: String,
      required: false,
    },
    intro: {
      type: String,
      default: null,
      maxlength: 2000,
    },
    insurancePolicyNumber: {
      type: String,
      required: false,
    },
    insurancePolicyFileUrl: {
      type: String,
      required: false,
    },
    abn: {
      type: String,
      required: false,
    },
    certificationFiles: {
      type: [String],
      default: [],
    },
    experienceLevel: {
      type: String,
      enum: ["", "3+ years", "5+ years", "8+ years"],
      default: "",
    },
    // Provider specific fields
    serviceHistory: {
      type: String,
      default: null,
      maxlength: 5000,
    },
    servicesOffered: {
      type: [ObjectId],
      default: [],
      ref: "Category",
    },
    reviewImages: {
      type: [String],
      default: [],
    },
    // Customer specific fields
    gender: {
      type: String,
      enum: ["", "male", "female", "other"],
      default: "",
    },
    preferences: {
      type: [ObjectId],
      default: [],
      ref: "Category",
    },
    notifications: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "archived"],
      default: "active",
    },
    fcmToken: {
      type: String,
      required: false,
    },
    fcmTokenWeb: {
      type: String,
      required: false,
    },
    notificationTokens: [
      {
        token: { type: String, required: true },
        channel: { type: String, enum: ["web", "android", "ios"], required: true },
        deviceId: { type: String, required: false },
        platform: { type: String, required: false },
        lastSeenAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
        revokedAt: { type: Date, default: null },
      },
    ],
    deviceId: {
      type: String,
      required: false,
    },
    channel: {
      type: String,
      enum: ["web", "android", "ios"],
      default: "web",
    },
    websiteLink: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    facebookLink: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    instagramLink: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    linkedinLink: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    tiktokLink: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    profilePercentage: {
      type: Number,
      default: 0,
    },
    loginAttempts: { type: Number, default: 0 },

    lockedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    loginAt: { type: Date, default: Date.now },

    createdBy: {
      type: ObjectId,
      default: null,
    },
    isManuallyCreated: {
      type: Boolean,
      default: false,
    },
    isPasswordCreated: {
      type: Boolean,
      default: true,
    },
    // Subscription fields
    subscriptionStatus: {
      type: String,
      enum: ["inactive", "active", "past_due", "canceled", "trialing", "incomplete"],
      default: "inactive",
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    stripeSessionId: {
      type: String,
      default: null,
    },
    subscriptionId: {
      type: String,
      default: null,
    },
    stripePayments: [{
  type: Schema.Types.ObjectId,
  ref: 'StripePayment'
}],
    subscriptionStartDate: {
      type: Date,
      default: null,
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },
    subscriptionAmount: {
      type: Number,
      default: null, // Amount in cents
    },
    subscriptionCurrency: {
      type: String,
      default: "aud",
    },
    subscriptionType: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    stripePriceId: {
      type: String,
      default: null,
    },
    lastPaymentDate: {
      type: Date,
      default: null,
    },
    nextBillingDate: {
      type: Date,
      default: null,
    },
    appliedCouponCode: {
      type: String,
      default: null,
    },
    couponDiscount: {
      type: Number,
      default: null, // Discount amount or percentage
    },
  },
  { toJSON: { virtuals: true } }
);

userSchema.virtual("avatarUrl").get(function () {
  return this.avatar.fileName;
});

userSchema.virtual("role", {
  ref: "Role",
  localField: "roleId",
  foreignField: "_id",
  justOne: true,
});

userSchema.virtual("trade", {
  ref: "Trade",
  localField: "tradeId",
  foreignField: "_id",
  justOne: true,
});

userSchema.virtual("isLocked").get(function () {
  const now = moment();
  const diff = now.diff(moment(this.lockedAt), "minutes");
  return !!(this.lockedAt && diff < 10);
});

userSchema.methods.incrementLoginAttempts = async function () {
  const now = moment();
  const diff = now.diff(moment(this.lockedAt), "minutes");
  const lockExpired = !!(this.lockedAt && diff > 10);

  if (lockExpired) {
    await this.updateOne({
      $set: { loginAttempts: 0 },
      $unset: { lockedAt: 1 },
    });
    return;
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const needToLock = !!(this.loginAttempts + 1 >= 10 && !this.isLocked);

  if (needToLock) {
    updates.$set = { lockedAt: moment() };
  }

  await this.updateOne(updates);
  return;
};

module.exports = model("Customer", userSchema, "customers");
