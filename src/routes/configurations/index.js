var express = require("express");
var router = express.Router();
const ConfigurationsController = require("../../controllers/Configurations/ConfigurationsController");
const Authenticate = require("../../middlewares/authenticate");

router.get(
  "/getAllConfigurations",
  Authenticate,
  ConfigurationsController.getAllConfigurations
);

module.exports = router;
