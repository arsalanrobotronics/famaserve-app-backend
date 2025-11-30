// const admin = require("firebase-admin");
// const path = require("path");

// let initialized = false;

// function initializeFirebaseAdmin() {
//   if (initialized) {
//     return admin;
//   }
//   try {
//     const serviceAccountPath = process.env.FIREBASE_CREDENTIALS_PATH || path.resolve(__dirname, "../../famaserv-firebase-adminsdk.json");

//     admin.initializeApp({
//       credential: admin.credential.cert(require(serviceAccountPath)),
//     });

//     initialized = true;
//     require("../helpers/logger").info("Firebase admin initialized");
//     return admin;
//   } catch (error) {
//     require("../helpers/logger").error("Firebase admin initialization failed", { error: error?.message });
//     throw error;
//   }
// }

// async function sendFcmToToken(params) {
//   try {
//     const {
//       token,
//       title,
//       body,
//       data = {},
//       platform = null, // 'ios', 'android', 'web', or null for auto-detect
//       isProduction = true, // For iOS: true = TestFlight/App Store, false = development
//     } = params;

//     if (!token) {
//       throw new Error("FCM token is required");
//     }

//     const app = initializeFirebaseAdmin();

//     // Build message with platform-specific configurations
//     const message = {
//       token,
//       notification: {
//         title: title || "famaserv",
//         body: body || "",
//       },
//       data: Object.fromEntries(
//         Object.entries(data).map(([k, v]) => [String(k), v == null ? "" : String(v)])
//       ),
//       android: {
//         priority: "high",
//         notification: {
//           sound: "default",
//           channelId: "default",
//         },
//       },
//       apns: {
//         headers: { 
//           "apns-priority": "10",
//         },
//         payload: { 
//           aps: { 
//             sound: "default",
//             badge: 1,
//             "content-available": 1, // Enable silent notifications for background updates
//             // alert is automatically set from notification field above
//           } 
//         },
//       },
//       webpush: {
//         headers: { Urgency: "high" },
//       },
//     };

//     console.log("🚀 Sending FCM message", {
//       tokenSuffix: token?.slice?.(-6),
//       title: message.notification.title,
//       body: message.notification.body,
//       dataKeys: Object.keys(message.data),
//       platform: platform || "auto-detect",
//       isProduction: platform === "ios" ? isProduction : "N/A",
//     });

//     // Firebase Admin SDK automatically uses the correct APNs certificate
//     // Make sure both Development and Production APNs certificates are uploaded in Firebase Console
//     const response = await app.messaging().send(message);
    
//     console.log("✅ FCM sent successfully", {
//       tokenSuffix: token?.slice?.(-6),
//       response,
//       title: message.notification.title,
//     });
    
//     require("../helpers/logger").info("FCM sent successfully", { 
//       tokenSuffix: token?.slice?.(-6), 
//       response,
//       title: message.notification.title,
//       platform,
//     });
    
//     return { success: true, id: response };
//   } catch (error) {
//     console.log("❌ FCM send failed", {
//       tokenSuffix: params.token?.slice?.(-6),
//       error: error?.message,
//       errorCode: error?.code,
//       platform: params.platform,
//       isProduction: params.isProduction,
//     });
    
//     require("../helpers/logger").error("FCM send failed", { 
//       tokenSuffix: params.token?.slice?.(-6),
//       error: error?.message,
//       errorCode: error?.code,
//       platform: params.platform,
//       isProduction: params.isProduction,
//     });
    
//     // Check for specific iOS production APNs errors
//     if (error?.code === "messaging/invalid-apns-credentials" || 
//         error?.code === "messaging/invalid-argument") {
//       console.log("⚠️ APNs credential issue detected - ensure Production APNs certificate is uploaded in Firebase Console");
//     }
    
//     return { success: false, error: error?.message };
//   }
// }

// module.exports = {
//   initializeFirebaseAdmin,
//   sendFcmToToken,
// };


