
const mongoose = require("mongoose");
const sanitize = require("mongo-sanitize");
const bcrypt = require("bcryptjs");
const ObjectId = mongoose.Types.ObjectId;
const salt = parseInt(process.env.SALT);

const CustomerModel = require("../../models/Customers");
const StripePayment = require('../../models/StripePayments');
const Role = require("../../models/Role");


const {
  sendResponse,
  checkKeysExist,
} = require("../../helpers/utils");

let moduleName = "Customer";
let lang = "english";
let channel = "web";

module.exports = {
  createProfile,
  getProfile,
  changePassword,
  updateProfilePicture,
  dashboardForBuilder,
  dashboardForTradie,
  createReviewForTradie,
  getAllReviewsByTradieId,
  getAllReviews,
  // Subscription methods
  subscriptionSuccess,
  getSubscriptionStatus,
  verifySubscription,
};

async function createProfile(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : lang;

    const userId = request.user?._id;
    const body = request.body;

    // Get user profile to determine role
    const oldProfile = await CustomerModel.findById(userId).populate('roleId').lean();
    if (!oldProfile) {
      return sendResponse(response, "createProfile", 404, 0, "User not found");
    }

    const userRole = oldProfile.roleId?.title;
    if (!userRole) {
      return sendResponse(response, "createProfile", 422, 0, "User role not found");
    }

    // Common location fields required for both roles
    const commonRequiredFields = ["postCode", "street", "suburb", "state"];
    
    // Role-specific required fields
    let roleSpecificRequired = [];
    
    if (userRole === "Provider") {
      // Provider doesn't have mandatory fields beyond location
      roleSpecificRequired = [];
    } else if (userRole === "Customer") {
      // Customer doesn't have mandatory fields beyond location
      roleSpecificRequired = [];
    }

    const requiredFields = [...commonRequiredFields, ...roleSpecificRequired];
    const missingKeys = await checkKeysExist(body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, "createProfile", 422, 0, missingKeys);
    }

    // Check if phoneNumber is being updated and if it already exists with another user
    if (body.phoneNumber && body.phoneNumber !== oldProfile.phoneNumber) {
      const existingUserWithPhone = await CustomerModel.findOne({ 
        phoneNumber: sanitize(body.phoneNumber),
        _id: { $ne: userId }
      });
      if (existingUserWithPhone) {
        return sendResponse(response, "createProfile", 422, 0, "Phone number already exists with another user");
      }
    }

    // Initialize updated profile with common location fields
    const updatedProfile = {
      street: sanitize(body.street),
      postCode: sanitize(body.postCode),
      suburb: sanitize(body.suburb),
      state: sanitize(body.state),
    };

    // Common optional fields for all roles
    const commonOptionalFields = [
      "phoneNumber",
      "intro",
    ];

    commonOptionalFields.forEach((field) => {
      const value = body[field];
      if (value !== undefined) {
        if (value === "" || value === null) {
          updatedProfile[field] = null;
        } else {
          updatedProfile[field] = sanitize(value);
        }
      }
    });

    // Handle avatar
    if (body.avatar?.fileName) {
      updatedProfile.avatar = sanitize(body.avatar.fileName);
    }

    // Role-specific field handling
    if (userRole === "Provider") {
      // Provider specific fields
      
      // Service History (string)
      if (body.serviceHistory !== undefined) {
        updatedProfile.serviceHistory = body.serviceHistory ? sanitize(body.serviceHistory) : null;
      }

      // Services Offered (array of ObjectIds)
      if (body.servicesOffered !== undefined) {
        if (Array.isArray(body.servicesOffered)) {
          updatedProfile.servicesOffered = body.servicesOffered.map(id => 
            mongoose.Types.ObjectId.isValid(id) ? new ObjectId(id) : null
          ).filter(id => id !== null);
        } else {
          updatedProfile.servicesOffered = [];
        }
      }

      // Review Images (array of strings - image URLs)
      if (body.reviewImages !== undefined) {
        if (Array.isArray(body.reviewImages)) {
          updatedProfile.reviewImages = body.reviewImages.map(sanitize);
        } else {
          updatedProfile.reviewImages = [];
        }
      }

      // Certificates (array of strings - file URLs)
      if (body.certificates !== undefined) {
        if (Array.isArray(body.certificates)) {
          updatedProfile.certificationFiles = body.certificates.map(sanitize);
        } else {
          updatedProfile.certificationFiles = [];
        }
      }

    } else if (userRole === "Customer") {
      // Customer specific fields
      
      // Gender (enum)
      const validGenders = ["male", "female", "other"];
      if (body.gender !== undefined) {
        if (validGenders.includes(body.gender)) {
          updatedProfile.gender = sanitize(body.gender);
        } else {
          updatedProfile.gender = "";
        }
      }

      // Preferences (array of ObjectIds - category IDs)
      if (body.preferences !== undefined) {
        if (Array.isArray(body.preferences)) {
          updatedProfile.preferences = body.preferences.map(id => 
            mongoose.Types.ObjectId.isValid(id) ? new ObjectId(id) : null
          ).filter(id => id !== null);
        } else {
          updatedProfile.preferences = [];
        }
      }
    }

    // Calculate profile completion percentage
    let profilePercentage = 0;
    const percentageMapCommon = [
      { field: "street", points: 15 },
      { field: "postCode", points: 15 },
      { field: "suburb", points: 10 },
      { field: "state", points: 10 },
      { field: "phoneNumber", points: 10 },
      { field: "intro", points: 10 },
    ];

    const percentageMapProvider = [
      ...percentageMapCommon,
      { field: "serviceHistory", points: 10 },
      { field: "servicesOffered", type: "array", points: 15 },
      { field: "reviewImages", type: "array", points: 5 },
      { field: "certificates", type: "array", points: 10 },
    ];

    const percentageMapCustomer = [
      ...percentageMapCommon,
      { field: "gender", points: 15 },
      { field: "preferences", type: "array", points: 15 },
    ];

    const percentageMap = userRole === "Provider" ? percentageMapProvider : percentageMapCustomer;

    for (const item of percentageMap) {
      const value = body[item.field];

      if (item.type === "array") {
        if (Array.isArray(value) && value.length > 0) {
          profilePercentage += item.points;
        }
      } else {
        if (value && value !== "") {
          profilePercentage += item.points;
        }
      }
    }

    updatedProfile.profilePercentage = profilePercentage;
    updatedProfile.updatedAt = new Date();

    const result = await CustomerModel.findByIdAndUpdate(
      userId,
      { $set: updatedProfile },
      { new: true }
    ).populate('roleId');

    return sendResponse(
      response,
      "createProfile",
      200,
      1,
      "Profile updated successfully",
      result
    );
  } catch (error) {
    console.log("Create profile process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function getProfile(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const userId = request.params.id || request.user?._id;
    const user = await CustomerModel.findById(userId).lean();

    if (!user) {
      return sendResponse(response, "getProfile", 422, 0, "User not found");
    }

    // Get average stars for reviews received by this user
    const reviewsAggregate = await ReviewModel.aggregate([
      {
        $match: {
          customerId: new ObjectId(userId),
          status: "active"
        }
      },
      {
        $group: {
          _id: null,
          averageStars: { $avg: "$stars" },
          totalReviews: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          averageStars: { $round: ["$averageStars", 2] },
          totalReviews: 1
        }
      }
    ]).exec();

    const reviewsData = reviewsAggregate.length > 0 ? reviewsAggregate[0] : { averageStars: 0, totalReviews: 0 };

    // Add reviews data to user profile
    const userWithReviews = {
      ...user,
      reviews: {
        averageStars: reviewsData.averageStars,
        totalReviews: reviewsData.totalReviews
      }
    };

    return sendResponse(
      response,
      "getProfile",
      200,
      1,
      "User Profile fetched successfully",
      userWithReviews
    );
  } catch (error) {
    console.log("Get profile process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function changePassword(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const userId = request.user?._id;
    const body = request.body;

    const requiredFields = ["oldPassword", "newPassword"];
    const missingKeys = await checkKeysExist(body, requiredFields);
    if (missingKeys) {
      return sendResponse(response, "changePassword", 422, 0, missingKeys);
    }

    // Validate new password length
    if (body.newPassword.length < 6) {
      return sendResponse(
        response,
        "changePassword",
        422,
        0,
        "New password must be at least 6 characters long"
      );
    }

    // Find user by ID
    const user = await CustomerModel.findById(userId);
    if (!user) {
      return sendResponse(response, "changePassword", 404, 0, "User not found");
    }

    // Check if user has a password (not social login)
    if (!user.password) {
      return sendResponse(
        response,
        "changePassword",
        422,
        0,
        "Password change not allowed for social login users"
      );
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(body.oldPassword, user.password);
    if (!isOldPasswordValid) {
      return sendResponse(
        response,
        "changePassword",
        422,
        0,
        "Current password is incorrect"
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(body.newPassword, salt);

    // Update password
    const updatedUser = await CustomerModel.findByIdAndUpdate(
      userId,
      { 
        password: hashedNewPassword,
        updatedAt: new Date()
      },
      { new: true }
    );

    return sendResponse(
      response,
      "changePassword",
      200,
      1,
      "Password changed successfully",
      { userId: updatedUser._id }
    );
  } catch (error) {
    console.log("Change password process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function updateProfilePicture(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : lang;

    const userId = request.user?._id;
    const body = request.body;

    // Extract avatar from body
    const avatarFileName = body?.avatar?.fileName || (typeof body?.avatar === "string" ? body.avatar : null);
    if (!avatarFileName) {
      return sendResponse(response, "updateProfilePicture", 422, 0, "avatar.fileName is required");
    }

    // Ensure user exists
    const oldProfile = await CustomerModel.findById(userId).lean();
    if (!oldProfile) {
      return sendResponse(response, "updateProfilePicture", 404, 0, "User not found");
    }

    // Update only avatar
    const result = await CustomerModel.findByIdAndUpdate(
      userId,
      { $set: { avatar: sanitize(avatarFileName), updatedAt: new Date() } },
      { new: true }
    );

    return sendResponse(
      response,
      "updateProfilePicture",
      200,
      1,
      "Avatar updated successfully",
      { _id: result._id, avatar: result.avatar }
    );
  } catch (error) {
    console.log("Update profile picture process failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function dashboardForBuilder(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const userId = request?.user?._id;
    if (!userId) {
      return sendResponse(response, "dashboardForBuilder", 401, 0, "Unauthorized");
    }

    // Counts for projects created by this builder
    const [publishedCount, inProgressCount] = await Promise.all([
      ProjectModel.countDocuments({ createdBy: userId, projectStatus: "published" }),
      ProjectModel.countDocuments({ createdBy: userId, projectStatus: "inProgress" }),
    ]);

    // Hired tradies (accepted quotes) where acceptedBy is the logged-in builder
    const hiredQuery = {
      acceptedBy: userId,
      quoteStatus: "accepted",
    };

    // latest: restricted to 10 most recent
    // totalCount: counts ALL matching accepted quotes (NOT limited to 10)
    const [hiredTradiesLatest, hiredTradiesCount] = await Promise.all([
      QuoteModel.find(hiredQuery)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({
          path: "quotedBy",
          select: "fullName email phoneNumber avatar companyName",
        })
        .select("projectId trades quotedAmount createdAt quotedBy")
        .lean(),
      // NOTE: This count is from the full dataset, not from the above limited 10
      QuoteModel.countDocuments(hiredQuery),
    ]);

    // Map to desired response structure
    const hiredTradies = (hiredTradiesLatest || []).map((q) => ({
      tradie: q.quotedBy
        ? {
            _id: q.quotedBy._id,
            fullName: q.quotedBy.fullName || null,
            email: q.quotedBy.email || null,
            phoneNumber: q.quotedBy.phoneNumber || null,
            avatar: q.quotedBy.avatar || null,
            companyName: q.quotedBy.companyName || null,
          }
        : null,
      projectId: q.projectId,
      trades: q.trades,
      quotedAmount: q.quotedAmount || null,
      createdAt: q.createdAt,
    }));

    const respData = {
      projects: {
        publishedCount,
        inProgressCount,
      },
      hiredTradies: {
        latest: hiredTradies,
        totalCount: hiredTradiesCount,
      },
    };

    return sendResponse(
      response,
      "dashboardForBuilder",
      200,
      1,
      "Dashboard data fetched successfully",
      respData
    );
  } catch (error) {
    console.log("Dashboard for builder failed:", error);
    return sendResponse(
      response,
      "dashboardForBuilder",
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function dashboardForTradie(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;

    const userId = request?.user?._id;
    if (!userId) {
      return sendResponse(response, "dashboardForTradie", 401, 0, "Unauthorized");
    }

    // Counts from quotes model for this tradie (quotedBy)
    const quotedByQuery = { quotedBy: userId };
    const [jobsAppliedCount, pendingCount, inProgressCount] = await Promise.all([
      // Total quotes created by tradie
      QuoteModel.countDocuments(quotedByQuery),
      // Pending = initiated
      QuoteModel.countDocuments({ ...quotedByQuery, quoteStatus: "initiated" }),
      // In progress = accepted
      QuoteModel.countDocuments({ ...quotedByQuery, quoteStatus: "accepted" }),
    ]);

    const respData = {
      quotes: {
        jobsAppliedCount,
        pendingCount,
        inProgressCount,
      },
    };

    return sendResponse(
      response,
      "dashboardForTradie",
      200,
      1,
      "Dashboard data fetched successfully",
      respData
    );
  } catch (error) {
    console.log("Dashboard for tradie failed:", error);
    return sendResponse(
      response,
      "dashboardForTradie",
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function createReviewForTradie(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const userId = request?.user?._id;
    const payload = request.body;

    // Validate required fields
    const requiredFields = ["tradieId", "projectId", "tradeId", "stars", "description"];
    const missingKeys = await checkKeysExist(payload, requiredFields);
    if (missingKeys) {
      return sendResponse(response, "Create Review", 422, 0, missingKeys);
    }

    // Validate ObjectId formats
    if (!mongoose.Types.ObjectId.isValid(payload.tradieId)) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Invalid tradie ID format"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(payload.projectId)) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Invalid project ID format"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(payload.tradeId)) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Invalid trade ID format"
      );
    }

    // Validate stars (1-5)
    if (payload.stars < 1 || payload.stars > 5) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Stars must be between 1 and 5"
      );
    }

    // Check if project exists and belongs to the logged-in user
    const project = await ProjectModel.findOne({
      _id: new ObjectId(payload.projectId),
      createdBy: userId
    });

    if (!project) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Project not found or you don't have permission to review this project"
      );
    }

    // Check if the specific trade exists in the project and has status "completed"
    const trade = project.trades.find(t => t.tradeId.toString() === payload.tradeId);
    if (!trade) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Trade not found in this project"
      );
    }

    if (trade.tradeStatus !== "completed") {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Review can only be created for completed trades"
      );
    }

    // Check if tradie exists
    const tradie = await CustomerModel.findById(payload.tradieId);
    if (!tradie) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Tradie not found"
      );
    }

    // Check if review already exists for this project, trade, and tradie combination
    const existingReview = await ReviewModel.findOne({
      projectId: new ObjectId(payload.projectId),
      tradeId: new ObjectId(payload.tradeId),
      customerId: new ObjectId(payload.tradieId),
      createdBy: userId
    });

    if (existingReview) {
      return sendResponse(
        response,
        "Create Review",
        422,
        0,
        "Review already exists for this tradie, project, and trade combination"
      );
    }

    // Create review data
    const reviewData = {
      stars: payload.stars,
      description: sanitize(payload.description),
      projectId: new ObjectId(payload.projectId),
      tradeId: new ObjectId(payload.tradeId),
      customerId: new ObjectId(payload.tradieId),
      status: "active",
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create the review
    const review = await ReviewModel.create(reviewData);

    return sendResponse(
      response,
      "Create Review",
      200,
      1,
      "Review created successfully",
      review
    );

  } catch (error) {
    console.log("Create review for tradie failed:", error);
    return sendResponse(
      response,
      "Create Review",
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

async function getAllReviewsByTradieId(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const { tradieId } = request.params;
    const params = request.query;

    // Validate tradieId format
    if (!mongoose.Types.ObjectId.isValid(tradieId)) {
      return sendResponse(
        response,
        "Get Reviews",
        422,
        0,
        "Invalid tradie ID format"
      );
    }

    // Check if tradie exists
    const tradie = await CustomerModel.findById(tradieId);
    if (!tradie) {
      return sendResponse(
        response,
        "Get Reviews",
        422,
        0,
        "Tradie not found"
      );
    }

    let page = params.startAt ? parseInt(params.startAt) : 1;
    let perPage = params.perPage ? parseInt(params.perPage) : 50;
    let sortBy = { createdAt: -1 };

    const $aggregate = [];

    // Match reviews for this tradie
    $aggregate.push({
      $match: {
        customerId: new ObjectId(tradieId),
        status: "active"
      }
    });

    // Lookup creator details (builder who created the review)
    $aggregate.push({
      $lookup: {
        from: "customers",
        localField: "createdBy",
        foreignField: "_id",
        as: "reviewerDetails",
      }
    });

    // Lookup project details
    $aggregate.push({
      $lookup: {
        from: "projects",
        localField: "projectId",
        foreignField: "_id",
        as: "projectDetails",
      }
    });

    // Lookup trade details
    $aggregate.push({
      $lookup: {
        from: "trades",
        localField: "tradeId",
        foreignField: "_id",
        as: "tradeDetails",
      }
    });

    // Calculate average stars
    $aggregate.push({
      $group: {
        _id: null,
        reviews: { $push: "$$ROOT" },
        averageStars: { $avg: "$stars" },
        totalReviews: { $sum: 1 }
      }
    });

    $aggregate.push({
      $project: {
        _id: 0,
        reviews: 1,
        averageStars: { $round: ["$averageStars", 2] },
        totalReviews: 1
      }
    });

    let data = await ReviewModel.aggregate($aggregate).exec();

    if (data.length === 0) {
      const respData = {
        reviews: [],
        averageStars: 0,
        totalReviews: 0,
        pagination: {
          total: 0,
          perPage: perPage,
          current: page,
          first: 1,
          last: 1,
          next: "",
        },
      };

      return sendResponse(
        response,
        "Get Reviews",
        200,
        1,
        "Reviews fetched successfully",
        respData
      );
    }

    const result = data[0];
    let reviews = result.reviews || [];

    // Format reviews data
    reviews = reviews.map((review) => {
      const reviewer = review.reviewerDetails[0];
      const project = review.projectDetails[0];
      const trade = review.tradeDetails[0];

      return {
        _id: review._id,
        stars: review.stars,
        description: review.description,
        createdAt: review.createdAt,
        reviewer: reviewer ? {
          _id: reviewer._id,
          fullName: reviewer.fullName || null,
          companyName: reviewer.companyName || null,
          email: reviewer.email || null,
          phoneNumber: reviewer.phoneNumber || null,
          avatar: reviewer.avatar || null,
        } : null,
        project: project ? {
          _id: project._id,
          title: project.title || null,
        } : null,
        trade: trade ? {
          _id: trade._id,
          title: trade.title || null,
          type: trade.type || null,
        } : null,
      };
    });

    // Apply pagination to formatted reviews
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    const total = reviews.length;

    const respData = {
      reviews: paginatedReviews,
      averageStars: result.averageStars || 0,
      totalReviews: result.totalReviews || 0,
      pagination: {
        total: total,
        perPage: perPage,
        current: page,
        first: 1,
        last: total ? Math.ceil(total / perPage) : 1,
        next: page < Math.ceil(total / perPage) ? page + 1 : "",
      },
    };

    return sendResponse(
      response,
      "Get Reviews",
      200,
      1,
      "Reviews fetched successfully",
      respData
    );

  } catch (error) {
    console.log("Get all reviews by tradie id failed:", error);
    return sendResponse(
      response,
      "Get Reviews",
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}
async function getAllReviews(request, response) {
  try {
    lang = request.header("lang") ? request.header("lang") : lang;
    channel = request.header("channel") ? request.header("channel") : channel;
    const userId = request?.user?._id;
    const params = request.query;

    if (!userId) {
      return sendResponse(response, "Get Reviews", 401, 0, "Unauthorized");
    }

    let page = params.startAt ? parseInt(params.startAt) : 1;
    let perPage = params.perPage ? parseInt(params.perPage) : 50;

    const $aggregate = [];

    // Match reviews received by logged-in user (customerId = userId)
    $aggregate.push({
      $match: {
        customerId: userId,
        status: "active"
      }
    });

    // Lookup reviewer details (createdBy - the builder who gave the review)
    $aggregate.push({
      $lookup: {
        from: "customers",
        localField: "createdBy",
        foreignField: "_id",
        as: "reviewerDetails",
      }
    });

    // Lookup project details
    $aggregate.push({
      $lookup: {
        from: "projects",
        localField: "projectId",
        foreignField: "_id",
        as: "projectDetails",
      }
    });

    // Lookup trade details
    $aggregate.push({
      $lookup: {
        from: "trades",
        localField: "tradeId",
        foreignField: "_id",
        as: "tradeDetails",
      }
    });

    // Calculate average stars
    $aggregate.push({
      $group: {
        _id: null,
        reviews: { $push: "$$ROOT" },
        averageStars: { $avg: "$stars" },
        totalReviews: { $sum: 1 }
      }
    });

    $aggregate.push({
      $project: {
        _id: 0,
        reviews: 1,
        averageStars: { $round: ["$averageStars", 2] },
        totalReviews: 1
      }
    });

    let data = await ReviewModel.aggregate($aggregate).exec();

    if (data.length === 0) {
      const respData = {
        reviews: [],
        averageStars: 0,
        totalReviews: 0,
        pagination: {
          total: 0,
          perPage: perPage,
          current: page,
          first: 1,
          last: 1,
          next: "",
        },
      };

      return sendResponse(
        response,
        "Get Reviews",
        200,
        1,
        "Reviews fetched successfully",
        respData
      );
    }

    const result = data[0];
    let reviews = result.reviews || [];

    // Format reviews data
    reviews = reviews.map((review) => {
      const reviewer = review.reviewerDetails[0];
      const project = review.projectDetails[0];
      const trade = review.tradeDetails[0];

      return {
        _id: review._id,
        stars: review.stars,
        description: review.description,
        createdAt: review.createdAt,
        reviewer: reviewer ? {
          _id: reviewer._id,
          fullName: reviewer.fullName || null,
          companyName: reviewer.companyName || null,
          email: reviewer.email || null,
          phoneNumber: reviewer.phoneNumber || null,
          avatar: reviewer.avatar || null,
        } : null,
        project: project ? {
          _id: project._id,
          title: project.title || null,
        } : null,
        trade: trade ? {
          _id: trade._id,
          title: trade.title || null,
          type: trade.type || null,
        } : null,
      };
    });

    // Apply pagination to formatted reviews
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const paginatedReviews = reviews.slice(startIndex, endIndex);

    const total = reviews.length;

    const respData = {
      reviews: paginatedReviews,
      averageStars: result.averageStars || 0,
      totalReviews: result.totalReviews || 0,
      pagination: {
        total: total,
        perPage: perPage,
        current: page,
        first: 1,
        last: total ? Math.ceil(total / perPage) : 1,
        next: page < Math.ceil(total / perPage) ? page + 1 : "",
      },
    };

    return sendResponse(
      response,
      "Get Reviews",
      200,
      1,
      "Reviews fetched successfully",
      respData
    );

  } catch (error) {
    console.log("Get all reviews failed:", error);
    return sendResponse(
      response,
      "Get Reviews",
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

// ============ SUBSCRIPTION METHODS ============

/**
 * Handle successful subscription payment from frontend
 */
async function subscriptionSuccess(request, response) {
  try {
    channel = request.header("channel") ? request.header("channel") : channel;
    lang = request.header("lang") ? request.header("lang") : lang;
    
    const {
      userId,
      userEmail,
      userName,
      userRole,
      userPhone,
      stripeSessionId,
      paymentStatus,
      subscriptionType,
      amount,
      currency,
      subscribedAt,
      source,
      priceId
    } = request.body;

    // Validate required fields
    if (!userId || !stripeSessionId) {
      return sendResponse(
        response,
        moduleName,
        400,
        0,
        "Missing required fields: userId, stripeSessionId"
      );
    }

    // Initialize Stripe with secret key
    let session, subscription, stripeCustomerId, subscriptionId;
    let useStripeData = false;
    let appliedCouponCode = null;
    let couponDiscount = null;
    
    // Check if Stripe secret key is configured
    console.log('Checking Stripe configuration...');
    console.log('STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
    
    if (process.env.STRIPE_SECRET_KEY) {
      try {
        console.log('Initializing Stripe with secret key...');
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        
        console.log('Retrieving Stripe session:', stripeSessionId);
        // Retrieve and verify the checkout session with expanded data
        session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
          expand: ['total_details.breakdown']
        });
        console.log('✅ Successfully retrieved Stripe session:', session.id, 'Status:', session.payment_status);
        
        // Extract coupon code from session metadata
        if (session.metadata && session.metadata.couponCode) {
          appliedCouponCode = session.metadata.couponCode;
          console.log('Coupon code applied:', appliedCouponCode);
        }
        
        // Extract discount amount from session - try multiple sources
        if (session.total_details && session.total_details.amount_discount) {
          couponDiscount = session.total_details.amount_discount;
          console.log('Discount amount from total_details:', couponDiscount);
        } else if (session.amount_discount) {
          couponDiscount = session.amount_discount;
          console.log('Discount amount from session:', couponDiscount);
        }
        
        // Log full session for debugging
        console.log('Full session data:', JSON.stringify({
          metadata: session.metadata,
          total_details: session.total_details,
          amount_discount: session.amount_discount,
          discount: session.discount
        }));
        
        if (session.payment_status !== 'paid') {
          return sendResponse(
            response,
            moduleName,
            400,
            0,
            "Payment not completed"
          );
        }
        
        // Get the subscription from the session
        subscriptionId = session.subscription;
        if (subscriptionId) {
          // Retrieve the subscription details
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
          stripeCustomerId = subscription.customer;
          useStripeData = true;
          
          console.log('Retrieved Stripe subscription:', subscriptionId, 'Customer:', stripeCustomerId, 'Status:', subscription.status);
        } else {
          console.log('No subscription found in session, using frontend data');
        }
        
      } catch (stripeError) {
        console.error('❌ Stripe API Error:', stripeError.message);
        console.error('Stripe Error Details:', {
          type: stripeError.type,
          code: stripeError.code,
          statusCode: stripeError.statusCode,
          raw: stripeError.raw
        });
        console.log('⚠️ Falling back to frontend data');
        // Don't return error, just use frontend data as fallback
      }
    } else {
      console.log('⚠️ Stripe secret key not configured in environment variables');
      console.log('Using frontend data as fallback');
    }

    // Find the user
    const user = await CustomerModel.findById(userId);
    if (!user) {
      return sendResponse(
        response,
        moduleName,
        404,
        0,
        "User not found"
      );
    }

    // Check if this session has already been processed to prevent duplicates
    const existingPayment = await StripePayment.findOne({ 
      stripeSessionId: stripeSessionId // Using sessionId as unique identifier
    });
    
    if (existingPayment) {
      console.log(`Duplicate subscription request detected for session ${stripeSessionId}`);
      return sendResponse(
        response,
        moduleName,
        200,
        1,
        "Subscription already processed",
        {
          subscriptionStatus: 'active',
          subscriptionEndDate: user.subscriptionEndDate,
          nextBillingDate: user.nextBillingDate,
          amount: user.subscriptionAmount,
          currency: user.subscriptionCurrency
        }
      );
    }

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    const nextBilling = new Date();
    
    if (subscriptionType === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
      nextBilling.setMonth(nextBilling.getMonth() + 1);
    } else if (subscriptionType === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
      nextBilling.setFullYear(nextBilling.getFullYear() + 1);
    }

    // Update user with subscription data
    let updateData;
    
    if (useStripeData && subscription) {
      // Use real Stripe data
      updateData = {
        subscriptionStatus: subscription.status,
        stripeCustomerId: stripeCustomerId,
        subscriptionId: subscriptionId,
        stripeSessionId: stripeSessionId,
        subscriptionStartDate: new Date(subscription.current_period_start * 1000),
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        subscriptionAmount: subscription.items.data[0].price.unit_amount,
        subscriptionCurrency: subscription.items.data[0].price.currency,
        subscriptionType: subscription.items.data[0].price.recurring.interval === 'month' ? 'monthly' : 'yearly',
        stripePriceId: subscription.items.data[0].price.id,
        lastPaymentDate: new Date(subscription.current_period_start * 1000),
        nextBillingDate: new Date(subscription.current_period_end * 1000),
        appliedCouponCode: appliedCouponCode,
        couponDiscount: couponDiscount,
        updatedAt: new Date()
      };
    } else {
      // Use frontend data as fallback
      updateData = {
        subscriptionStatus: 'active',
        stripeCustomerId: stripeCustomerId || `temp_customer_${userId}`,
        subscriptionId: subscriptionId || stripeSessionId,
        stripeSessionId: stripeSessionId,
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        subscriptionAmount: amount || 4999,
        subscriptionCurrency: currency || 'aud',
        subscriptionType: subscriptionType || 'monthly',
        stripePriceId: priceId,
        lastPaymentDate: startDate,
        nextBillingDate: nextBilling,
        appliedCouponCode: appliedCouponCode,
        couponDiscount: couponDiscount,
        updatedAt: new Date()
      };
    }

    console.log('Updating user with subscription data:', {
      useStripeData,
      appliedCouponCode,
      couponDiscount,
      subscriptionStatus: updateData.subscriptionStatus
    });
    
    await CustomerModel.findByIdAndUpdate(userId, updateData);
    console.log('User updated successfully with coupon data:', {
      appliedCouponCode: updateData.appliedCouponCode,
      couponDiscount: updateData.couponDiscount
    });

    // Create StripePayment record
    let stripePaymentData;
    
    if (useStripeData && subscription) {
      // Use real Stripe data
      stripePaymentData = {
        customerId: user._id,
        email: user.email || userEmail,
        stripeCustomerId: stripeCustomerId,
        subscriptionId: subscriptionId,
        stripeSessionId: stripeSessionId,
        amount: subscription.items.data[0].price.unit_amount,
        currency: subscription.items.data[0].price.currency,
        status: subscription.status,
        periodStart: new Date(subscription.current_period_start * 1000),
        periodEnd: new Date(subscription.current_period_end * 1000)
      };
    } else {
      // Use frontend data as fallback
      stripePaymentData = {
        customerId: user._id,
        email: user.email || userEmail,
        stripeCustomerId: updateData.stripeCustomerId,
        subscriptionId: updateData.subscriptionId,
        stripeSessionId: stripeSessionId,
        amount: amount || 4999,
        currency: currency || 'aud',
        status: 'active',
        periodStart: startDate,
        periodEnd: endDate
      };
    }
    
    console.log('Creating StripePayment record with data:', stripePaymentData);
    const stripePayment = new StripePayment(stripePaymentData);
    await stripePayment.save();
    console.log('StripePayment record saved successfully:', stripePayment._id);

    console.log(`Subscription activated for user ${userId}:`, {
      sessionId: stripeSessionId,
      amount: updateData.subscriptionAmount,
      currency: updateData.subscriptionCurrency,
      status: 'active'
    });

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Subscription activated successfully",
      {
        subscriptionStatus: 'active',
        subscriptionEndDate: endDate,
        nextBillingDate: nextBilling,
        amount: updateData.subscriptionAmount,
        currency: updateData.subscriptionCurrency
      }
    );
  } catch (error) {
    console.log("Subscription success failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

/**
 * Get detailed subscription status for a user
 */
async function getSubscriptionStatus(request, response) {
  try {
    channel = request.header("channel") ? request.header("channel") : channel;
    lang = request.header("lang") ? request.header("lang") : lang;
    
    const userId = request.user._id;

    const user = await CustomerModel.findById(userId);
    if (!user) {
      return sendResponse(
        response,
        moduleName,
        404,
        0,
        "User not found"
      );
    }

    // Check and update subscription expiry
    let currentStatus = user.subscriptionStatus || 'inactive';
    let isActive = currentStatus === 'active' || currentStatus === 'trialing';
    
    // Calculate days until expiry and check if expired
    let daysUntilExpiry = null;
    if (user.subscriptionEndDate) {
      const now = new Date();
      const endDate = new Date(user.subscriptionEndDate);
      const diffTime = endDate.getTime() - now.getTime();
      daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // If subscription is expired but status is still active, update it
      if (now > endDate && (currentStatus === 'active' || currentStatus === 'trialing')) {
        console.log(`Subscription expired for user ${userId}, updating status`);
        await CustomerModel.findByIdAndUpdate(userId, { 
          subscriptionStatus: 'past_due',
          updatedAt: new Date()
        });
        currentStatus = 'past_due';
        isActive = false;
      }
    }

    const subscriptionData = {
      status: currentStatus,
      isActive: isActive,
      customerId: user.stripeCustomerId,
      subscriptionId: user.subscriptionId,
      currentPeriodEnd: user.subscriptionEndDate,
      nextBillingDate: user.nextBillingDate,
      amount: user.subscriptionAmount,
      currency: user.subscriptionCurrency || 'aud',
      subscriptionType: user.subscriptionType || 'monthly',
      daysUntilExpiry: daysUntilExpiry,
      lastPaymentDate: user.lastPaymentDate
    };

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Subscription status retrieved",
      subscriptionData
    );
  } catch (error) {
    console.log("Get subscription status failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}

/**
 * Quick subscription verification
 */
async function verifySubscription(request, response) {
  try {
    channel = request.header("channel") ? request.header("channel") : channel;
    lang = request.header("lang") ? request.header("lang") : lang;
    
    const userId = request.user._id;

    const user = await CustomerModel.findById(userId);
    if (!user) {
      return sendResponse(
        response,
        moduleName,
        404,
        0,
        "User not found"
      );
    }

    // Check if subscription is expired
    let currentStatus = user.subscriptionStatus || 'inactive';
    let hasSubscription = currentStatus === 'active' || currentStatus === 'trialing';
    
    // Check expiration date
    if (user.subscriptionEndDate && hasSubscription) {
      const now = new Date();
      const endDate = new Date(user.subscriptionEndDate);
      
      if (now > endDate) {
        console.log(`Subscription expired for user ${userId} during verification`);
        await CustomerModel.findByIdAndUpdate(userId, { 
          subscriptionStatus: 'past_due',
          updatedAt: new Date()
        });
        currentStatus = 'past_due';
        hasSubscription = false;
      }
    }

    return sendResponse(
      response,
      moduleName,
      200,
      1,
      "Subscription verified",
      {
        hasSubscription,
        status: currentStatus,
        subscriptionActive: hasSubscription
      }
    );
  } catch (error) {
    console.log("Verify subscription failed:", error);
    return sendResponse(
      response,
      moduleName,
      500,
      0,
      "Something went wrong, please try again later."
    );
  }
}
