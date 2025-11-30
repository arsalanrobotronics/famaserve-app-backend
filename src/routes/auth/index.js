var express = require("express");
var router = express.Router();

const authController = require("../../controllers/Auth/AuthController");
const Authenticate = require("../../middlewares/authenticate");

router.post("/login", authController.login);
router.post("/signup", authController.signup);
router.post("/logout", Authenticate, authController.logout);
router.post("/logout-all-devices", Authenticate, authController.logoutAllDevices);
router.post("/forgetPassword", authController.forgetPassword);
router.post("/sendOtpToPhone", authController.sendOtpToPhone);
router.post("/verifyOtp", authController.verifyOtp);
router.post("/verifyOtpAndResetPassword", authController.verifyOtpAndResetPassword);
router.post("/refreshToken", authController.refreshToken);
router.get("/verify-email", authController.verifyEmail);

module.exports = router;
