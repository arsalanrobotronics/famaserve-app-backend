const express = require("express");
const router = express.Router();
const controller = require("../../controllers/Notifications/NotificationController");
const authenticate = require("../../middlewares/authenticate");

router.use(authenticate);

router.get("/getAll", controller.getAll);
router.get("/getById/:id", controller.getById);
router.put("/markAsRead/:id", controller.markAsRead);
router.put("/markAllRead", controller.markAllRead);
router.delete("/remove/:id", controller.remove);

module.exports = router;


