const moment = require("moment");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const sanitize = require("mongo-sanitize");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { XMLParser } = require("fast-xml-parser");
const salt = parseInt(process.env.SALT);

const UserModel = require("../../models/Customers");
const Role = require("../../models/Role");
const AccessToken = require("../../models/OauthToken");
const RefreshToken = require("../../models/OauthRefreshToken");
const OtpModel = require("../../models/Otp");

const systemLogsHelper = require("../../helpers/system-logs");
const {
  sendResponse,
  checkKeysExist,
  setUserResponse,
  verifyGoogleIdToken, 
  verifyAppleIdToken,
  sendEmailVerification
} = require("../../helpers/utils");

let moduleName = "Authentication";
let lang = "english";
let channel = "web";

module.exports = {
  login,
  signup,
  logout,
  logoutAllDevices,
  forgetPassword,
  sendOtpToPhone,
  verifyOtp,
  verifyOtpAndResetPassword,
  refreshToken,
  verifyEmail
};

async function signup(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const params = request.body;
    const isSocial = !!params.provider;

    const requiredFields = ["fullName", "email", "role"];
    if (isSocial) {
      requiredFields.push("idToken");
    } else {
      requiredFields.push("password", "phoneNumber");
    }

    const checkKeys = await checkKeysExist(params, requiredFields);
    if (checkKeys) {
      return sendResponse(response, moduleName, 422, 0, checkKeys);
    }

    // Check uniqueness for email and optional phone in one query
    const uniqueOrConditions = [{ email: sanitize(params.email) }];
    if (params.phoneNumber) {
      uniqueOrConditions.push({ phoneNumber: sanitize(params.phoneNumber) });
    }
    const existingUser = await UserModel.findOne({ $or: uniqueOrConditions }).select("email phoneNumber");
    if (existingUser) {
      return sendResponse(
        response,
        moduleName,
        422,
        0,
        "User already exists with this email or phone number"
      );
    }

    const getRole = await Role.findOne({ title: params.role });
    if (!getRole) {
      return sendResponse(response, moduleName, 400, 0, "Invalid role");
    }

    const user = new UserModel({
      fullName: params.fullName,
      email: params.email,
      phoneNumber: params.phoneNumber || null,
      channel: request.header("channel") || "web",
      roleId: params.roleId ? params.roleId : getRole._id,
      isPasswordCreated: !!params.password,
    });

    if (isSocial) {
      let verifiedPayload;

      if (params.provider === "google") {
        verifiedPayload = await verifyGoogleIdToken(params.idToken);
      } else if (params.provider === "apple") {
        verifiedPayload = await verifyAppleIdToken(params.idToken);
      } else {
        return sendResponse(response, moduleName, 400, 0, "Invalid provider");
      }

      if (verifiedPayload.email !== params.email) {
        return sendResponse(response, moduleName, 401, 0, "Email mismatch");
      }

      user.authProvider = params.provider;
    }

    else if (params.password) {
      const hashPin = await bcrypt.hash(params.password, salt);
      user.password = hashPin;
      user.authProvider = "manual";
    }
    else {
      return sendResponse(response, moduleName, 422, 0, "Password or Social Login required");
    }

    const data = await user.save();

    // Send email verification for manual signups only
    // if (data.authProvider === "manual") {
    //   try {
    //     await sendEmailVerification(data.email, data._id);
    //   } catch (emailError) {
    //     console.error("Failed to send verification email:", emailError);
    //     // Don't fail the signup if email sending fails
    //   }
    // }

    await systemLogsHelper.composeSystemLogs({
      userId: data._id,
      userIp: request.ip,
      roleId: data.roleId,
      module: moduleName,
      action: "signup",
      data,
    });

    const getResp = await setUserResponse(data);
    return sendResponse(response, moduleName, 200, 1, "User registered successfully", getResp);

  } catch (error) {
    console.log("Signup process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function login(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const { email, password, idToken, provider } = request.body;
    const isSocial = !!provider;

    const requiredFields = ["email"];
    if (isSocial) {
      requiredFields.push("idToken");
    } else {
      requiredFields.push("password");
    }

    const missingKeys = await checkKeysExist(request.body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, moduleName, 422, 0, missingKeys);
    }

    const user = await UserModel.findOne({ email: sanitize(email) });
    if (!user) {
      return sendResponse(response, moduleName, 422, 0, "Invalid email");
    }

    if (user.status !== "active") {
      return sendResponse(response, moduleName, 422, 0, `Your account is ${user.status}`);
    }

    if (user.isLocked) {
      const lockUntil = moment(user.lockedAt).add(10, "minutes").format("LT z");
      return sendResponse(response, moduleName, 422, 0, `User is locked until ${lockUntil}`);
    }

    const role = await Role.findById(sanitize(user.roleId));
    if (role && role.status === "archived") {
      return sendResponse(response, moduleName, 422, 0, "Role is archived");
    }

    if (isSocial) {
      let verifiedPayload;
      if (provider === "google") {
        verifiedPayload = await verifyGoogleIdToken(idToken);
      } else if (provider === "apple") {
        verifiedPayload = await verifyAppleIdToken(idToken);
      } else {
        return sendResponse(response, moduleName, 400, 0, "Invalid provider");
      }

      if (verifiedPayload.email !== email) {
        return sendResponse(response, moduleName, 401, 0, "Email mismatch");
      }

      // Check and update subscription expiry before generating response
      if (user.subscriptionEndDate && (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing')) {
        const now = new Date();
        const endDate = new Date(user.subscriptionEndDate);
        
        if (now > endDate) {
          console.log(`Subscription expired for user ${user._id} during OAuth login, updating status`);
          // Update the user object for response generation and database update
          user.subscriptionStatus = 'past_due';
          await UserModel.findByIdAndUpdate(user._id, { subscriptionStatus: 'past_due' });
        }
      }

      const getResp = await setUserResponse(user);

      await UserModel.findByIdAndUpdate(
        user._id,
        { loginAttempts: 0, loginAt: new Date(), $unset: { lockedAt: 1 } },
        { useFindAndModify: false }
      );

      await systemLogsHelper.composeSystemLogs({
        userId: user._id,
        userIp: request.ip,
        roleId: user.roleId,
        module: moduleName,
        action: "login",
        data: getResp,
      });

      return sendResponse(response, moduleName, 200, 1, "Login successful", getResp);
    }

    if (password && bcrypt.compareSync(password, user.password)) {
      // Check and update subscription expiry before generating response
      if (user.subscriptionEndDate && (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing')) {
        const now = new Date();
        const endDate = new Date(user.subscriptionEndDate);
        
        if (now > endDate) {
          console.log(`Subscription expired for user ${user._id} during password login, updating status`);
          // Update the user object for response generation and database update
          user.subscriptionStatus = 'past_due';
          await UserModel.findByIdAndUpdate(user._id, { subscriptionStatus: 'past_due' });
        }
      }

      const getResp = await setUserResponse(user);

      await UserModel.findByIdAndUpdate(
        user._id,
        { loginAttempts: 0, loginAt: new Date(), $unset: { lockedAt: 1 } },
        { useFindAndModify: false }
      );

      await systemLogsHelper.composeSystemLogs({
        userId: user._id,
        userIp: request.ip,
        roleId: user.roleId,
        module: moduleName,
        action: "login",
        data: getResp,
      });

      return sendResponse(response, moduleName, 200, 1, "Login successful", getResp);
    } else {
      await user.incrementLoginAttempts();
      return sendResponse(response, moduleName, 422, 0, "Invalid password");
    }
  } catch (error) {
    console.log("Login process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function logout(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    let userId = request?.user?._id;
    
    // Get the authorization header
    const authHeader = request.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendResponse(
        response,
        moduleName,
        400,
        0,
        "Invalid authorization header"
      );
    }

    // Extract token from Bearer header
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    // Decode JWT token to get accessTokenId
    let currentAccessTokenId;
    try {
      const decoded = jwt.verify(token, process.env.CLIENT_SECRET);
      currentAccessTokenId = decoded.accessTokenId;
    } catch (jwtError) {
      console.log("JWT decode error:", jwtError);
      return sendResponse(
        response,
        moduleName,
        400,
        0,
        "Invalid token format"
      );
    }
    
    if (!currentAccessTokenId) {
      return sendResponse(
        response,
        moduleName,
        400,
        0,
        "Invalid token for logout"
      );
    }

    // Revoke only the current access token (single device logout)
    let tokenUpdateResult = await AccessToken.findByIdAndUpdate(
      currentAccessTokenId,
      { revoked: true, revokedAt: moment(), updatedAt: moment() },
      { new: true }
    );

    if (!tokenUpdateResult) {
      return sendResponse(
        response,
        moduleName,
        404,
        0,
        "Token not found"
      );
    }

    // Revoke the associated refresh token for this specific access token
    await RefreshToken.findOneAndUpdate(
      { accessTokenId: currentAccessTokenId },
      { revoked: true, revokedAt: moment() }
    );

    let systemLogsData = {
      userId: userId,
      userIp: request.ip,
      roleId: "",
      module: moduleName,
      action: "logout_single_device",
      data: [],
    };
    let systemLogs = await systemLogsHelper.composeSystemLogs(systemLogsData);

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Customer has been logout successfully from this device"
    );
  } catch (error) {
    console.log("Exit process error:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function logoutAllDevices(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    let userId = request?.user?._id;
    
    if (!userId) {
      return sendResponse(
        response,
        moduleName,
        400,
        0,
        "User not authenticated"
      );
    }

    // Find all active access tokens for the user
    let activeTokens = await AccessToken.find({ 
      userId: userId, 
      revoked: false 
    });

    // Revoke all access tokens for the user
    let tokenUpdateResult = await AccessToken.updateMany(
      { userId: userId, revoked: false },
      { revoked: true, revokedAt: moment(), updatedAt: moment() }
    );

    // Revoke all refresh tokens associated with the user's access tokens
    if (activeTokens.length > 0) {
      let accessTokenIds = activeTokens.map(token => token._id);
      await RefreshToken.updateMany(
        { accessTokenId: { $in: accessTokenIds } },
        { revoked: true, revokedAt: moment() }
      );
    }

    let systemLogsData = {
      userId: userId,
      userIp: request.ip,
      roleId: "",
      module: moduleName,
      action: "logout_all_devices",
      data: [],
    };
    let systemLogs = await systemLogsHelper.composeSystemLogs(systemLogsData);

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Customer has been logout successfully from all devices"
    );
  } catch (error) {
    console.log("Logout all devices error:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

// Generate random OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via SMS (commented for testing)
async function sendOTPToSMS(phoneNumber, otp) {
  // TODO: Implement SMS service
  // Example: Twilio, AWS SNS, etc.
  console.log(`SMS OTP to ${phoneNumber}: ${otp}`);
  return true;
}

// Send OTP via Email (commented for testing)
async function sendOTPToEmail(email, otp) {
  // TODO: Implement Email service
  // Example: SendGrid, AWS SES, Nodemailer, etc.
  console.log(`Email OTP to ${email}: ${otp}`);
  return true;
}

async function forgetPassword(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const { email } = request.body;

    // Validate required fields
    const requiredFields = ["email"];
    const missingKeys = await checkKeysExist(request.body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, moduleName, 422, 0, missingKeys);
    }

    // Find user by email
    const user = await UserModel.findOne({ email: sanitize(email) });
    if (!user) {
      return sendResponse(response, moduleName, 404, 0, "User not found with this email");
    }

    // Check if user has a password (not social login)
    if (!user.password) {
      return sendResponse(
        response,
        moduleName,
        422,
        0,
        "Password reset not allowed for social login users"
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = moment().add(2, "minutes").toDate();

    // Invalidate any existing OTPs for this email
    await OtpModel.updateMany(
      { email: sanitize(email), type: "forget_password" },
      { isUsed: true }
    );

    // Save new OTP
    const otpRecord = new OtpModel({
      userId: user._id,
      email: sanitize(email),
      phoneNumber: user.phoneNumber,
      otp: otp,
      type: "forget_password",
      expiresAt: expiresAt,
    });

    await otpRecord.save();

    // Send OTP via SMS and Email (commented for testing)
    try {
      if (user.phoneNumber) {
        await sendOTPToSMS(user.phoneNumber, otp);
      }
      await sendOTPToEmail(email, otp);
    } catch (sendError) {
      console.log("Error sending OTP:", sendError);
      // Don't fail the request if sending fails during testing
    }

    await systemLogsHelper.composeSystemLogs({
      userId: user._id,
      userIp: request.ip,
      roleId: user.roleId,
      module: moduleName,
      action: "forget_password_request",
      data: { email: sanitize(email) },
    });

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "OTP sent successfully to your registered phone number and email",
      { 
        message: "OTP sent successfully",
        expiresIn: "2 minutes",
        // For testing purposes, include OTP in response
        otp: otp 
      }
    );
  } catch (error) {
    console.log("Forget password process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function sendOtpToPhone(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const { phoneNumber } = request.body;

    // Validate required fields
    const requiredFields = ["phoneNumber"];
    const missingKeys = await checkKeysExist(request.body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, moduleName, 422, 0, missingKeys);
    }

    // Check if phone number is already registered (for signup flow - prevent duplicate)
    const existingUser = await UserModel.findOne({ phoneNumber: sanitize(phoneNumber) });
    if (existingUser) {
      return sendResponse(
        response,
        moduleName,
        422,
        0,
        "Phone number is already registered. Please use a different phone number or login."
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = moment().add(5, "minutes").toDate(); // 5 minutes expiry

    // Invalidate any existing OTPs for this phone number (for signup flow, no userId yet)
    await OtpModel.updateMany(
      { 
        phoneNumber: sanitize(phoneNumber), 
        type: "phone_verification",
        isUsed: false
      },
      { isUsed: true }
    );

    // Save new OTP (for signup, userId and email are optional)
    const otpRecord = new OtpModel({
      phoneNumber: sanitize(phoneNumber),
      otp: otp,
      type: "phone_verification",
      expiresAt: expiresAt,
      // userId and email are optional for phone_verification during signup
    });

    await otpRecord.save();

    // Send OTP via SMS (console for now - TODO: Implement SMS service)
    try {
      await sendOTPToSMS(sanitize(phoneNumber), otp);
      console.log(`📱 Phone Verification OTP sent to ${phoneNumber}: ${otp}`);
    } catch (sendError) {
      console.log("Error sending OTP:", sendError);
      // Don't fail the request if sending fails during testing
    }

    // Log system action (no userId for signup flow)
    await systemLogsHelper.composeSystemLogs({
      userId: null,
      userIp: request.ip,
      roleId: null,
      module: moduleName,
      action: "send_phone_verification_otp_signup",
      data: { phoneNumber: sanitize(phoneNumber) },
    });

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "OTP sent successfully to your phone number for verification",
      { 
        message: "OTP sent successfully",
        expiresIn: "5 minutes",
        // For testing purposes, include OTP in response
        otp: otp 
      }
    );
  } catch (error) {
    console.log("Send OTP to phone verification failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function verifyOtp(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const { email, phoneNumber, otp } = request.body;

    // Infer OTP type from provided fields
    const otpType = email ? "forget_password" : (phoneNumber ? "phone_verification" : null);

    if (!otpType) {
      return sendResponse(response, moduleName, 422, 0, "Email or phone number is required");
    }

    // Email-based (forget_password)
    if (email) {
      const requiredFields = ["email", "otp"];
      const missingKeys = await checkKeysExist(request.body, requiredFields);
      if (missingKeys) {
        return sendResponse(response, moduleName, 422, 0, missingKeys);
      }

      const user = await UserModel.findOne({ email: sanitize(email) });
      if (!user) {
        return sendResponse(response, moduleName, 404, 0, "User not found");
      }

      const otpRecord = await OtpModel.findOne({
        userId: user._id,
        email: sanitize(email),
        otp: otp,
        type: otpType,
        isUsed: false,
        expiresAt: { $gt: new Date() }
      });

      if (!otpRecord) {
        return sendResponse(response, moduleName, 422, 0, "Invalid or expired OTP");
      }

      await systemLogsHelper.composeSystemLogs({
        userId: user._id,
        userIp: request.ip,
        roleId: user.roleId,
        module: moduleName,
        action: "otp_verification_success",
        data: { email: sanitize(email), type: otpType },
      });

      return sendResponse(response, moduleName, 200, 1, "OTP verified successfully", {
        verified: true,
        userId: user._id,
        email: sanitize(email),
        type: otpType,
      });
    }

    // Phone-based (phone_verification)
    if (phoneNumber) {
      if (!otp) {
        return sendResponse(response, moduleName, 422, 0, "OTP is required");
      }

      const otpQuery = {
        phoneNumber: sanitize(phoneNumber),
        otp: otp,
        type: otpType,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      };

      const existingUser = await UserModel.findOne({ phoneNumber: sanitize(phoneNumber) });
      if (existingUser) {
        otpQuery.userId = existingUser._id;
      } else {
        otpQuery.userId = null;
      }

      const otpRecord = await OtpModel.findOne(otpQuery);
      if (!otpRecord) {
        return sendResponse(response, moduleName, 422, 0, "Invalid or expired OTP");
      }

      if (otpType === "phone_verification") {
        await otpRecord.markAsUsed();
      }

      const logUserId = existingUser ? existingUser._id : null;
      const logRoleId = existingUser ? existingUser.roleId : null;
      await systemLogsHelper.composeSystemLogs({
        userId: logUserId,
        userIp: request.ip,
        roleId: logRoleId,
        module: moduleName,
        action: existingUser ? "phone_otp_verification_success" : "phone_otp_verification_success_signup",
        data: { phoneNumber: sanitize(phoneNumber), type: otpType },
      });

      return sendResponse(response, moduleName, 200, 1, "OTP verified successfully", {
        verified: true,
        userId: existingUser ? existingUser._id : null,
        phoneNumber: sanitize(phoneNumber),
        type: otpType,
        isExistingUser: !!existingUser,
      });
    }
  } catch (error) {
    console.log("Verify OTP process failed:", error);
    return sendResponse(response, moduleName, 500, 0, "Something went wrong, please try again later.");
  }
}

async function verifyOtpAndResetPassword(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const { email, otp, newPassword } = request.body;

    // Validate required fields
    const requiredFields = ["email", "otp", "newPassword"];
    const missingKeys = await checkKeysExist(request.body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, moduleName, 422, 0, missingKeys);
    }

    // Validate new password length
    if (newPassword.length < 6) {
      return sendResponse(
        response,
        moduleName,
        422,
        0,
        "New password must be at least 6 characters long"
      );
    }

    // Find user by email
    const user = await UserModel.findOne({ email: sanitize(email) });
    if (!user) {
      return sendResponse(response, moduleName, 404, 0, "User not found");
    }

    // Find valid OTP
    const otpRecord = await OtpModel.findOne({
      userId: user._id,
      email: sanitize(email),
      otp: otp,
      type: "forget_password",
      isUsed: false,
      // expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return sendResponse(
        response,
        moduleName,
        422,
        0,
        "Invalid or expired OTP"
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);

    // Update user password
    await UserModel.findByIdAndUpdate(
      user._id,
      { 
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    );

    // Mark OTP as used
    await otpRecord.markAsUsed();

    await systemLogsHelper.composeSystemLogs({
      userId: user._id,
      userIp: request.ip,
      roleId: user.roleId,
      module: moduleName,
      action: "password_reset_success",
      data: { email: sanitize(email) },
    });

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Password reset successfully",
      { userId: user._id }
    );
  } catch (error) {
    console.log("Verify OTP and reset password process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function refreshToken(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const { refreshToken } = request.body;

    // Validate required fields
    const requiredFields = ["refreshToken"];
    const missingKeys = await checkKeysExist(request.body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, moduleName, 422, 0, missingKeys);
    }

    // Decode and verify refresh token JWT
    let decodedRefreshToken;
    try {
      decodedRefreshToken = jwt.verify(sanitize(refreshToken), process.env.CLIENT_SECRET);
    } catch (jwtError) {
      return sendResponse(
        response,
        moduleName,
        401,
        0,
        "Invalid or expired refresh token"
      );
    }

    // Find user from refresh token payload
    const user = await UserModel.findById(decodedRefreshToken.userId);
    if (!user) {
      return sendResponse(response, moduleName, 404, 0, "User not found");
    }

    if (user.status !== "active") {
      return sendResponse(response, moduleName, 422, 0, `Your account is ${user.status}`);
    }

    // Check if user has any active access tokens
    const activeAccessTokens = await AccessToken.find({
      userId: user._id,
      revoked: false,
      expiresAt: { $gt: new Date() }
    });

    if (activeAccessTokens.length === 0) {
      return sendResponse(
        response,
        moduleName,
        401,
        0,
        "No active session found"
      );
    }

    // Find the specific refresh token record that matches the provided token
    const specificRefreshToken = await RefreshToken.findOne({
      token: sanitize(refreshToken),
      revoked: false,
      expiredAt: { $gt: new Date() }
    });

    if (!specificRefreshToken) {
      return sendResponse(
        response,
        moduleName,
        401,
        0,
        "Refresh token has been revoked or expired"
      );
    }

    // Verify that this refresh token belongs to an active access token
    const associatedAccessToken = activeAccessTokens.find(
      token => token._id.toString() === specificRefreshToken.accessTokenId.toString()
    );

    if (!associatedAccessToken) {
      return sendResponse(
        response,
        moduleName,
        401,
        0,
        "Associated access token is no longer active"
      );
    }

    // Generate new tokens using existing setUserResponse function
    const getResp = await setUserResponse(user);

    await systemLogsHelper.composeSystemLogs({
      userId: user._id,
      userIp: request.ip,
      roleId: user.roleId,
      module: moduleName,
      action: "token_refresh",
      data: { userId: user._id },
    });

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Tokens refreshed successfully",
      getResp
    );

  } catch (error) {
    console.log("Refresh token process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function verifyEmail(request, response) {
  try {
    const { token } = request.query;

    // Get current year for templates
    const currentYear = new Date().getFullYear();

    // Validate token exists
    if (!token) {
      const templatePath = path.join(__dirname, "../../helpers/emailVerifiedFailedTemplate.html");
      let failedTemplate = fs.readFileSync(templatePath, "utf8");
      failedTemplate = failedTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);
      return response.status(400).send(failedTemplate);
    }

    try {
      // Decode JWT token
      const decoded = jwt.verify(token, process.env.CLIENT_SECRET);
      
      // Verify token type
      if (decoded.type !== "email_verification") {
        throw new Error("Invalid token type");
      }

      const userId = decoded.userId;

      // Find user and update email validation status
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if already verified
      if (user.isEmailValidated) {
        const templatePath = path.join(__dirname, "../../helpers/emailAlreadyVerifiedTemplate.html");
        let alreadyVerifiedTemplate = fs.readFileSync(templatePath, "utf8");
        const currentYear = new Date().getFullYear();
        alreadyVerifiedTemplate = alreadyVerifiedTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);
        return response.status(200).send(alreadyVerifiedTemplate);
      }

      // Update email validation status
      user.isEmailValidated = true;
      await user.save();

      // Log the verification
      await systemLogsHelper.composeSystemLogs({
        userId: user._id,
        userIp: request.ip,
        roleId: user.roleId,
        module: moduleName,
        action: "email_verified",
        data: { email: user.email },
      });

      // Read and return success template
      const templatePath = path.join(__dirname, "../../helpers/emailVerifiedSuccessTemplate.html");
      let successTemplate = fs.readFileSync(templatePath, "utf8");
      const currentYear = new Date().getFullYear();
      successTemplate = successTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);
      
      return response.status(200).send(successTemplate);

    } catch (jwtError) {
      console.log("JWT verification error:", jwtError);
      const templatePath = path.join(__dirname, "../../helpers/emailVerifiedFailedTemplate.html");
      let failedTemplate = fs.readFileSync(templatePath, "utf8");
      const currentYear = new Date().getFullYear();
      failedTemplate = failedTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);
      return response.status(400).send(failedTemplate);
    }

  } catch (error) {
    console.log("Email verification process failed:", error);
    const templatePath = path.join(__dirname, "../../helpers/emailVerifiedFailedTemplate.html");
    let failedTemplate = fs.readFileSync(templatePath, "utf8");
    const currentYear = new Date().getFullYear();
    failedTemplate = failedTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);
    return response.status(500).send(failedTemplate);
  }
}