const express = require("express");
const router = express.Router();
const controller = require("../../controllers/Customer/TokenController");
const authenticate = require("../../middlewares/authenticate");

router.use(authenticate);

router.post("/register", controller.registerToken);
router.delete("/remove", controller.removeToken);
router.put("/fcm", controller.updateFcmToken);
router.get("/list", controller.getTokens);

// Notification settings
router.put("/notifications/toggle", controller.toggleNotifications);
router.get("/notifications/settings", controller.getNotificationSettings);

module.exports = router;
