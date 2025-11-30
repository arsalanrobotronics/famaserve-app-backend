var express = require("express");
var router = express.Router();

const CustomerController = require("../../controllers/Customer/CustomerController");

const Authenticate = require("../../middlewares/authenticate");

router.post("/createProfile", Authenticate, CustomerController.createProfile);
router.post("/updateProfilePicture", Authenticate, CustomerController.updateProfilePicture);
router.get("/getProfile/:id?", Authenticate, CustomerController.getProfile);
router.post("/changePassword", Authenticate, CustomerController.changePassword);
// router.get("/dashboardForBuilder", Authenticate, CustomerController.dashboardForBuilder);
// router.get("/dashboardForTradie", Authenticate, CustomerController.dashboardForTradie);

// Tis API is used to create a review for a tradie
// router.post("/createReviewForTradie", Authenticate, CustomerController.createReviewForTradie);

// This API is used to get all reviews by tradie id
// router.get("/getAllReviewsByTradieId/:tradieId", Authenticate, CustomerController.getAllReviewsByTradieId);

// This API is used to get all reviews by logged in user
// router.get("/getAllReviews", Authenticate, CustomerController.getAllReviews);

// ============ SUBSCRIPTION ROUTES ============
// Handle successful subscription payment from frontend
router.post("/subscription/success", Authenticate, CustomerController.subscriptionSuccess);

// Get detailed subscription status
router.get("/subscription-status", Authenticate, CustomerController.getSubscriptionStatus);

// Quick subscription verification
router.post("/verify-subscription", Authenticate, CustomerController.verifySubscription);

module.exports = router;
