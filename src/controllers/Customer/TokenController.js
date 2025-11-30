const Customer = require("../../models/Customers");
const sanitize = require("mongo-sanitize");
const logger = require("../../helpers/logger").child({ module: "TokenController" });
const { sendResponse, checkKeysExist } = require("../../helpers/utils");

module.exports = {
  registerToken,
  removeToken,
  updateFcmToken,
  getTokens,
  toggleNotifications,
  getNotificationSettings,
};

async function registerToken(request, response) {
  try {
    const userId = request?.user?._id;
    const { token, channel, deviceId, platform } = request.body;

    // Validation
    const requiredFields = ["token", "channel"];
    const missingFields = checkKeysExist({ token, channel }, requiredFields);
    if (missingFields) {
      return sendResponse(response, "Token Registration", 422, 0, missingFields);
    }

    if (!["web", "android", "ios"].includes(channel)) {
      return sendResponse(response, "Token Registration", 422, 0, "Invalid channel. Must be web, android, or ios");
    }

    if (!token || token.length < 10) {
      return sendResponse(response, "Token Registration", 422, 0, "Invalid token format");
    }

    // Sanitize inputs
    const sanitizedData = {
      token: sanitize(token),
      channel: sanitize(channel),
      deviceId: deviceId ? sanitize(deviceId) : null,
      platform: platform ? sanitize(platform) : null,
    };

    // Find existing token by token string or deviceId
    const user = await Customer.findById(userId);
    if (!user) {
      return sendResponse(response, "Token Registration", 422, 0, "User not found");
    }

    const now = new Date();
    const existingTokenIndex = user.notificationTokens.findIndex(
      (t) => t.token === sanitizedData.token || (sanitizedData.deviceId && t.deviceId === sanitizedData.deviceId)
    );

    if (existingTokenIndex >= 0) {
      // Update existing token
      user.notificationTokens[existingTokenIndex] = {
        ...user.notificationTokens[existingTokenIndex],
        token: sanitizedData.token,
        channel: sanitizedData.channel,
        deviceId: sanitizedData.deviceId,
        platform: sanitizedData.platform,
        lastSeenAt: now,
        revokedAt: null, // Reactivate if was revoked
      };
    } else {
      // Add new token
      user.notificationTokens.push({
        token: sanitizedData.token,
        channel: sanitizedData.channel,
        deviceId: sanitizedData.deviceId,
        platform: sanitizedData.platform,
        lastSeenAt: now,
        createdAt: now,
        revokedAt: null,
      });
    }

    // Limit to 10 tokens per user to prevent abuse
    if (user.notificationTokens.length > 10) {
      // Remove oldest tokens (keep newest 10)
      user.notificationTokens.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
      user.notificationTokens = user.notificationTokens.slice(0, 10);
    }

    await user.save();

    logger.info("Token registered successfully", {
      userId: userId?.toString(),
      channel: sanitizedData.channel,
      deviceId: sanitizedData.deviceId,
      tokenCount: user.notificationTokens.length,
    });

    return sendResponse(response, "Token Registration", 200, 1, "Token registered successfully", {
      tokenCount: user.notificationTokens.length,
      channel: sanitizedData.channel,
    });
  } catch (error) {
    logger.error("Token registration failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "Token Registration", 500, 0, "Something went wrong, please try again later.");
  }
}

async function removeToken(request, response) {
  try {
    const userId = request?.user?._id;
    const { token, deviceId } = request.body;

    if (!token && !deviceId) {
      return sendResponse(response, "Token Removal", 422, 0, "Either token or deviceId is required");
    }

    const user = await Customer.findById(userId);
    if (!user) {
      return sendResponse(response, "Token Removal", 422, 0, "User not found");
    }

    const initialCount = user.notificationTokens.length;
    
    // Remove token by token string or deviceId
    user.notificationTokens = user.notificationTokens.filter(
      (t) => t.token !== sanitize(token) && t.deviceId !== sanitize(deviceId)
    );

    const removedCount = initialCount - user.notificationTokens.length;
    await user.save();

    logger.info("Token removed successfully", {
      userId: userId?.toString(),
      removedCount,
      remainingCount: user.notificationTokens.length,
    });

    return sendResponse(response, "Token Removal", 200, 1, "Token removed successfully", {
      removedCount,
      remainingCount: user.notificationTokens.length,
    });
  } catch (error) {
    logger.error("Token removal failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "Token Removal", 500, 0, "Something went wrong, please try again later.");
  }
}

async function updateFcmToken(request, response) {
  try {
    const userId = request?.user?._id;
    const { fcmToken, channel = "android" } = request.body;

    if (!fcmToken) {
      return sendResponse(response, "FCM Token Update", 422, 0, "FCM token is required");
    }

    const user = await Customer.findById(userId);
    if (!user) {
      return sendResponse(response, "FCM Token Update", 422, 0, "User not found");
    }

    // Update legacy field for backward compatibility
    user.fcmToken = sanitize(fcmToken);

    // Also add to notificationTokens array
    const now = new Date();
    const existingTokenIndex = user.notificationTokens.findIndex((t) => t.token === fcmToken);

    if (existingTokenIndex >= 0) {
      user.notificationTokens[existingTokenIndex].lastSeenAt = now;
      user.notificationTokens[existingTokenIndex].revokedAt = null;
    } else {
      user.notificationTokens.push({
        token: sanitize(fcmToken),
        channel: sanitize(channel),
        deviceId: user.deviceId || null,
        platform: channel === "android" ? "Android" : channel === "ios" ? "iOS" : "Web",
        lastSeenAt: now,
        createdAt: now,
        revokedAt: null,
      });
    }

    await user.save();

    logger.info("FCM token updated successfully", {
      userId: userId?.toString(),
      channel,
      tokenCount: user.notificationTokens.length,
    });

    return sendResponse(response, "FCM Token Update", 200, 1, "FCM token updated successfully", {
      tokenCount: user.notificationTokens.length,
    });
  } catch (error) {
    logger.error("FCM token update failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "FCM Token Update", 500, 0, "Something went wrong, please try again later.");
  }
}

async function getTokens(request, response) {
  try {
    const userId = request?.user?._id;

    const user = await Customer.findById(userId).select("notificationTokens fcmToken fcmTokenWeb");
    if (!user) {
      return sendResponse(response, "Token List", 422, 0, "User not found");
    }

    // Return active tokens only (not revoked)
    const activeTokens = user.notificationTokens.filter((t) => !t.revokedAt);

    return sendResponse(response, "Token List", 200, 1, "Tokens fetched successfully", {
      tokens: activeTokens.map((t) => ({
        channel: t.channel,
        deviceId: t.deviceId,
        platform: t.platform,
        lastSeenAt: t.lastSeenAt,
        createdAt: t.createdAt,
        // Don't expose full token for security
        tokenSuffix: t.token.slice(-6),
      })),
      legacyFcmToken: user.fcmToken ? user.fcmToken.slice(-6) : null,
      legacyFcmTokenWeb: user.fcmTokenWeb ? user.fcmTokenWeb.slice(-6) : null,
      totalActiveTokens: activeTokens.length,
    });
  } catch (error) {
    logger.error("Get tokens failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "Token List", 500, 0, "Something went wrong, please try again later.");
  }
}

async function toggleNotifications(request, response) {
  try {
    const userId = request?.user?._id;
    const { enabled } = request.body;

    // Validation
    if (typeof enabled !== "boolean") {
      return sendResponse(response, "Notification Toggle", 422, 0, "enabled field must be a boolean (true/false)");
    }

    const user = await Customer.findById(userId);
    if (!user) {
      return sendResponse(response, "Notification Toggle", 422, 0, "User not found");
    }

    // Update notification preference
    user.notifications = enabled;
    await user.save();

    logger.info("Notification preference updated", {
      userId: userId?.toString(),
      enabled,
      previousState: user.notifications !== enabled ? !enabled : enabled,
    });

    return sendResponse(response, "Notification Toggle", 200, 1, `Notifications ${enabled ? 'enabled' : 'disabled'} successfully`, {
      notificationsEnabled: enabled,
      activeTokensCount: user.notificationTokens.filter(t => !t.revokedAt).length,
    });
  } catch (error) {
    logger.error("Notification toggle failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "Notification Toggle", 500, 0, "Something went wrong, please try again later.");
  }
}

async function getNotificationSettings(request, response) {
  try {
    const userId = request?.user?._id;

    const user = await Customer.findById(userId).select("notifications notificationTokens");
    if (!user) {
      return sendResponse(response, "Notification Settings", 422, 0, "User not found");
    }

    const activeTokensCount = user.notificationTokens.filter(t => !t.revokedAt).length;

    return sendResponse(response, "Notification Settings", 200, 1, "Notification settings fetched successfully", {
      notificationsEnabled: user.notifications,
      activeTokensCount,
      hasActiveTokens: activeTokensCount > 0,
    });
  } catch (error) {
    logger.error("Get notification settings failed", { error: error?.message, userId: request?.user?._id?.toString() });
    return sendResponse(response, "Notification Settings", 500, 0, "Something went wrong, please try again later.");
  }
}
