const Notification = require("../models/Notification");
const Customer = require("../models/Customers");
const { sendFcmToToken } = require("./firebaseService");
const logger = require("../helpers/logger").child({ module: "notificationService" });

function buildMessageByType(type, context = {}) {
  switch (type) {
    case "project_created":
      return {
        title: "New Project Available",
        message: `A new project '${context.projectTitle || ""}' matches your trade`,
      };
    case "quote_sent":
      return {
        title: "New Quote Received",
        message: `${context.tradieName || "A tradie"} sent a quotation`,
      };
    case "quote_accepted":
      return {
        title: "Quote Accepted",
        message: `Your quote was accepted by ${context.builderName || "builder"}`,
      };
    case "quote_rejected":
      return {
        title: "Quote Rejected",
        message: `Your quote was rejected by ${context.builderName || "builder"}`,
      };
    case "trade_completed":
      return {
        title: "Trade Marked Completed",
        message: `Trade '${context.tradeTitle || ""}' marked as completed`,
      };
    case "review_added":
      return {
        title: "New Review Added",
        message: `You received a new review on '${context.projectTitle || "project"}'`,
      };
    case "chat_created":
      return {
        title: "Chat Started",
        message: `A new chat was started for '${context.projectTitle || "project"}'`,
      };
    case "message_sent":
      return {
        title: "New Message",
        message: `${context.senderName || "Someone"} sent you a message`,
      };
    default:
      return { title: "Notification", message: context.message || "" };
  }
}

function getScreenByType(type, availableIds = {}, recipientRole = null) {
  const { projectId, quoteId, chatId } = availableIds;
  
  // Role-specific mappings
  if (recipientRole === "Tradie") {
    switch (type) {
      case "project_created":
        return "TradieProjects"; // Tradie sees new projects
      case "quote_accepted":
        return "QoutesApprovedStatus"; // Tradie sees accepted quotes
      case "quote_rejected":
        return "QuoteScreen"; // Tradie sees rejected quotes
      case "trade_completed":
        return "TradieProjects"; // Tradie sees completed trades
      case "review_added":
        return "TradieGetAllReviews"; // Tradie sees reviews
      case "message_sent":
      case "chat_created":
        return chatId ? "ChatScreen" : "ChatOrDiscussionsSceen";
      default:
        return "Notifications";
    }
  } else if (recipientRole === "Builder") {
    switch (type) {
      case "quote_sent":
        return quoteId ? "QuoteScreen" : "MyProject";
      case "message_sent":
      case "chat_created":
        return chatId ? "ChatScreen" : "ChatOrDiscussionsSceen";
      case "trade_completed":
        return projectId ? "MyProject" : "HOME";
      case "review_added":
        return "ReviewScreen";
      default:
        return "Notifications";
    }
  }
  
  // Fallback: Type-based mapping (when role not available)
  const typeMap = {
    "message_sent": chatId ? "ChatScreen" : "Notifications",
    "chat_created": "ChatOrDiscussionsSceen",
    "quote_sent": "QuoteScreen",
    "quote_accepted": "QoutesApprovedStatus",
    "quote_rejected": "QuoteScreen",
    "project_created": "Explore",
    "trade_completed": "MyProject",
    "review_added": "TradieGetAllReviews",
  };
  
  return typeMap[type] || "Notifications";
}

async function saveNotification(params) {
  const {
    type,
    recipientId,
    senderId,
    projectId,
    quoteId,
    chatId,
    meta = {},
    title,
    message,
  } = params;

  const { title: autoTitle, message: autoMessage } = buildMessageByType(type, meta);

  const payload = new Notification({
    type,
    recipientId,
    senderId: senderId || null,
    projectId: projectId || null,
    quoteId: quoteId || null,
    chatId: chatId || null,
    title: title || autoTitle,
    message: message || autoMessage,
    meta,
  });

  try {
    const saved = await payload.save();
    return { success: true, notification: saved };
  } catch (error) {
    logger.error("Notification save failed", { error: error?.message, type, recipientId });
    return { success: false, error: error?.message };
  }
}

async function sendPushToUser(recipientId, title, message, data = {}) {
  try {
    console.log("🔍 Looking up user for push notification", {
      recipientId: recipientId?.toString(),
      title,
      message: message?.substring(0, 50) + "...",
    });

    const user = await Customer.findById(recipientId).select("notificationTokens fcmToken fcmTokenWeb notifications");
    if (!user) {
      console.log("❌ User not found for push notification", { recipientId: recipientId?.toString() });
      return { success: false, error: "Recipient not found" };
    }
    
    console.log("👤 User found", {
      recipientId: recipientId?.toString(),
      notificationsEnabled: user.notifications,
      notificationTokensCount: user.notificationTokens?.length || 0,
      hasLegacyFcmToken: !!user.fcmToken,
      hasLegacyFcmTokenWeb: !!user.fcmTokenWeb,
    });

    if (user.notifications === false) {
      console.log("⏭️ User has notifications disabled", { recipientId: recipientId?.toString() });
      return { success: true, skipped: true, reason: "User disabled notifications" };
    }

    // Collect all active tokens (from new array + legacy fields)
    const tokens = [];
    
    // Add tokens from notificationTokens array (active only)
    const activeTokens = (user.notificationTokens || []).filter(t => !t.revokedAt);
    console.log("📱 Active notification tokens", {
      count: activeTokens.length,
      tokens: activeTokens.map(t => ({
        channel: t.channel,
        deviceId: t.deviceId,
        tokenSuffix: t.token?.slice(-6),
        lastSeenAt: t.lastSeenAt,
      })),
    });

    activeTokens.forEach(t => {
      if (t.token) tokens.push(t.token);
    });
    
    // Add legacy tokens if not already in array
    if (user.fcmToken && !tokens.includes(user.fcmToken)) {
      console.log("📱 Adding legacy FCM token", { tokenSuffix: user.fcmToken.slice(-6) });
      tokens.push(user.fcmToken);
    }
    if (user.fcmTokenWeb && !tokens.includes(user.fcmTokenWeb)) {
      console.log("🌐 Adding legacy FCM web token", { tokenSuffix: user.fcmTokenWeb.slice(-6) });
      tokens.push(user.fcmTokenWeb);
    }

    console.log("📤 Total tokens to send to", {
      recipientId: recipientId?.toString(),
      totalTokens: tokens.length,
      tokenSuffixes: tokens.map(t => t.slice(-6)),
    });

    if (tokens.length === 0) {
      console.log("❌ No FCM tokens available", { recipientId: recipientId?.toString() });
      return { success: false, error: "No FCM token available" };
    }

    const results = [];
    const invalidTokens = [];
    
    console.log("🚀 Starting FCM sends", {
      recipientId: recipientId?.toString(),
      totalTokens: tokens.length,
    });
    
    // Send to all tokens in parallel
    for (const token of tokens) {
      // Detect platform from activeTokens if available
      const tokenInfo = activeTokens.find(t => t.token === token);
      const platform = tokenInfo?.channel || (user.fcmToken === token ? "ios" : user.fcmTokenWeb === token ? "web" : null);
      
      // For iOS, assume production (TestFlight/App Store) by default
      // The app should send build environment when registering tokens
      const isProduction = platform === "ios" ? true : null; // Default to production for iOS
      
      console.log("📤 Sending to token", { 
        tokenSuffix: token.slice(-6),
        platform: platform || "unknown",
        isProduction: isProduction,
      });
      
      const res = await sendFcmToToken({ 
        token, 
        title, 
        body: message, 
        data,
        platform: platform || null,
        isProduction: isProduction,
      });
      
      results.push({ 
        tokenSuffix: token.slice(-6), 
        platform: platform || "unknown",
        ...res 
      });
      
      console.log("📤 Token send result", {
        tokenSuffix: token.slice(-6),
        platform: platform || "unknown",
        success: res.success,
        error: res.error,
      });
      
      // Track invalid tokens for cleanup
      if (!res.success && (res.error?.includes('invalid') || res.error?.includes('expired'))) {
        invalidTokens.push(token);
        console.log("🗑️ Marking token as invalid for cleanup", { tokenSuffix: token.slice(-6) });
      }
    }
    
    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
      try {
        console.log("🧹 Cleaning up invalid tokens", {
          recipientId: recipientId?.toString(),
          invalidCount: invalidTokens.length,
          invalidTokenSuffixes: invalidTokens.map(t => t.slice(-6)),
        });

        await Customer.findByIdAndUpdate(recipientId, {
          $pull: { 
            notificationTokens: { token: { $in: invalidTokens } }
          }
        });
        
        // Also clear legacy fields if they're invalid
        if (invalidTokens.includes(user.fcmToken)) {
          await Customer.findByIdAndUpdate(recipientId, { $unset: { fcmToken: 1 } });
          console.log("🗑️ Cleared invalid legacy FCM token");
        }
        if (invalidTokens.includes(user.fcmTokenWeb)) {
          await Customer.findByIdAndUpdate(recipientId, { $unset: { fcmTokenWeb: 1 } });
          console.log("🗑️ Cleared invalid legacy FCM web token");
        }
        
        logger.info("Cleaned up invalid tokens", { 
          recipientId: recipientId?.toString(), 
          invalidCount: invalidTokens.length 
        });
      } catch (cleanupError) {
        console.log("❌ Token cleanup failed", { error: cleanupError?.message });
        logger.error("Token cleanup failed", { error: cleanupError?.message });
      }
    }
    
    const anySuccess = results.some(r => r.success);
    const successCount = results.filter(r => r.success).length;
    
    console.log("📊 FCM send summary", {
      recipientId: recipientId?.toString(),
      totalTokens: tokens.length,
      successCount,
      failureCount: tokens.length - successCount,
      invalidTokensCleaned: invalidTokens.length,
      anySuccess,
    });

    if (!anySuccess) {
      console.log("❌ All FCM attempts failed", { 
        recipientId: recipientId?.toString(),
        results: results.map(r => ({ tokenSuffix: r.tokenSuffix, success: r.success, error: r.error }))
      });
      logger.error("All FCM attempts failed", { recipientId, results });
    } else {
      console.log("✅ FCM push completed successfully", { 
        recipientId: recipientId?.toString(), 
        totalTokens: tokens.length,
        successCount,
        invalidCount: invalidTokens.length
      });
      logger.info("FCM push completed", { 
        recipientId: recipientId?.toString(), 
        totalTokens: tokens.length,
        successCount: results.filter(r => r.success).length,
        invalidCount: invalidTokens.length
      });
    }
    
    return { success: anySuccess, results, invalidTokensCleaned: invalidTokens.length };
  } catch (error) {
    console.log("❌ sendPushToUser failed", { 
      error: error?.message,
      recipientId: recipientId?.toString(),
    });
    logger.error("sendPushToUser failed", { error: error?.message, recipientId });
    return { success: false, error: error?.message };
  }
}

async function notify(params) {
  const logger = require("../helpers/logger").child({ module: "notificationService" });
  
  logger.info("Notification triggered", {
    type: params.type,
    recipientId: params.recipientId?.toString(),
    senderId: params.senderId?.toString(),
    projectId: params.projectId?.toString(),
    quoteId: params.quoteId?.toString(),
    chatId: params.chatId?.toString(),
  });

  const saveRes = await saveNotification(params);
  logger.info("Notification saved to database", {
    success: saveRes.success,
    notificationId: saveRes?.notification?._id?.toString(),
    error: saveRes.error,
  });

  // Fetch recipient role for better screen mapping
  let recipientRole = null;
  try {
    const recipient = await Customer.findById(params.recipientId)
      .populate("role")
      .select("role")
      .lean();
    recipientRole = recipient?.role?.title || null;
  } catch (roleError) {
    logger.warn("Failed to fetch recipient role", { error: roleError?.message });
  }

  const title = params.title || saveRes?.notification?.title;
  const message = params.message || saveRes?.notification?.message;
  
  const availableIds = {
    projectId: params.projectId,
    quoteId: params.quoteId,
    chatId: params.chatId,
  };
  
  const screen = getScreenByType(params.type, availableIds, recipientRole);
  
  const data = {
    type: params.type,
    notificationId: String(saveRes?.notification?._id || ""),
    projectId: params.projectId ? String(params.projectId) : "",
    quoteId: params.quoteId ? String(params.quoteId) : "",
    chatId: params.chatId ? String(params.chatId) : "",
    senderId: params.senderId ? String(params.senderId) : "",
    
    // Navigation data
    screen: screen,
    action: "navigate",
  };

  logger.info("Sending push notification", {
    recipientId: params.recipientId?.toString(),
    title,
    message: message?.substring(0, 50) + "...",
    dataKeys: Object.keys(data),
    screen: screen,
    recipientRole: recipientRole,
  });

  const pushRes = await sendPushToUser(params.recipientId, title, message, data);
  
  logger.info("Push notification result", {
    recipientId: params.recipientId?.toString(),
    success: pushRes.success,
    skipped: pushRes.skipped,
    reason: pushRes.reason,
    totalTokens: pushRes.results?.length || 0,
    successCount: pushRes.results?.filter(r => r.success).length || 0,
    invalidTokensCleaned: pushRes.invalidTokensCleaned || 0,
    errors: pushRes.results?.filter(r => !r.success).map(r => r.error) || [],
  });

  return { saved: saveRes, pushed: pushRes };
}

module.exports = {
  buildMessageByType,
  getScreenByType,
  saveNotification,
  sendPushToUser,
  notify,
};


