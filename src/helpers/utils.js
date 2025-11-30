const AccessToken = require("../models/OauthToken");
const RefreshToken = require("../models/OauthRefreshToken");
const Role = require("../models/Role");
const jwt = require("jsonwebtoken");
const moment = require("moment");
const sanitize = require("mongo-sanitize");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleIdToken(idToken) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const  googleResponse = ticket.getPayload();
  console.log("Provider response:", googleResponse);
  return googleResponse
}

async function verifyAppleIdToken(idToken) {
  return await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
    ignoreExpiration: false,
  });
}

function sendResponse(response, module, code, status, message, data = {}) {
  response.status(code).json({
    status: status ? true : false,
    message: message,
    heading: module,
    data: data,
  });
}
function checkKeysExist(obj, keysArray) {
  for (const key of keysArray) {
    if (!obj.hasOwnProperty(key)) {
      return `${key} not found in the object.`;
    }
  }
  return null; // All keys exist
}
async function generateToken(data) {
  let params = data;

  // var tokenExpirationDate = moment().add(1, "hour");
   // Change from 1 hour to 100 days
  var tokenExpirationDate = moment().add(100, "days");

  // var refreshTokenExpirationDate = moment().add(5, "hours");

   // Change from 5 hours to 7 days (1 week)
   var refreshTokenExpirationDate = moment().add(7, "days");

  let accessToken = new AccessToken();
  accessToken.name = "Token";
  accessToken.userId = params.user._id;
  accessToken.clientId = params.clientId;
  accessToken.scopes = params.permissions;
  accessToken.revokedAt = null;
  accessToken.expiresAt = tokenExpirationDate;
  let accessTokenResponse = await accessToken.save();
  if (accessTokenResponse) {

    const refreshToken = jwt.sign(
      {
        userId: params.user._id,
        clientId: params.clientId,
        clientSecret: process.env.CLIENT_SECRET,
        scopes: params.permissions,
      },
      process.env.CLIENT_SECRET,
      { expiresIn: "7d" }
    );

    let refreshTokenRecord = new RefreshToken();
    refreshTokenRecord.accessTokenId = accessTokenResponse._id;
    refreshTokenRecord.token = refreshToken; // Store the actual JWT token
    refreshTokenRecord.revokedAt = null;
    refreshTokenRecord.expiredAt = refreshTokenExpirationDate;
    let refreshTokenResponse = await refreshTokenRecord.save();

    const token = jwt.sign(
      {
        userId: params.user._id,
        accessTokenId: accessTokenResponse._id,
        clientId: params.clientId,
        clientSecret: process.env.CLIENT_SECRET,
        scopes: params.permissions,
      },
      process.env.CLIENT_SECRET,
      { expiresIn: "1h" }
    );
    return {
      accessToken: token,
      refreshToken: refreshToken,
      tokenExpirationDate: tokenExpirationDate,
    };
  } else {
    return false;
  }
}

async function sanitizeObject(obj) {
  const sanitizedObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === "object" && value !== null) {

        sanitizedObj[key] = Array.isArray(value)
          ? value.map((item) => sanitizeObject(item))
          : sanitizeObject(value);
      } else {

        sanitizedObj[key] = sanitize(value);
      }
    }
  }
  return sanitizedObj;
}

async function setUserResponse(data, setToken = true) {
  let role = await Role.findOne({
    _id: sanitize(data.roleId),
  });

  let token = null;
  if (setToken) {

    let requestParams = {
      user: data,
      clientId: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      permissions: role?.permissions,
    };
    token = await generateToken(requestParams);
  }

  let respData = {
    accessToken: setToken ? token.accessToken : null,
    refreshToken: setToken ? token.refreshToken : null,
    expiresIn: setToken ? token.tokenExpirationDate : null,



    isPhoneNumberValidated: data.isPhoneNumberValidated
      ? data.isPhoneNumberValidated
      : false,
          isEmailValidated: data.isEmailValidated
      ? data.isEmailValidated
      : false,

    user: {
      _id: data._id,
      fullName: data.fullName,
      roleId: data.roleId,
      email: data.email,


      phoneNumber: data.phoneNumber,
      roleName: role.title,
      image: data.image,
      notifications: data.notifications,
      preferredLanguage: data.preferredLanguage
        ? data.preferredLanguage
        : "english",
      createdAt: data.createdAt,
      loginAt: data.loginAt,
      isManuallyCreated: data.isManuallyCreated,
      isPasswordCreated: data.isPasswordCreated,
      // Subscription information with expiry check
      subscriptionStatus: (() => {
        let currentStatus = data.subscriptionStatus || 'inactive';
        // Check if subscription is expired
        if (data.subscriptionEndDate && (currentStatus === 'active' || currentStatus === 'trialing')) {
          const now = new Date();
          const endDate = new Date(data.subscriptionEndDate);
          if (now > endDate) {
            currentStatus = 'past_due';
          }
        }
        return currentStatus;
      })(),
      subscriptionActive: (() => {
        let currentStatus = data.subscriptionStatus || 'inactive';
        let isActive = currentStatus === 'active' || currentStatus === 'trialing';
        // Check expiration
        if (data.subscriptionEndDate && isActive) {
          const now = new Date();
          const endDate = new Date(data.subscriptionEndDate);
          if (now > endDate) {
            isActive = false;
          }
        }
        return isActive;
      })(),
      subscriptionEndDate: data.subscriptionEndDate,
      needsSubscription: (() => {
        let currentStatus = data.subscriptionStatus || 'inactive';
        let hasActive = currentStatus === 'active' || currentStatus === 'trialing';
        // Check expiration
        if (data.subscriptionEndDate && hasActive) {
          const now = new Date();
          const endDate = new Date(data.subscriptionEndDate);
          if (now > endDate) {
            hasActive = false;
          }
        }
        return !hasActive;
      })(),
    },
  };

  return respData;
}

function arrayLimit(val) {
  return val.length <= 5;
}

// Email verification function
async function sendEmailVerification(userEmail, userId) {
  try {
    // Generate JWT token with userId, expires in 1 minute
    const verificationToken = jwt.sign(
      {
        userId: userId,
        type: "email_verification",
      },
      process.env.CLIENT_SECRET,
      { expiresIn: "1m" }
    );

    // Create Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.mailtrap.io",
      port: parseInt(process.env.SMTP_PORT) || 2525,
      secure: process.env.SMTP_SECURE === "true" || false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER || "c613f5d46bd8a7",
        pass: process.env.SMTP_PASS || "a999a4c330c4c9",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Read email template
    const templatePath = path.join(__dirname, "emailVerificationTemplate.html");
    let emailTemplate = fs.readFileSync(templatePath, "utf8");

    // Get current year for copyright
    const currentYear = new Date().getFullYear();

    // Construct verification URL with token
    const backendUrl = process.env.BACKEND_URL;
    const verificationUrl = `${backendUrl}/auth/verify-email?token=${verificationToken}`;
    emailTemplate = emailTemplate.replace(/\{\{VERIFICATION_URL\}\}/g, verificationUrl);
    emailTemplate = emailTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);

    // Email options
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "famaserv"}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
      to: userEmail,
      subject: "Verify Your Email Address - famaserv",
      html: emailTemplate,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email verification sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending email verification:", error);
    return { success: false, error: error.message };
  }
}

// Quote rejection email function
async function sendQuoteRejectionEmail(emailData) {
  try {
    const {
      tradieEmail,
      tradieName,
      builderName,
      builderEmail,
      projectTitle,
      projectDescription,
      projectLocation,
      quoteAmount,
      rejectionReason
    } = emailData;

    // Create Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.mailtrap.io",
      port: parseInt(process.env.SMTP_PORT) || 2525,
      secure: process.env.SMTP_SECURE === "true" || false,
      auth: {
        user: process.env.SMTP_USER || "c613f5d46bd8a7",
        pass: process.env.SMTP_PASS || "a999a4c330c4c9",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    // Read email template
    const templatePath = path.join(__dirname, "quoteRejectionTemplate.html");
    let emailTemplate = fs.readFileSync(templatePath, "utf8");

    // Get current year for copyright
    const currentYear = new Date().getFullYear();

    // Replace template placeholders
    emailTemplate = emailTemplate.replace(/\{\{TRADIE_NAME\}\}/g, tradieName || "Tradie");
    emailTemplate = emailTemplate.replace(/\{\{BUILDER_NAME\}\}/g, builderName || "Builder");
    emailTemplate = emailTemplate.replace(/\{\{BUILDER_EMAIL\}\}/g, builderEmail || "N/A");
    emailTemplate = emailTemplate.replace(/\{\{PROJECT_TITLE\}\}/g, projectTitle || "Project");
    emailTemplate = emailTemplate.replace(/\{\{PROJECT_DESCRIPTION\}\}/g, projectDescription || "No description provided");
    emailTemplate = emailTemplate.replace(/\{\{PROJECT_LOCATION\}\}/g, projectLocation || "Location not specified");
    emailTemplate = emailTemplate.replace(/\{\{QUOTE_AMOUNT\}\}/g, quoteAmount ? quoteAmount.toLocaleString() : "N/A");
    emailTemplate = emailTemplate.replace(/\{\{REJECTION_REASON\}\}/g, rejectionReason || "No reason provided");
    emailTemplate = emailTemplate.replace(/\{\{CLIENT_URL\}\}/g, process.env.CLIENT_URL || "http://localhost:3000");
    emailTemplate = emailTemplate.replace(/<span id="currentYear"><\/span>/g, currentYear);

    // Email options
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "famaserv"}" <${process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER}>`,
      to: tradieEmail,
      subject: `Quote Rejected - ${projectTitle || "Project"} | famaserv`,
      html: emailTemplate,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Quote rejection email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending quote rejection email:", error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  verifyGoogleIdToken,
  verifyAppleIdToken,
  arrayLimit,
  sendResponse,
  generateToken,
  sanitizeObject,
  checkKeysExist,
  setUserResponse,
  sendEmailVerification,
  sendQuoteRejectionEmail,
};
